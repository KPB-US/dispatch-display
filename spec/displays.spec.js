/* eslint-env node, mocha */

require('dotenv').config();
const logger = require('../lib/logger');

// logger.level = 'verbose';

const chai = require('chai');
const sinon = require('sinon');
const expect = chai.expect;

const stations = require('../lib/stations');
const displays = require('../lib/displays');

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
Array.prototype.push.apply(stations.STATIONS, [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

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
    logger.verbose('emit', args);
    // if there was a callback then run it
    if (typeof args[2] == 'function') {
      args[2]();
    }
  });
  sinon.stub(socket, 'on').callsFake(function(...args) {
    logger.verbose('on', args);
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

/**
 * return stubbed response object
 * @return {response}
 */
function createResponse() {
  let res = {
    status: function() { },
    send: function() { },
  };
  sinon.stub(res, 'status').callsFake(function(...args) {
    logger.verbose('status', args);
    return res;
  });
  sinon.stub(res, 'send').callsFake(function(...args) {
    logger.verbose('send', args);
    return res;
  });

  return res;
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

  it('should receive a station id upon connect', function() {
    const socket = createSocket();

    displays.handleConnection(socket);
    expect(socket.emit.calledWith('config')).to.be.true;
    expect(socket.emit.args[0][1].station).to.equal('MESA');
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
    let res = createResponse();
    displays.handleIncomingData(req, res);
    socket.onHandlers['callslog-query']();
    expect(socket.emit.calledWith('callslog')).to.be.true;
  });

  it('should update call when same call comes through again', function() {
    const socket = createSocket();
    const call = createCall('MESA');
    call.location = String.Empty;
    const res = createResponse();

    const prior = call.ccText;
    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    displays.handleIncomingData(req, res);
    expect(displays.callHistory.length).to.equal(1);

    const call2 = createCall('MESA');
    call2.ccText = 'foobar';
    let req2 = {
      body: call2,
    };
    const res2 = createResponse();
    req.body = call2;
    displays.handleIncomingData(req2, res2);
    expect(displays.callHistory.length).to.equal(1);
    expect(displays.callHistory[0].callData.ccText).to.not.equal(prior);
  });

  it('should send 400 Bad Request when call cannot be parsed', function() {
    const socket = createSocket();
    const call = {foo: 'bar'};
    call.location = String.Empty;

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = createResponse();
    displays.handleIncomingData(req, res);
    expect(res.status.calledWith(400)).to.be.true;
    expect(displays.callHistory.length).to.equal(0);
  });

  it('call history should not exceed call history limit', function() {
    const socket = createSocket();
    displays.handleConnection(socket);

    const res = createResponse();
    const call = createCall('MESA');
    call.location = String.Empty;
    let req = {
      body: call,
    };
    for (let i = 0; i < displays.CALL_HISTORY_LIMIT; i++) {
      call.callNumber = i.toString();
      displays.handleIncomingData(req, res);
    }
    expect(displays.callHistory.length).to.equal(displays.CALL_HISTORY_LIMIT);
    // add one more to go over
    call.callNumber = displays.CALL_HISTORY_LIMIT + 1;
    displays.handleIncomingData(req, res);
    expect(displays.callHistory.length).to.equal(displays.CALL_HISTORY_LIMIT);
  });

  it('should discard calls for unhandled stations', function() {
    const socket = createSocket();
    const call = createCall('Q*BERT');
    call.location = String.Empty;

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = createResponse();
    displays.handleIncomingData(req, res);
    expect(res.status.calledWith(200)).to.be.true;
    expect(res.send.args[0][0]).to.include('Not configured');
    expect(displays.callHistory.length).to.equal(0);
  });

  it('should not fetch directions when no location is provided', function(done) {
    this.timeout(5000);
    const socket = createSocket();
    const call = createCall('MESA');
    call.location = String.Empty;

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = createResponse();
    displays.handleIncomingData(req, res);
    expect(socket.emit.calledWith('call')).to.be.true;
    expect(socket.emit.calledWith('directions')).to.be.false;
    done();
  });

  it('should fetch directions when a location is provided', function(done) {
    this.timeout(5000);
    const socket = createSocket();
    const call = createCall('MESA');

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = createResponse();
    displays.handleIncomingData(req, res)
      .then(function() {
        expect(socket.emit.calledWith('call')).to.be.true;
        expect(socket.emit.calledWith('directions')).to.be.true;
        expect(socket.emit.args[2][1].cached).to.be.false;
        done();
      });
  });

  it('should not fetch directions if it has already been fetched', function(done) {
    this.timeout(7000);
    const socket = createSocket();
    const call = createCall('MESA');

    displays.handleConnection(socket);
    let req = {
      body: call,
    };
    let res = createResponse();
    displays.handleIncomingData(req, res)
      .then(function() {
        const call2 = createCall('MESA');
        let req2 = {
          body: call2,
        };
        let res2 = createResponse();
        return displays.handleIncomingData(req2, res2);
      })
      .then(function() {
        expect(socket.emit.calledWith('call')).to.be.true;
        expect(socket.emit.calledWith('directions')).to.be.true;
        expect(socket.emit.args[4][1].cached).to.be.true;
        done();
      })
      .catch(function(err) {
        chai.assert(false, err);
        done();
      });
  });
});
