/** nodejs server code for dispatch display system
 *
 * environment variables:
 *  GOOGLE_DIRECTIONS_API_KEY
 *  GOOGLE_STATIC_MAPS_API_KEY
 */

require('dotenv').config();

const Rollbar = require('rollbar');
const express = require('express');
const morgan = require('morgan'); /* eslint no-unused-vars: off */
const app = express();
const http = require('http').Server(app); /* eslint new-cap: off */
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_DIRECTIONS_API_KEY,
  Promise: Promise,
});
const rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);

const STATIC_MAP_BASE_URL =
  'https://maps.googleapis.com/maps/api/staticmap?&maptype=roadmap&scale=2&key=' +
  process.env.GOOGLE_STATIC_MAPS_API_KEY; // &zoom=14

const STATIONS = [
  {id: 'APFESA', lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.0\.3\.158/},
  {id: 'BCFSA',  lat: 60.1693453, lng: -149.4019433, ip_match_regex: /::1/},
  {id: 'CES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.3\.*/},
  {id: 'MES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /::1/},
  {id: 'BES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.3\.167/},
];

/**
 * returns station matching id
 *
 * @param {string} id id of station
 * @return {object} STATION entry or null if not found
 */
function findStation(id) {
  let station = null;
  for (let i = 0; i < STATIONS.length; i++) {
    if (STATIONS[i].id === id) {
      station = STATIONS[i];
      break;
    }
  }
  return station;
}

/**
 * returns station matching ip rule
 *
 * @param {string} ip ip address of client
 * @return {object} STATION entry or null if not found
 */
function findStationBasedOnIpMatch(ip) {
  let station = null;
  for (let i = 0; i < STATIONS.length; i++) {
    if (ip.match(STATIONS[i].ip_match_regex) != null) {
      station = STATIONS[i];
      break;
    }
  }
  return station;
}

/**
 * parses incoming data from the 911 system into an object we can use
 *
 * @param {object} body JSON posted from 911 system
 * @return {object} formattedData expected by display system
 */
function parseFromKpb911(body) {
  let data = {
    callNumber: null,
    callDateTime: null,
    callType: 'Unknown',
    breathing: 'Unknown',
    conscious: 'Unknown',

    station: null,
    dispatchDateTime: null,
    dispatchCode: '',

    location: null,
    crossStreets: null,
    venue: null,
    valid: false,
  };

  try {
    /* must haves */
    data.callNumber = body.callNumber;
    data.station = body.district.split(' ')[0]; // district is prefixed by station abbreviation

    // call type is prefixed by some number and a dash
    let parts = body.callType.split('-');
    parts.shift();
    data.callType = parts.join('-');

    data.callDateTime = body.callDateTime;
    data.dispatchDateTime = body.DispatchDateTime;

    // it will have a dispatch code but we might not be able to parse the priority from it
    let dispatchCode = body.dispatchCode.match(/[A-Z]/);
    if (dispatchCode.length > 0) {
      data.dispatchCode = dispatchCode[0];
    }

    /* might haves */
    if (body.location) data.location = body.location;
    if (body.crossStreets) data.crossStreets = body.crossStreets;
    if (body.venue) data.venue = body.venue;
    if (body.breathing) data.breathing = body.breathing;
    if (body.conscious) data.conscious = body.conscious;

    data.valid = true; // if we got this far, it's a valid incoming packet of data
  } catch (e) {
    data.valid = false;
  }

  return data;
}

let directory = {}; // directory of the STATION entry and socket based on key of ip

let testCache = {
  location: null,
  data: null,
};

// app.use(morgan('combined')); // logging requests to console
app.use(bodyParser.json()); // https://stackoverflow.com/questions/5710358/how-to-retrieve-post-query-parameters

// serve static files
app.use('/socket.io', express.static('node_modules/socket.io-client/dist'));
app.use('/js', express.static('js'));
app.use('/css', express.static('css'));

// send the main page
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

/**
 * handle when a user connects or disconnects
 *
 * Note: add them to the directory (or remove them) based on thier ip
 */
io.on('connection', function(socket) {
  console.log('a user connected', socket.conn.remoteAddress);
  // todo! determine what station they are and if it is a valid connection
  let station = findStationBasedOnIpMatch(socket.conn.remoteAddress);
  if (station == null) {
    console.log('  that remoteAddress is not registered in the STATIONS list');
    socket.disconnect(true);
    return;
  }

  // keep track of the station and the socket so we can send to them
  console.log('  Welcome ' + station.id);
  directory[socket.conn.remoteAddress.toString()] = {station, socket, posts: []};

  socket.on('disconnect', function(reason) {
     console.log('user disconnected', socket.conn.remoteAddress, reason);
     delete directory[socket.conn.remoteAddress.toString()];
   });
 });

/**
 * send data to the appropriate, connected stations
 *
 * @param {string} type name of event
 * @param {object} data data to send
 */
function sendToStation(type, data) {
  // send the call data to the station it should go to
  const station = findStation(data.station);
  const directoryKeys = Object.getOwnPropertyNames(directory);
  for (let i = 0; i < directoryKeys.length; i++) {
    const connectedStation = directory[directoryKeys[i]].station;
    if (connectedStation.id === data.station) {
      console.log('sending ' + type + ' to ' + data.station + ' at ' +
        directory[directoryKeys[i]].socket.conn.remoteAddress);
      let post = {
        type,
        data,
        sent: Date(),
      };
      directory[directoryKeys[i]].posts.push(post);
      directory[directoryKeys[i]].socket.emit(type, data, () => {
        // get an ack back on the send, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
        console.log('  the ' + type + ' was acknowledged by station ' + data.station);
        post.ack = true;
      });
    } else {
      console.log('  not sending to ' + connectedStation.id);
    }
  }
}

/**
 * handle incoming data from 911 system
 */
app.post('/incoming', function(req, res) {
  // parse the data
  const data = parseFromKpb911(req.body);
  if (!data.valid) {
    console.log('Could not parse the incoming data', req.body);
    res.status(500).send('Could not parse the incoming data.');
    return;
  }

  // send the data to the appropriate displays/stations
  sendToStation('call', data);

  // if we have a location to map...
  const station = findStation(data.station);
  if (data.location) {
    // if we have already successfully mapped it, then send the cached data
    if (testCache.location != null && testCache.location === data.location) {
      testCache.data.callNumber = data.callNumber;
      sendToStation('directions', testCache.data);
    } else {
      // otherwise, query google for the directions and map and send it and cache it
      googleMapsClient.directions({
        origin: [station.lat, station.lng],
        destination: (data.location.match(/[A-Z]/) == null ?
          data.location.split(',').map((s) => Number(s)) : data.location),
        mode: 'driving',
      }).asPromise()
        .then((response) => {
          // console.log('google directions api response', response);
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
            testCache = {
              location: data.location,
              data: directions,
            };
            sendToStation('directions', directions);
          }
        })
        .catch((err) => {
          console.log(err);
          rollbar.log(err);
        });
    }
  }

  res.send('OK');
});

app.get('/status', function (req, res) {
  let body = '';
  const directoryKeys = Object.getOwnPropertyNames(directory);
  for (let i = 0; i < directoryKeys.length; i++) {
    body += '<h1>' + directory[directoryKeys[i]].station.id + directory[directoryKeys[i]].posts.length + '</h1>';
    for (let j = 0; j < directory[directoryKeys[i]].posts.length; j++) {
      console.log(directory[directoryKeys[i]].posts[j]);
      body += '<p>' + directory[directoryKeys[i]].posts[j].data.callNumber +
        ' sent ' + directory[directoryKeys[i]].posts[j].sent + ' ' +
        (directory[directoryKeys[i]].posts[j].data.ack ? 'acknowledged' : 'not acknowledged') + '</p>';
    }
  }
  res.send(body);
});

http.listen(3000, function() {
  console.log('listening on *:3000');
});
