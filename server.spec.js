/* eslint-env node, mocha */

'use strict';

const expect = require('chai').expect;

// we should set up some test STATIONS = [...] here?

describe('stations', function() {
  it('should find based on id', function() {
    const station = findStationd('CES');
    expect(station).to.equal(STATIONS[0]);
  });

  it('should find based on ip regex', function() {
    const station = findStationBasedOnIpMatch('192.168.1.1');
    expect(station).to.equal(STATIONS[0]);
  });
});

describe('call', function() {
  it('should be valid when parsed ok', function() {
    const body = { };
    const data = parseFrom911(body);
    expect(data.valid).to.be.true;
  });

  it('should be invalid when not parsable', function() {
    const body = { };
    const data = parseFrom911(body);
    expect(data.valid).to.be.false;
  });

  it('should be invalid when missing required data', function() {
    const body = { };
    const data = parseFrom911(body);
    expect(data.valid).to.be.false;
  });
});

describe('call logs', function() {
  it('should render logs for station requesting them', function() {

  });
});

describe('sockets', function() {
  it('should allow ip matched displays', function() {

  });
  it('should not allow displays with unmatched ips', function() {

  });
  it('should track connected displays', function() {

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
  it('directions should be acknowledged upon receipt by display', function() {

  });
});
