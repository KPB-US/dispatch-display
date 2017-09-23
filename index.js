/** nodejs server code for dispatch display system
 *
 * environment variables:
 *  GOOGLE_DIRECTIONS_API_KEY
 *  GOOGLE_STATIC_MAPS_API_KEY
 */

require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_DIRECTIONS_API_KEY,
  Promise: Promise
});
const STATIC_MAP_BASE_URL =
  'https://maps.googleapis.com/maps/api/staticmap?&maptype=roadmap&scale=2&key=' +
  process.env.GOOGLE_STATIC_MAPS_API_KEY; // &zoom=14

let testCache = {
  location: null,
  data: null,
};

app.use(morgan('combined')); // logging requests to console
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
 */
io.on('connection', function(socket) {
  console.log('a user connected', socket.conn.remoteAddress);
  socket.on('disconnect', function(reason) {
     console.log('user disconnected', socket.conn.remoteAddress, reason);
   });
 });

app.post('/incoming', function(req, res) {
  // todo! get an ack back, see https://socket.io/docs/#sending-and-getting-data-(acknowledgements)
  let callNumber = req.body.callNumber;

  // data first
  io.emit('call', {
    callNumber,
    response: req.body,
  });

  // map next
  if (req.body.location) {
    if (testCache.location != null && testCache.location === req.body.location) {
      io.emit('directions', testCache.data);
    } else {
      googleMapsClient.directions({
        origin: '231 S Binkley St, Soldotna, AK 99669', // 60.4829661,-151.0722942
        destination: req.body.location,
        mode: 'driving',
      }).asPromise()
        .then((response) => {
          console.log('google directions api response', response);
          if (response.json.status === 'OK') {
            console.log('sending map info');
            const enc = encodeURIComponent(response.json.routes[0].overview_polyline.points);
            const data = {
              callNumber,
              response,
              mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc,
            };
            testCache = {
              location: req.body.location,
              data: data,
            };
            io.emit('directions', data);
          }
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }

  res.send('OK');
});


http.listen(3000, function() {
  console.log('listening on *:3000');
});
