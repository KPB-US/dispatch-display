'use strict';

/**
 * ServiceAreas
 */
class Areas { /* eslint no-unused-vars: off */
  /**
   * construct class for determining bounds of the area
   */
  constructor() {
    /**
     * These are the bounds for the service areas so we can try to obtain more precise geocoding on addresses
     */
    this.AREAS = [ /* eslint no-multi-spaces: off */
      {id: 'TEST',  bounds: {sw: {lat: 59.65330271, lng: -151.8705092}, ne: {lat: 61.25310536,  lng: -149.8731469}}},
      {id: 'APFSA', bounds: {sw: {lat: 59.70365140, lng: -151.8705092}, ne: {lat: 59.95370723,  lng: -151.5705850}}},
      {id: 'CES',   bounds: {sw: {lat: 60.21213251, lng: -151.4253571}, ne: {lat: 60.81998024,  lng: -149.8731469}}},
      {id: 'KESA',  bounds: {sw: {lat: 59.65330271, lng: -151.7881408}, ne: {lat: 59.93944592,  lng: -150.8635843}}},
      {id: 'KFD',   bounds: {sw: {lat: 60.51649993, lng: -151.3357507}, ne: {lat: 60.60361148,  lng: -151.0731701}}},
      {id: 'NFSA',  bounds: {sw: {lat: 60.58171538, lng: -151.4264242}, ne: {lat: 61.25310536,  lng: -150.0042887}}},
    ];
  }

  /**
   * returns bounds for area matching id
   *
   * @param {string} id id of area
   * @return {object} bounds from area entry or null or undefined if not found
   */
  bounds(id) {
    let a = this.AREAS.find((entry) => entry.id == id);
    if (a) {
      a = a.bounds;
    }
    return a;
  }
}
