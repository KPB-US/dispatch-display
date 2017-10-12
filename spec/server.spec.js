/* eslint-env node, mocha */

const chai = require('chai');
const should = chai.should();
const expect = chai.expect;
const chaiHttp = require('chai-http');
const stations = require('../lib/stations');
const app = require('../server');

chai.use(chaiHttp);

// set up our test stations
stations.STATIONS.splice(0, stations.STATIONS.length);
stations.STATIONS.concat( [
  {id: 'MESA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.1\.[0-9]+/},
  {id: 'NSA', lat: 59.74515, lng: -151.258885, ip_match_regex: /192\.168\.3\.[0-9]+/},
]);

describe('server', function() {
  after(function(done) {
    // hangs if we dont close
    app.close();
    done();
  });

  it('should respond with index page', function(done) {
    chai.request(app)
    .get('/')
    .end(function(err, res) {
      if (err) return done(err);
      res.should.have.status(200);
      expect(res).to.be.html;
      done();
    });
  });
});
