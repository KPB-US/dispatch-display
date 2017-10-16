require('dotenv').config();
const logger = require('./logger');

if (!process.env.ROLLBAR_TOKEN) {
  logger.warn('ROLLBAR_TOKEN is not configured.');
  process.exit(1);
}

const stations = require('./stations');
const parser = require('./parser');
const Rollbar = require('rollbar');

const DISPLAY_TTL = Number(process.env.DISPLAY_TTL || 60 * 10); // call is considered active at the station for this long
const CALL_HISTORY_LIMIT = Number(process.env.CALL_HISTORY_LIMIT || 20);
const ADDRESS_SUFFIX = process.env.ADDRESS_SUFFIX || '';

const STATIC_MAP_BASE_URL =
  'https://maps.googleapis.com/maps/api/staticmap?&maptype=roadmap&scale=2&key=' +
  process.env.GOOGLE_STATIC_MAPS_API_KEY; // &zoom=14

const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_DIRECTIONS_API_KEY,
  Promise: Promise,
});
const rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);

const CONNECTION_INVALID = 'A connection attempt was made but that remote address is not registered in the STATIONS list';
const UNCONFIGURED_STATION = 'Not configured to handle calls for that station';
const UNPARSABLE_CALL_DATA = 'Could not parse the incoming data.';

// keep track of inbound calls so we dont duplicate them across displays
const callHistory = [];

let directory = {}; // directory of the STATION entry and socket based on key of ip

/**
 * register the connection if valid
 * @param {socket} socket 
 */
function handleConnection(socket) {
  // determine what station they are and if it is a valid connection
  let station = stations.findStationBasedOnIpMatch(socket.conn.remoteAddress);
  if (station == null) {
    logger.warn(CONNECTION_INVALID, socket.conn.remoteAddress);
    socket.emit('message', CONNECTION_INVALID);
    socket.disconnect(true);
    return;
  }
  logger.verbose('Welcome ' + station.id);
  socket.emit('message', 'Welcome ' + station.id);

  // keep track of the station and the socket so we can send to them
  directory[socket.conn.remoteAddress.toString()] = {station, socket, posts: []};

  // if we have any active calls for them, go ahead and send them
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (callHistory[i].callData.station == station.id) {
      let age = ((new Date() - new Date(callHistory[i].receivedDate)) / 1000);
      if (age < DISPLAY_TTL) {
        sendToStation('call', callHistory[i].callData, socket.conn.remoteAddress.toString());
        if (callHistory[i].directionsData) {
          sendToStation('directions', callHistory[i].directionsData, socket.conn.remoteAddress.toString());
        }
      }
    }
  }

  // if the station asks for call logs, send them their calls
  socket.on('calls-log-query', function() {
    logger.verbose('A display at station', station.id, 'requested calls log', socket.conn.remoteAddress);
    let calls = callHistory.filter((entry) => entry.callData.station == station.id).reverse();
    sendToStation('calls-log', {
      station: station.id,
      calls,
    }, socket.conn.remoteAddress.toString());
  });

  socket.on('disconnect', function(reason) {
    const remoteAddress = socket.conn.remoteAddress.toString();
    logger.verbose('disconnected', remoteAddress, reason);
    delete directory[remoteAddress];
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
      logger.verbose('sending ' + type + ' to ' + data.station + ' at ' +
        entry.socket.conn.remoteAddress);
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
      post[type + '_sent'] = Date();
      entry.socket.emit(type, data, () => {
        // get an ack back on the send, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
        logger.verbose('  the ' + type + ' was acknowledged by station ' +
          data.station + ' at ' + entry.socket.conn.remoteAddress);
        post[type + '_ack'] = Date();
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
  // otherwise, query google for the directions and map and send it and cache it
  logger.verbose('fetching new directions', data.callNumber);
  return googleMapsClient.directions({
    origin: [station.lat, station.lng],
    destination: (data.location.match(/[A-Z]/) == null ?
      data.location.split(',').map((s) => Number(s)) : data.location + ADDRESS_SUFFIX),
    mode: 'driving',
  }).asPromise()
    .then((response) => {
      // log('google directions api response', response);
      // if we got something and there is a route
      if (response.json.status === 'OK' && response.json.routes[0].legs[0]) {
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
          mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc + markers,
        };
        sendToStation('directions', directions);
        call.directionsData = directions;
        return call;
      }
    })
    .catch((err) => {
      logger.error(err);
      rollbar.log(err);
    });
}

// app.get('/status', function(req, res) {
//   const directoryKeys = Object.getOwnPropertyNames(directory)
//     .sort((a, b) => directory[a].station.id.localeCompare(directory[b].station.id));
//   res.json({
//     directory: directoryKeys.map((id) => ({
//       id: directory[id].station.id,
//       posts: directory[id].posts,
//     })),
//     callHistory,
//   });
// });

module.exports = {
  callHistory,
  directory,
  handleConnection,
  handleIncomingData,
  sendToStation,

  // for testing
  CALL_HISTORY_LIMIT,
};
