/* eslint-env node, mocha */

const chai = require('chai');
const sinon = require('sinon');
const expect = chai.expect;
// const chaiHttp = require('chai-http');

const stations = require('../lib/stations');
const displays = require('../lib/displays');

const QUIET_LOGS = true;

// chai.use(chaiHttp);

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
Array.prototype.push.apply(stations.STATIONS, [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

/**
 * write to console
 * @param {...*} args 
 */
function log(...args) {
  if (!QUIET_LOGS) {
    console.log(args);
  }
}

/**
 * returns a stubbed socket
 * 
 * @param {string} ip remote ip address
 * @return {socket} stubbed socket
 */
function createSocket(ip) {
  let socket = {
    conn: {
      remoteAddress: ip || '192.168.1.10',
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
    onHandlers: {},
  };
  sinon.stub(socket, 'emit').callsFake(function(...args) {
    log('emit', args);
    // if there was a callback then run it
    if (typeof args[2] == 'function') {
      args[2]();
    }
  });
  sinon.stub(socket, 'on').callsFake(function(...args) {
    log('on', args);
    socket.onHandlers[args[0]] = args[1];
  });

  return socket;
}

/**
 * create a sample call object
 * @param {string} station - station id
 * @return {call} call data
 */
function createCall(station) {
  let call = {
    location: '144 N BINKLEY ST',
    venue: 'SOLDOTNA',
    crossStreets: 'N BINKLY ST / PARK ST',
    station,
    callNumber: '1010',
    callType: '43-Test1 Test2',
    callDateTime: '09/25/2017 08:44:34',
    dispatchDateTime: '09/25/2017 08:47:47',
    dispatchCode: '25C01',
    callInfo: '20 year old, female, breathing, conscious.',
    ccText: 'shiver me timbers',
  };
  return call;
}

describe('displays', function() {
  beforeEach(function resetDisplays() {
    // reset display call history and tracked display connections
    displays.callHistory.splice(0, displays.callHistory.length);
    const keys = Object.keys(displays.directory);
    for (let i = keys.length; i > 0; i--) {
      delete displays.directory[keys[i - 1]];
    }
  });

  it('should allow displays with valid ips ', function() {
    const socket = createSocket();

    displays.handleConnection(socket);
    expect(socket.connected).to.be.true;
  });

  it('should receive a welcome upon connect', function() {
    const socket = createSocket();

    displays.handleConnection(socket);
    expect(socket.emit.calledWith('message')).to.be.true;
    expect(socket.emit.args[0][1]).to.include('Welcome');
  });

  it('should track connected displays', function() {
    const socket = createSocket();

    expect(Object.keys(displays.directory).length).to.equal(0);
    displays.handleConnection(socket);
    expect(Object.keys(displays.directory).length).to.equal(1);
  });

  it('should receive active calls upon connect', function() {
    const socket = createSocket();

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
    expect(socket.emit.calledWith('call')).to.be.true;
    let calls = 0;
    for (let i = 0; i < socket.emit.args.length; i++) {
      if (socket.emit.args[i][0] == 'call') {
        if (socket.emit.args[i][1].callType != '--expired--') {
          calls = calls + 1;
        }
      }
    }
    expect(calls).to.equal(1);
  });

  it('should not allow displays with unmatched ips', function() {
    const socket = createSocket();

    socket.conn.remoteAddress = '192.192.192.192';
    displays.handleConnection(socket);
    expect(socket.connected).to.be.false;
  });

  it('should receive a rejection message if coming from unknown ip', function() {
    const socket = createSocket();

    socket.conn.remoteAddress = '192.192.192.192';
    displays.handleConnection(socket);
    expect(socket.emit.calledWith('message')).to.be.true;
    expect(socket.emit.args[0][1]).to.include('not registered');
  });

  it('should allow multiple displays at same station', function() {
    const socket = createSocket();
    const socket2 = createSocket('192.168.1.11');

    displays.handleConnection(socket);
    displays.handleConnection(socket2);
    expect(Object.keys(displays.directory).length).to.equal(2);
    expect(socket.connected).to.be.true;
    expect(socket2.connected).to.be.true;
  });

  it('should stop tracking disconnected displays', function() {
    const socket = createSocket();

    expect(Object.keys(displays.directory).length).to.equal(0);
    displays.handleConnection(socket);
    expect(Object.keys(displays.directory).length).to.equal(1);
    socket.onHandlers['disconnect']('test disconnect');
    expect(Object.keys(displays.directory).length).to.equal(0);
  });

  it('call should go to displays for designated station', function() {
    const mesa1 = createSocket();
    const mesa2 = createSocket('192.168.1.11');
    const nsa1 = createSocket('192.168.3.10');
    displays.handleConnection(mesa1);
    displays.handleConnection(mesa2);
    displays.handleConnection(nsa1);
    // clear emit stub history
    mesa1.emit.resetHistory();
    mesa2.emit.resetHistory();
    nsa1.emit.resetHistory();
    // send a sample call to MESA
    displays.sendToStation('call', {
      callNumber: 1,
      station: 'MESA',
    });
    expect(mesa1.emit.called).to.be.true;
    expect(mesa2.emit.called).to.be.true;
    expect(nsa1.emit.called).to.be.false;
  });

  it('should send call logs when requested', function() {
    const socket = createSocket();
    const call = createCall('MESA');
    call.location = String.Empty;

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = {
      status: function() { },
      send: function() { },
    };
    sinon.stub(res, 'status').callsFake(function(...args) {
      log('status', args);
    });
    sinon.stub(res, 'send').callsFake(function(...args) {
      log('send', args);
    });
    displays.handleIncomingData(req, res);
    socket.onHandlers['calls-log-query']();
    expect(socket.emit.calledWith('calls-log')).to.be.true;
  });
});
