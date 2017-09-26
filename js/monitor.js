/* eslint-env jquery */
/* globals moment, io */

(function() {
    'use strict';

  const OUT_SECS = 60 * 10; // when call should go away
  const socket = io();
  let countdownHandle = null;
  let currentCallNumber = '';

  /**
   * handle directions, display route and map
   *
   * data from websocket from server:
   * @param {string} callNumber id of call from 911 system
   * @param {object} response google directions api results
   * @param {string} mapUrl google static map url with route highlighted
   */
  socket.on('directions', function(msg) {
    const callNumber = msg.callNumber;
    const data = msg.response;
    const mapUrl = msg.mapUrl + '&size=';

    if (callNumber !== currentCallNumber) {
      // directions are for a different call
      console.log('directions came in for ', callNumber, ' but we are currently on call ', currentCallNumber);
      return;
    }

    // size the map to the container and have the browser fetch it
    const m = $('.map');
    m.append($('<img src="' + mapUrl + m[0].parentElement.offsetWidth + 'x' + m[0].parentElement.offsetHeight + '"/>'));

    // display estimated travel time
    if (data.json.routes.length > 0 &&
      data.json.routes[0].legs.length > 0 &&
      data.json.routes[0].legs[0].steps.length > 0) {
      $('.travel-time').text('estimated travel time is ' + data.json.routes[0].legs[0].duration.text);
    }

    // display route travel directions
    for (let i = 0; i < data.json.routes[0].legs[0].steps.length; i++) {
      $('.route ol').append($('<li>')
        .html(data.json.routes[0].legs[0].steps[i].html_instructions +
           ' (' + data.json.routes[0].legs[0].steps[i].distance.text + ')'));
    }
  });

  /**
   * display initial or updated call information
   *
   * data from websocket from server
   * @param {string} callNumber id of call from 911
   * @param {object} response call data from 911
   */
  socket.on('call', function(data, ackHandler) {
    // $('.incoming-calls').append($('<li>').append($('<pre>').text(JSON.stringify(msg, undefined, 2))));
    if (ackHandler) ackHandler(true);

    const callNumber = data.callNumber;

    // if this is a new call, reset the timer and on-screen details
    if (currentCallNumber != callNumber) {
      currentCallNumber = callNumber;
      if (countdownHandle != null) {
        clearInterval(countdownHandle);
      }
      reset();

      let countdownStart = moment();
      // display when the call came in to 911 operator
      let callTime = moment(data.callDateTime, 'MM/DD/YYYY HH:mm:ss');
      $('.call .time').text('Call came in at ' + callTime.format('h:mm a'));
      $('.call .elapsed').text(moment.preciseDiff(callTime, moment()) + ' ago');
      $('.countdown').text('00');
      countdownHandle = setInterval(function() {
        const elapsed = Math.floor((moment() - countdownStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = ('00' + Math.floor(elapsed - mins * 60).toString()).slice(-2);
        if (mins == 0) {
          $('.countdown').text(secs);
        } else {
          $('.countdown').text(mins.toString() + ':' + secs);
        }
        $('.call .elapsed').text(moment.preciseDiff(callTime, moment()) + ' ago');

        // if we reached OUT_SECS, then reset and hide
        if (elapsed >= OUT_SECS) {
          $('.container').addClass('hidden');
          clearInterval(countdownHandle);
          countdownHandle = null;
          currentCallNumber = '';
        }
      }, 1000);
    }

    if (data.callType) {
      $('.call-type').text(data.callType);
    }
    if (data.dispatchCode) {
      $('.dispatch-code').text(data.dispatchCode);
    }

    if (data.breathing) {
      $('.breathing').text('BREATHING: ' + data.breathing);
    }
    if (data.conscious) {
      $('.conscious').text('CONSCIOUS: ' + data.conscious);
    }

    if (data.location) {
      $('.location').text(data.location);
    }
    if (data.venue) {
      $('.venue').text(data.venue);
    }
    if (data.crossStreets) {
      $('.cross-streets').text(data.crossStreets);
    }
  });

  /**
   * clear the screen contents of call data, and unhide the container
   */
  function reset() {
    $('.field').text('');
    $('.route').empty();
    $('.route').append($('<ol>'));
    $('.map').empty();
    $('.countdown').removeClass('red');
    $('.container').removeClass('hidden');
  }
})();
