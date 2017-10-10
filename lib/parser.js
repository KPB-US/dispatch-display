/**
 * parses incoming data from the 911 system into an object we can use
 *
 * @param {object} body JSON posted from 911 system
 * @return {object} formattedData expected by display system
 */
function parse(body) {
  let data = {
    callNumber: null,
    callDateTime: null,
    callType: 'Unknown',
    callInfo: '',
    ccText: '',

    station: null,
    dispatchDateTime: null,
    dispatchCode: '?', // severity level

    location: null,
    crossStreets: null,
    venue: null,
    valid: false,
  };

  try {
    /* must haves */
    data.callNumber = body.callNumber;
    data.station = body.station;

    // call type is prefixed by some number and a dash
    let parts = body.callType.split('-');
    if (parts.length > 1) {
      parts.shift();
    }
    data.callType = parts.join('-');

    data.callDateTime = body.callDateTime;
    data.dispatchDateTime = body.dispatchDateTime;

    // it will have a dispatch code but we might not be able to parse the priority from it
    let dispatchCode = body.dispatchCode.match(/[A-Z]/);
    if (dispatchCode && dispatchCode.length > 0) {
      data.dispatchCode = dispatchCode[0];
    } else {
      data.dispatchCode = '?';
    }

    /* might haves */
    if (body.location) {
      data.location = body.location;
      // if the location only consists of numbers then it is most likely latlng
      // and should have the zeroes trimmed
      if (/^[0-9,.-]+$/.test(data.location)) {
        const parts = /^([0-9.-]+?)0*,([0-9.-]+?)0*$/.exec(data.location);
        data.location = parts[1] + ',' + parts[2];
      }
    }
    if (body.locationType) data.locationType = body.locationType;
    if (body.crossStreets) data.crossStreets = body.crossStreets;
    if (body.venue) data.venue = body.venue;
    if (body.breathing) data.breathing = body.breathing;
    if (body.conscious) data.conscious = body.conscious;
    if (body.commonName) data.commonName = body.commonName;
    if (body.response) data.response = body.response;
    if (body.callInfo) data.callInfo = body.callInfo;
    if (body.ccText) data.ccText = body.ccText;

    // if (data.location.toUpperCase() === '<UNKNOWN>' || data.callType.toUpperCase() === '<NEW CALL>') {
    //   throw new Error('unknown location or new call with insufficient data');
    // }

    data.valid = true; // if we got this far, it's a valid incoming packet of data
  } catch (e) {
    // console.log(e);
    data.valid = false;
  }

  return data;
}

module.exports = {parse};
