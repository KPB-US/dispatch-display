/* eslint-env node, mocha */

const expect = require('chai').expect;
const stations = require('../lib/stations');

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
stations.STATIONS.concat( [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

describe('stations', function() {
  it('should find based on id', function() {
    const station = stations.findStation('MESA');
    expect(station).to.equal(stations.STATIONS[0]);
  });

  it('should find based on ip regex', function() {
    const station = stations.findStationBasedOnIpMatch('192.168.1.1');
    expect(station).to.equal(stations.STATIONS[0]);
  });

  it('should not find based on ip regex', function() {
    const station = stations.findStationBasedOnIpMatch('192.168.2.1');
    expect(station).to.be.undefined;
  });
});

