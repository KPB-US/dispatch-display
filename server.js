/* eslint-env node */

// nodejs server for dispatch display system

require('dotenv').config();
const stations = require('./lib/stations');
const parser = require('./lib/parser');
const displays = require('./lib/displays');

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

const CALL_HISTORY_LIMIT = process.env.CALL_HISTORY_LIMIT || 20;
const ADDRESS_SUFFIX = process.env.ADDRESS_SUFFIX || '';

const STATIC_MAP_BASE_URL =
  'https://maps.googleapis.com/maps/api/staticmap?&maptype=roadmap&scale=2&key=' +
  process.env.GOOGLE_STATIC_MAPS_API_KEY; // &zoom=14

// app.use(morgan('combined')); // logging requests to console
app.use(bodyParser.json()); // https://stackoverflow.com/questions/5710358/how-to-retrieve-post-query-parameters

// serve static files
app.use('/socket.io', express.static('node_modules/socket.io-client/dist'));
app.use(express.static('public'));

// send the main page
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

/**
 * handle when a user connects or disconnects
 *
 * Note: add them to the directory (or remove them) based on thier ip
 */
io.on('connection', displays.handleConnection);

/**
 * handle incoming data from 911 system
 */
app.post('/incoming', function(req, res) {
  // parse the data
  const data = parser.parse(req.body);
  if (!data.valid) {
    console.log('Could not parse the incoming data', req.body);
    res.status(400).send('Could not parse the incoming data.');
    return;
  }

  const station = stations.findStation(data.station);
  if (station == null) {
    console.log('Not handling calls for that station', req.body);
    res.status(404).send('Not configured to handle calls for that station.');
    return;
  }

  // send the data to the appropriate displays/stations
  displays.sendToStation('call', data);
  let call = displays.callHistory.find((entry) => entry.callNumber == data.callNumber);
  if (call == null) {
    call = {
      callNumber: data.callNumber,
      callData: data,
      receivedDate: Date(),
    };
    if (displays.callHistory.length > CALL_HISTORY_LIMIT) {
      displays.callHistory.shift();
    }
    displays.callHistory.push(call);
  }

  // if we have a location to map...
  if (data.location) {
    // if we have already successfully mapped it, then send the cached data
    if (call.location && call.location === data.location && call.directionsData) {
      console.log('sending cached directions', data.callNumber);
      displays.sendToStation('directions', {
        location: call.location,
        data: call.directionsData,
      });
    } else {
      // otherwise, query google for the directions and map and send it and cache it
      console.log('fetching new directions', data.callNumber);
      googleMapsClient.directions({
        origin: [station.lat, station.lng],
        destination: (data.location.match(/[A-Z]/) == null ?
          data.location.split(',').map((s) => Number(s)) : data.location + ADDRESS_SUFFIX),
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
            displays.sendToStation('directions', directions);
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
});

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

const PORT = process.env.PORT || 3000;
http.listen(PORT, function() {
  console.log(`listening on *:${PORT}`);
});

module.exports = app; // for testing

// TODO! postman sending same call makes it refetch directions and it should use already fetched directions
