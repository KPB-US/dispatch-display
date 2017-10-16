const STATIONS = [ /* eslint no-multi-spaces: off */
  {id: 'CES',    lat: 60.4829661, lng: -151.0722942, ip_match_regex: /10\.5[1-6]\.1\..*/},
  {id: 'KESA',   lat: 59.74515,   lng: -151.258885,  ip_match_regex: /10\.11[12]\.1\..*/},
//  {id: 'KFD',    lat: 60.5597144, lng: -151.2502446, ip_match_regex: /.*/},
//  {id: 'NES',    lat: 60.04344,   lng: -151.666735,  ip_match_regex: /.*/},
  {id: 'NFSA',   lat: 60.6293049, lng: -151.341654,  ip_match_regex: /10\.7[12]\.1\..*/},
  {id: 'APFSA',  lat: 59.7796476, lng: -151.8342569, ip_match_regex: /10\.8[12]\.1\..*/},
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
