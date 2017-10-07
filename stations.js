const STATIONS = [ /* eslint no-multi-spaces: off */
  // {id: 'BCFSA',  lat: 60.1693453, lng: -149.4019433, ip_match_regex: /::1/},
  // {id: 'CES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.0\.3\.*/},
  {id: 'NES',    lat: 60.04344,   lng: -151.666735, ip_match_regex: /.*/},
  {id: 'NFSA',   lat: 60.6293049, lng: -151.341654, ip_match_regex: /.*/},
  {id: 'APFSA',  lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.0\.3\.*/},
  {id: 'CES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /1\.*/},
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
 * returns station matching ip rule
 *
 * @param {string} ip ip address of client
 * @return {object} STATION entry or null if not found
 */
function findStationBasedOnIpMatch(ip) {
    return STATIONS.find((entry) => ip.match(entry.ip_match_regex) != null);
}

module.exports =  {STATIONS, findStation, findStationBasedOnIpMatch};
