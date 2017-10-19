/* eslint-env node */

// nodejs server for dispatch display system

require('dotenv').config();
const displays = require('./lib/displays');
const logger = require('./lib/logger');
const express = require('express');
const morgan = require('morgan'); /* eslint no-unused-vars: off */
const app = express();
const http = require('http').Server(app); /* eslint new-cap: off */
const io = require('socket.io')(http, {
  pingInterval: 4000,
  pingTimeout: 12000,
});
const bodyParser = require('body-parser');

const PORT = process.env.PORT || 3000;

// app.use(morgan('combined')); // logging requests to console
app.use(bodyParser.json()); // https://stackoverflow.com/questions/5710358/how-to-retrieve-post-query-parameters

// serve static files
app.use('/socket.io', express.static('node_modules/socket.io-client/dist'));
app.use(express.static('public'));

// send the main page
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/public/index.html');
});
// handle incoming data from 911 system
app.post('/incoming', displays.handleIncomingData);
app.get('/status', displays.handleStatus);

// handle when a display connects or disconnects
io.on('connection', displays.handleConnection);

http.listen(PORT, function() {
  logger.info(`listening on *:${PORT}`);
});

module.exports = http; // for testing
