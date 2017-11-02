require('dotenv').config();
const logger = require('./logger');

if (!process.env.ROLLBAR_TOKEN) {
  logger.warn('ROLLBAR_TOKEN is not configured and will not be used.');
} else {
  const Rollbar = require('rollbar');
  const rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);
}

const stations = require('./stations');
const parser = require('./parser');

const DISPLAY_TTL = Number(process.env.DISPLAY_TTL || 60 * 10); // call is considered active at the station for this long
const CALL_HISTORY_LIMIT = Number(process.env.CALL_HISTORY_LIMIT || 20);
const ADDRESS_SUFFIX = process.env.ADDRESS_SUFFIX || '';

const STATIC_MAP_BASE_URL =
  'https://maps.googleapis.com/maps/api/staticmap?&zoom=15&maptype=roadmap&scale=2&key=' +
  process.env.GAPI_KEY; // &zoom=14 - street names, 15 = more street names

const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GAPI_KEY,
  Promise: Promise,
});

const CONNECTION_INVALID = 'A connection attempt was made but that remote address is not registered in the STATIONS list';
const UNCONFIGURED_STATION = 'Not configured to handle calls for that station';
const UNPARSABLE_CALL_DATA = 'Could not parse the incoming data.';

// keep track of inbound calls so we dont duplicate them across displays
const callHistory = [];

let directory = {}; // directory of the STATION entry and socket based on key of ip

/**
 * get socket's remote ip or forwarded ip if the nginx proxy ip
 * @param {*} socket 
 * @return {string} ip
 */
function getRemoteAddr(socket) {
  let addr = socket.conn.remoteAddress;
  if (socket.handshake && socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) {
    addr = socket.handshake.headers['x-forwarded-for'];
  }
  return addr;
}

/**
 * register the connection if valid
 * @param {socket} socket 
 */
function handleConnection(socket) {
  // determine what station they are and if it is a valid connection
  const addr = getRemoteAddr(socket);
  let station = stations.findStationBasedOnIpMatch(addr);
  if (station == null) {
    logger.warn(CONNECTION_INVALID, addr);
    socket.emit('message', CONNECTION_INVALID + ' - ' + addr);
    socket.disconnect(true);
    return;
  }
  logger.verbose('Welcome ' + station.id);
  socket.emit('config', {
    station: station.id,
    mapKey: process.env.GAPI_KEY,
    rollbarToken: process.env.ROLLBAR_TOKEN,
    environment: process.env.NODE_ENV || 'development',
  });

  // keep track of the station and the socket so we can send to them
  directory[addr] = {station, socket, posts: [], since: Date()};

  // if we have any active calls for them, go ahead and send them
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (callHistory[i].callData.station == station.id) {
      let age = ((new Date() - new Date(callHistory[i].receivedDate)) / 1000);
      if (age < DISPLAY_TTL) {
        sendToStation('call', callHistory[i].callData, addr);
        if (callHistory[i].directionsData) {
          sendToStation('directions', callHistory[i].directionsData, addr);
        }
      }
    }
  }

  // if the station asks for call logs, send them their calls
  socket.on('callslog-query', function() {
    logger.verbose('A display at station', station.id, 'requested calls log', addr);
    let calls = callHistory.filter((entry) => entry.callData.station == station.id).reverse();
    sendToStation('callslog', {
      station: station.id,
      calls,
    }, addr);
  });

  socket.on('disconnect', function(reason) {
    logger.verbose('disconnected', addr, reason);
    delete directory[addr];
  });
}

/**
 * send data to the appropriate, connected stations
 *
 * @param {string} type name of event
 * @param {object} data data to send
 * @param {string} ip if specified, only this ip gets it
 */
function sendToStation(type, data, ip) {
  // send the call data to the station it should go to
  const directoryKeys = Object.getOwnPropertyNames(directory);
  for (let i = 0; i < directoryKeys.length; i++) {
    const entry = directory[directoryKeys[i]];
    if (entry.station.id === data.station && (!ip || ip === directoryKeys[i])) {
      const addr = getRemoteAddr(entry.socket);
      logger.verbose('sending ' + type + ' to ' + data.station + ' at ' + addr);
      let post = entry.posts.find((item) => {
        return item.callNumber == data.callNumber;
      });
      if (!post) {
        post = {
          type,
          callNumber: data.callNumber,
        };
        entry.posts.push(post);
      }
      post[type + 'Sent'] = Date();
      entry.socket.emit(type, data, () => {
        // get an ack back on the send, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
        logger.verbose('  the ' + type + ' was acknowledged by station ' +
          data.station + ' at ' + addr);
        post[type + 'Ack'] = Date();
      });
    }
  }
}

