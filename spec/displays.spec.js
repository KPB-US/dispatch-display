/* eslint-env node, mocha */

const chai = require('chai');
const sinon = require('sinon');
const should = chai.should();
const expect = chai.expect;
const chaiHttp = require('chai-http');

const stations = require('../lib/stations');
const displays = require('../lib/displays');
// const ioServer = require('socket.io');
// const ioClient = require('socket.io-client');

chai.use(chaiHttp);

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
Array.prototype.push.apply(stations.STATIONS, [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

let socket = {
  conn: {
    remoteAddress: '192.168.1.10',
  },
  connected: true,
  emit: function() {
    return true;
  },
  disconnect: function() {
    this.connected = false;
    return true;
  },
  on: function() {
    return true;
  },
};
sinon.stub(socket, 'emit').callsFake(function(...args) {
  console.log('emit', args);
});
sinon.stub(socket, 'on').callsFake(function(...args) {
  console.log('on', args);
});

describe('displays', function() {
  beforeEach(function prepareSocketAndStubs() {
    // reset socket
    socket.emit.resetHistory();
    socket.on.resetHistory();
    socket.connected = true;
    socket.conn.remoteAddress = '192.168.1.10';
    // reset display call history and tracked display connections
    displays.callHistory.splice(0, displays.callHistory.length);
    const keys = Object.keys(displays.directory);
    for (let i = keys.length; i > 0; i--) {
      delete displays.directory[keys[i - 1]];
    }
  });

  it('should allow displays with valid ips ', function() {
    displays.handleConnection(socket);
    socket.connected.should.be.true;
  });

  it('should receive a welcome upon connect', function() {
    displays.handleConnection(socket);
    socket.emit.calledWith('message').should.be.true;
    expect(socket.emit.args[0][1]).to.include('Welcome');
  });

  it('should track connected displays', function() {
    expect(Object.keys(displays.directory).length).to.equal(0);
    displays.handleConnection(socket);
    expect(Object.keys(displays.directory).length).to.equal(1);
  });

  it('should receive active calls upon connect', function() {
    // add an expired prior call
    let old = new Date();
    old.setFullYear(1980);
    displays.callHistory.push({
      callData: {
        station: 'MESA',
        callType: '--expired--',
      },
      receivedDate: old,
      directionsData: {
      },
    });
    // add a current call
    displays.callHistory.push({
      callData: {
        station: 'MESA',
        callType: 'Medic/Fire',
      },
      receivedDate: new Date(),
      directionsData: {
      },
    });
    displays.handleConnection(socket);
    socket.emit.calledWith('call').should.be.true;
    let calls = 0;
console.log('--------------------------- socket.emit.args', socket.emit.args);
    for (let i = 0; i < socket.emit.args.length; i++) {
console.log('--------------------------------------------checking ', socket.emit.args[i][0]);
      if (socket.emit.args[i][0] == 'call') {
        console.log('here is the call::::::', socket.emit.args[i][1]);
        if (socket.emit.args[i][1].callData.callType != '--expired--') {
          calls = calls + 1;
        }
      }
    }
    expect(calls).to.equal(1);
  });

  it('should not allow displays with unmatched ips', function() {
    socket.conn.remoteAddress = '192.192.192.192';
    displays.handleConnection(socket);
    socket.connected.should.be.false;
  });

  it('should receive a rejection message if coming from unknown ip', function() {
    socket.conn.remoteAddress = '192.192.192.192';
    displays.handleConnection(socket);
    socket.emit.calledWith('message').should.be.true;
    expect(socket.emit.args[0][1]).to.include('not registered');
  });

  it('should allow multiple displays at same station', function() {

  });
  it('should stop tracking disconnected displays', function() {

  });
  it('call should go to all connected displays for station', function() {

  });
  it('call should be acknowledged upon receipt by display', function() {

  });
  it('directions should be acknowledged upon receipt by display', function() {

  });
  it('should return call logs when requested', function() {

  });
});
