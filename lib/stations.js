/**
 * This is used to determine the origin for the driving directions and
 * to identify which sockets/displays get which service area calls.
 */
const STATIONS = [ /* eslint no-multi-spaces: off */
  {id: 'TEST1',  area: 'TEST',  lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'APFSA0', area: 'APFSA', lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'APFSA1', area: 'APFSA', lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.81\.1\.[0-9]+/},
  {id: 'APFSA2', area: 'APFSA', lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.82\.1\.[0-9]+/},
  {id: 'CES0',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'CES1',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.51\.1\.[0-9]+/},
  {id: 'CES2',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.52\.1\.[0-9]+/},
  {id: 'CES3',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.53\.1\.[0-9]+/},
  {id: 'CES4',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.54\.1\.[0-9]+/},
  {id: 'CES5',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.55\.1\.[0-9]+/},
  {id: 'CES6',   area: 'CES',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.56\.1\.[0-9]+/},
  {id: 'KESA0',  area: 'KESA',  lat: 59.74515,   lng: -151.258885,  ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'KESA1',  area: 'KESA',  lat: 59.74515,   lng: -151.258885,  ip_match_regex: /10\.111\.1\.[0-9]+/},
  {id: 'KESA2',  area: 'KESA',  lat: 59.74515,   lng: -151.258885,  ip_match_regex: /10\.112\.1\.[0-9]+/},
  {id: 'KFD0',   area: 'KFD',   lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'NFSA0',  area: 'NFSA',  lat: 60.6293049, lng: -151.341654,  ip_match_regex: /10\.0\.[134]\.[0-9]+|::1/},
  {id: 'NFSA1',  area: 'NFSA',  lat: 60.6293049, lng: -151.341654,  ip_match_regex: /10\.71\.[12]\.[0-9]+/},
  {id: 'NFSA2',  area: 'NFSA',  lat: 60.6293049, lng: -151.341654,  ip_match_regex: /10\.72\.[12]\.[0-9]+/},
];

/**
 * returns station matching id
 *
 * @param {string} id id of station
 * @return {object} STATION entry or null if not found
 */
function findStation(id) {
  return STATIONS.find((entry) => entry.id == id);
}

/**
 * returns stations matching area
 *
 * @param {string} area area to find
 * @return {array} STATION entries or null if not found
 */
function findStationsByArea(area) {
  return STATIONS.filter((entry) => entry.area == area);
}

/**
 * returns stations matching ip rule
 *
 * @param {string} ip ip address of client
 * @return {array} STATION entries or null if not found
 */
function findStationsByIpMatch(ip) {
    return STATIONS.filter((entry) => ip.match(entry.ip_match_regex) != null);
}

module.exports =  {STATIONS, findStation, findStationsByArea, findStationsByIpMatch};
