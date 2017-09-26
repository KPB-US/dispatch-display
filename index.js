/** nodejs server code for dispatch display system
 *
 * environment variables:
 *  GOOGLE_DIRECTIONS_API_KEY
 *  GOOGLE_STATIC_MAPS_API_KEY
 */

require('dotenv').config();

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
  } else {
    console.log('  Welcome ' + station.id);
  }
  // keep track of the station and the socket so we can send to them
  directory[socket.conn.remoteAddress.toString()] = {station, socket};

  socket.on('disconnect', function(reason) {
     console.log('user disconnected', socket.conn.remoteAddress, reason);
     delete directory[socket.conn.remoteAddress.toString()];
   });
 });


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

  // broadcast the call data to the station it should go to
  const directoryKeys = Object.getOwnPropertyNames(directory);
  for (let i = 0; i < directoryKeys.length; i++) {
    const station = directory[directoryKeys[i]].station;
    if (station.id === data.station) {
      console.log('sending call to ' + data.station + ' at ' + directory[directoryKeys[i]].socket.conn.remoteAddress);
      directory[directoryKeys[i]].last_sent = Date();
      directory[directoryKeys[i]].socket.emit('call', data, () => {
        // get an ack back on the send, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
        console.log('  the call was acknowledged by station ' + data.station);
        directory[directoryKeys[i]].ack = true;
        directory[directoryKeys[i]].ack_time = Date();
      });
    } else {
      console.log('  not sending to ' + station.id);
    }
  }

  // data first
  // io.emit('call', {
  //   callNumber,
  //   response: req.body,
  // });

  // directions/map next
  const station = findStation(data.station);
  if (data.location) {
    if (testCache.location != null && testCache.location === data.location) {
      testCache.data.callNumber = data.callNumber;
      io.emit('directions', testCache.data);
    } else {
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
              response,
              mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc + markers,
            };
            testCache = {
              location: data.location,
              data: directions,
            };
            console.log('sending directions info');
            io.emit('directions', directions);
          }
        })
        .catch((err) => {
          // use rollbar or newrelic to track errors
          console.log(err);
        });
    }
  }

  res.send('OK');
});


http.listen(3000, function() {
  console.log('listening on *:3000');
});
