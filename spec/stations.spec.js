/* eslint-env node, mocha */

const expect = require('chai').expect;
const stations = require('../lib/stations');

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
Array.prototype.push.apply(stations.STATIONS, [ /* eslint no-multi-spaces: off */
  {id: 'MESA1', area: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'TEST1', area: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.8\.1/},
  {id: 'MESA2', area: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.2\.[0-9]+/},
  {id: 'NSA1',  area: 'NSA',  lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
  {id: 'TEST2', area: 'NSA',  lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.8\.1/},
]);

describe('stations', function() {
  it('should find based on id', function() {
    const station = stations.findStation('MESA1');
    expect(station).to.equal(stations.STATIONS[0]);
  });

  it('should find based on ip regex', function() {
    const matches = stations.findStationsByIpMatch('192.168.8.1');
    expect(matches.length).to.equal(2);
  });

  it('should not find based on ip regex', function() {
    const matches = stations.findStationsByIpMatch('192.168.9.1');
    expect(matches.length).to.equal(0);
  });
});

