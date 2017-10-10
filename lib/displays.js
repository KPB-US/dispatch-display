const stations = require('./stations');

const DISPLAY_TTL = process.env.DISPLAY_TTL || 60 * 10; // call is considered active at the station for this long

// keep track of inbound calls so we dont duplicate them across displays
const callHistory = [];

let directory = {}; // directory of the STATION entry and socket based on key of ip

/**
 * register the connection if valid
 * @param {socket} socket 
 */
function handleConnection(socket) {
  console.log('a user connected', socket.conn.remoteAddress);
  // determine what station they are and if it is a valid connection
  let station = stations.findStationBasedOnIpMatch(socket.conn.remoteAddress);
  if (station == null) {
    console.log('  that remoteAddress is not registered in the STATIONS list');
    socket.disconnect(true);
    return;
  }

  // keep track of the station and the socket so we can send to them
  console.log('  Welcome ' + station.id);
  directory[socket.conn.remoteAddress.toString()] = {station, socket, posts: []};
  // if we have an active entry for them, go ahead and send it
  for (let i = callHistory.length - 1; i >= 0; i--) {
    if (callHistory[i].callData.station == station.id) {
      let age = ((new Date() - new Date(callHistory[i].receivedDate)) / 1000);
      if (age < DISPLAY_TTL) {
        console.log('sending');
        sendToStation('call', callHistory[i].callData, socket.conn.remoteAddress.toString());
        if (callHistory[i].directionsData) {
          sendToStation('directions', callHistory[i].directionsData, socket.conn.remoteAddress.toString());
        }
      }
    }
  }

  // if the station asks for call logs, send them their calls
  socket.on('calls-log-query', function() {
    console.log('station', station.id, 'requested calls log', socket.conn.remoteAddress);
    let calls = callHistory.filter((entry) => entry.callData.station == station.id);
    sendToStation('calls-log', {
      station: station.id,
      calls,
    }, socket.conn.remoteAddress.toString());
  });

  socket.on('disconnect', function(reason) {
     console.log('user disconnected', socket.conn.remoteAddress, reason);
     delete directory[socket.conn.remoteAddress.toString()];
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
      console.log('sending ' + type + ' to ' + data.station + ' at ' +
        entry.socket.conn.remoteAddress);
      let post = entry.posts.find((item) => {
        return item.callNumber == data.callNumber;
      });
      if (post == null) {
        post = {
          type,
          callNumber: data.callNumber,
        };
        entry.posts.push(post);
      }
      post[type + '_sent'] = Date();
      entry.socket.emit(type, data, () => {
        // get an ack back on the send, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
        console.log('  the ' + type + ' was acknowledged by station ' +
          data.station + ' at ' + entry.socket.conn.remoteAddress);
        post[type + '_ack'] = Date();
      });
    }
  }
}

module.exports = {
  callHistory,
  directory,
  handleConnection,
  sendToStation,
};
