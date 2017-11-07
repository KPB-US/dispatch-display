require('dotenv').config();
const logger = require('./logger');
let rollbar = null;

if (!process.env.ROLLBAR_TOKEN) {
  logger.warn('ROLLBAR_TOKEN is not configured and will not be used.');
} else {
  const Rollbar = require('rollbar');
  rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);
}

const stations = require('./stations');
const parser = require('./parser');

const CALL_ACTIVE_SECS = Number(process.env.CALL_ACTIVE_SECS || 60 * 25); // call is considered active at the station for this long
const CALL_HISTORY_LIMIT = Number(process.env.CALL_HISTORY_LIMIT || 20);

const CONNECTION_INVALID = 'A connection attempt was made but that remote address is not registered in the STATIONS list';
const UNCONFIGURED_STATION = 'Not configured to handle calls for that station ';
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
  const matchingStations = stations.findStationsByIpMatch(addr);
  if (matchingStations.length === 0) {
    logger.warn(CONNECTION_INVALID, addr);
    socket.emit('message', CONNECTION_INVALID + ' - ' + addr);
    socket.disconnect(true);
    return;
  }

  const matchingStationIds = matchingStations.map((e) => e.id);
  const matchingAreas = matchingStations.map((e) => e.area);
  
  logger.verbose('Welcome ' + matchingStationIds.join(', '));
  socket.emit('config', {
    stations: matchingStations,
    areas: matchingAreas,
    mapKey: process.env.GAPI_KEY,
    rollbarToken: process.env.ROLLBAR_TOKEN,
    environment: process.env.NODE_ENV || 'development',
    callActiveSecs: CALL_ACTIVE_SECS,
    addressSuffix: process.env.ADDRESS_SUFFIX,
    switchAfterSecs: process.env.SWITCH_AFTER_SECS || 10,
    lastXTextDirections: Number(process.env.LAST_X_TEXT_DIRECTIONS) || 6,
    skipFirstDirections: Number(process.env.SKIP_FIRST_DIRECTIONS) || 1,
  });

  // keep track of the station and the socket so we can send to them
  directory[addr] = {matchingStations, socket, posts: [], since: Date()};

  // if we have any active calls for them, go ahead and send them
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (matchingAreas.includes(callHistory[i].callData.area)) {
      let age = ((new Date() - new Date(callHistory[i].receivedDate)) / 1000);
      if (age < CALL_ACTIVE_SECS) {
        sendToStations('call', callHistory[i].callData, addr);
      }
    }
  }

  // if the station asks for call logs, send them their calls
  socket.on('callslog-query', function() {
    logger.verbose('A display at station', matchingStationIds.join(', '), 'requested calls log', addr);
    let calls = callHistory.filter((entry) => matchingAreas.includes(entry.callData.area)).reverse();
    sendToStations('callslog', {
      // since we have to pass an area, use the station's first one-- they'll still get all the calls for all areas
      // from the filter above
      area: matchingAreas[0],
      stations: matchingStationIds,
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
function sendToStations(type, data, ip) {
  // send the call data to the stations it should go to based on it's service area
  // look through the directory of current connections...
  const directoryKeys = Object.getOwnPropertyNames(directory);
  for (let i = 0; i < directoryKeys.length; i++) {
    const entry = directory[directoryKeys[i]];
    // typically each connection in the directory is a single display at a single station
    if (entry.matchingStations.map((e) => e.area).includes(data.area) && (!ip || ip === directoryKeys[i])) {
      const addr = getRemoteAddr(entry.socket);
      logger.verbose('sending ' + type + ' to ' /* + entry.station.id + ' at ' */ + addr);
      // update or add to the station's call log
      let post = entry.posts.find((item) => item.callNumber == data.callNumber);
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
          /* entry.station.id + ' at ' + */ addr);
        post[type + 'Ack'] = Date();
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
    logger.warn(UNPARSABLE_CALL_DATA, req.body);
    res.status(400).send(UNPARSABLE_CALL_DATA);
    return;
  }

  const recipients = stations.findStationsByArea(data.area);
  if (recipients.length == 0) {
    logger.warn(UNCONFIGURED_STATION, data.area);
    res.status(200).send(UNCONFIGURED_STATION + data.area);
    return;
  }

  // send the call data to the appropriate displays/stations
  sendToStations('call', data, null);

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
}

/**
 * return status info on calls and connections
 * @param {request} req 
 * @param {response} res 
 */
function handleStatus(req, res) {
  const directoryKeys = Object.getOwnPropertyNames(directory)
    .sort((a, b) => {
      // sort based on first station in directory entry's addr since could have multiple stations
      return directory[a].matchingStations[0].id.localeCompare(directory[b].matchingStations[0].id);
    });
  res.json({
    directory: directoryKeys.map((id) => {
      const matchingStations = directory[id].matchingStations;
      const matchingStationIds = matchingStations.map((e) => e.id);
      const matchingAreas = matchingStations.map((e) => e.area);
    
      return {
        ids: matchingStationIds,
        areas: matchingAreas,
        address: getRemoteAddr(directory[id].socket),
        since: directory[id].since,
        posts: directory[id].posts.slice(-10).reverse(),
      };
    }),
    callHistory: callHistory.slice(-CALL_HISTORY_LIMIT).reverse(),
  });
}

module.exports = {
  callHistory,
  directory,
  handleConnection,
  handleIncomingData,
  sendToStations,
  handleStatus,

  // for testing
  CALL_HISTORY_LIMIT,
};