/**
 * handle incoming call data from 911 system
 * @param {request} req 
 * @param {response} res 
 * @return {promise}
 */
function handleIncomingData(req, res) {
  // parse the data
  const data = parser.parse(req.body);
  if (!data.valid) {
    logger.warn(UNPARSABLE_CALL_DATA, req.body);
    res.status(400).send(UNPARSABLE_CALL_DATA);
    return;
  }

  const station = stations.findStation(data.station);
  if (!station) {
    logger.warn(UNCONFIGURED_STATION, data.station);
    res.status(200).send(UNCONFIGURED_STATION);
    return;
  }

  // send the call data to the appropriate displays/stations
  sendToStation('call', data);
  // find the call in the history or add to the history
  let call = callHistory.find((entry) => entry.callNumber == data.callNumber);
  if (!call) {
    call = {
      callNumber: data.callNumber,
      callData: data,
      receivedDate: Date(),
    };
    if (callHistory.length >= CALL_HISTORY_LIMIT) {
      callHistory.shift();
    }
    callHistory.push(call);
  } else {
    call.callData = data;
  }

  res.send('OK');

  // if we have a location to map...
  if (data.location) {
    // if we have already successfully mapped it, then send the cached data
    if (call.callData.location && call.callData.location === data.location && call.directionsData) {
      logger.verbose('sending cached directions', data.callNumber);
      call.directionsData.cached = true;
      sendToStation('directions', call.directionsData);
      return new Promise(function(resolve, reject) {
        resolve(call);
      });
    } else {
      // returned as a promise solely for the spec tests
      return lookUpAndSendDirections(station, data, call);
    }
  }
}

/**
 * 
 * @param {*} station 
 * @param {*} data 
 * @param {*} call
 * @return {promise}
 */
function lookUpAndSendDirections(station, data, call) {
  logger.verbose('fetching new directions', data.callNumber);
  // query google for the directions and map and send it and cache it
  const destination = (data.location.match(/[A-Z]/) == null ?
    data.location.split(',').map((s) => Number(s)) : data.location + ADDRESS_SUFFIX);
  return googleMapsClient.directions({
    origin: [station.lat, station.lng],
    destination: destination,
    mode: 'driving',
  }).asPromise()
    .then((response) => {
      // log('google directions api response', response);
      // if we got something and there is a route
      if (response.json.status === 'OK' && response.json.routes[0].legs[0] &&
        // must be less than 100 miles away or else google found some other matching location
        response.json.routes[0].legs[0].distance.value < 160934) {
        let dispatchCode = data.dispatchCode || 'X';
        const markers = '&markers=color:red|label:' + dispatchCode + '|' +
          response.json.routes[0].legs[0].end_location.lat + ',' +
          response.json.routes[0].legs[0].end_location.lng;
        const enc = encodeURIComponent(response.json.routes[0].overview_polyline.points);
        const directions = {
          callNumber: data.callNumber,
          station: data.station,
          response,
          cached: false,
          args: {
            origin: response.json.routes[0].legs[0].start_location,
            destination: response.json.routes[0].legs[0].end_location,
          },
          // centering on the destination to show the ending route in detail
          mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc + markers + '&center=' + destination,
        };
        sendToStation('directions', directions);
        call.directionsData = directions;
        return call;
      }
    })
    .catch((err) => {
      logger.error(err);
      if (rollbar) {
        rollbar.log(err);
      }
    });
}

/**
 * return status info on calls and connections
 * @param {request} req 
 * @param {response} res 
 */
function handleStatus(req, res) {
  const directoryKeys = Object.getOwnPropertyNames(directory)
    .sort((a, b) => directory[a].station.id.localeCompare(directory[b].station.id));
  res.json({
    directory: directoryKeys.map((id) => ({
      id: directory[id].station.id,
      address: getRemoteAddr(directory[id].socket),
      since: directory[id].since,
      posts: directory[id].posts.slice(-10).reverse(),
    })),
    callHistory: callHistory.slice(-CALL_HISTORY_LIMIT).reverse(),
  });
}

module.exports = {
  callHistory,
  directory,
  handleConnection,
  handleIncomingData,
  sendToStation,
  handleStatus,

  // for testing
  CALL_HISTORY_LIMIT,
};
