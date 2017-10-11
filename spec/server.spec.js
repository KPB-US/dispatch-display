/* eslint-env node, mocha */

const chai = require('chai');
const should = chai.should();
const expect = chai.expect;
const chaiHttp = require('chai-http');
const stations = require('../lib/stations');
const app = require('../server');

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
stations.STATIONS.concat( [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

chai.use(chaiHttp);

// https://scotch.io/tutorials/test-a-node-restful-api-with-mocha-and-chai

describe('displays', function() {

  after(function(done) {
    // hangs if we dont close
    app.close();
    done();
  });

  it('should obtain index page', function(done) {
    chai.request(app)
    .get('/')
    .end(function(err, res) {
      if (err) return done(err);
      res.should.have.status(200);
      expect(res).to.be.html;
      done();
    });
  });

  it('should request call logs', function() {
    
  });
    
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
