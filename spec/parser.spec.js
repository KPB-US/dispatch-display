/* eslint-env node, mocha */

const expect = require('chai').expect;
const parser = require('../lib/parser');

// this will be specific to your incoming data...

const sample = {
  location: '144 N BINKLEY ST',
  venue: 'SOLDOTNA',
  crossStreets: 'N BINKLY ST / PARK ST',
  station: 'CES',
  commonName: 'Admin Building',
  callNumber: '4448',
  callType: '43-Caffeine Withdrawal',
  callDateTime: '09/25/2017 08:44:34',
  dispatchDateTime: '09/25/2017 08:47:47',
  dispatchCode: '25C01',
  callInfo: '43 year old, male, breathing, conscious.',
  ccText: 'shakes and convulsions',
};

describe('parse', function() {
  // generic tests

  it('should be valid when parsed ok', function() {
    const data = parser.parse(sample);
    expect(data.valid).to.be.true;
  });

  it('should be invalid when not parsable', function() {
    const body = {foo: 'bar'};
    const data = parser.parse(body);
    expect(data.valid).to.be.false;
  });

  it('should be invalid when missing required data', function() {
    let body = JSON.parse(JSON.stringify(sample));
    body.callNumber = null;
    body.callType = undefined;
    const data = parser.parse(body);
    expect(data.valid).to.be.false;
  });

  // specific tests

  it('should extract letter from dispatchCode', function() {
    const data = parser.parse(sample);
    expect(data.dispatchCode).to.equal('C');
  });

  it('should remove trailing zeros from latlng', function() {
    let body = JSON.parse(JSON.stringify(sample));
    body.location = '60.12340000000,-151.93840000000';
    const data = parser.parse(body);
    expect(data.location).to.equal('60.1234,-151.9384');
  });
});

