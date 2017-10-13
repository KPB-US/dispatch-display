require('dotenv').config();

const stations = require('./stations');
const parser = require('./parser');
const Rollbar = require('rollbar');

const DISPLAY_TTL = Number(process.env.DISPLAY_TTL || 60 * 10); // call is considered active at the station for this long
const CALL_HISTORY_LIMIT = Number(process.env.CALL_HISTORY_LIMIT || 20);
const ADDRESS_SUFFIX = process.env.ADDRESS_SUFFIX || '';

const QUIET_LOGS = process.env.QUIET_LOGS || process.env.NODE_ENV == 'test';

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
 * write to console
 * @param {...*} args 
 */
function log(...args) {
  if (!QUIET_LOGS) {
    console.log(args.join(' '));
  }
}

/**
 * register the connection if valid
 * @param {socket} socket 
 */
function handleConnection(socket) {
  // determine what station they are and if it is a valid connection
  let station = stations.findStationBasedOnIpMatch(socket.conn.remoteAddress);
  if (station == null) {
    log(CONNECTION_INVALID, socket.conn.remoteAddress);
    socket.emit('message', CONNECTION_INVALID);
    socket.disconnect(true);
    return;
  }
  log('Welcome ' + station.id);
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
    log('A display at station', station.id, 'requested calls log', socket.conn.remoteAddress);
    let calls = callHistory.filter((entry) => entry.callData.station == station.id);
    sendToStation('calls-log', {
      station: station.id,
      calls,
    }, socket.conn.remoteAddress.toString());
  });

  socket.on('disconnect', function(reason) {
    const remoteAddress = socket.conn.remoteAddress.toString();
    log('disconnected', remoteAddress, reason);
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
      log('sending ' + type + ' to ' + data.station + ' at ' +
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
        log('  the ' + type + ' was acknowledged by station ' +
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
 */
function handleIncomingData(req, res) {
  // parse the data
  const data = parser.parse(req.body);
  if (!data.valid) {
    log(UNPARSABLE_CALL_DATA, req.body);
    res.status(400).send(UNPARSABLE_CALL_DATA);
    return;
  }

  const station = stations.findStation(data.station);
  if (station == null) {
    log(UNCONFIGURED_STATION, req.body);
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

  // if we have a location to map...
  if (data.location) {
    // if we have already successfully mapped it, then send the cached data
    if (call.callData.location && call.callData.location === data.location && call.directionsData) {
      log('sending cached directions', data.callNumber);
      sendToStation('directions', call.directionsData);
    } else {
      // otherwise, query google for the directions and map and send it and cache it
      log('fetching new directions', data.callNumber);
      googleMapsClient.directions({
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
              mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc + markers,
            };
            sendToStation('directions', directions);
            call.directionsData = directions;
          }
        })
        .catch((err) => {
          console.log(err);
          rollbar.log(err);
        });
    }
  }

  res.send('OK');
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
