/* eslint-env jquery */
/* globals moment, io, document */

(function() {
  'use strict';

  const OUT_SECS = 60 * 2; // when call should go away
  const socket = io();

  const calls = []; // keep track of currently active calls

  let countdownHandle = null;
  // let currentCallNumber = '';

  /**
   * handle directions, display route and map
   *
   * data from websocket from server:
   * @param {string} callNumber id of call from 911 system
   * @param {object} response google directions api results
   * @param {string} mapUrl google static map url with route highlighted
   */
  socket.on('xdirections', function(msg, ackHandler) {
    if (ackHandler) ackHandler(true);

    const callNumber = msg.callNumber;
    const data = msg.response;
    const mapUrl = msg.mapUrl + '&size=';

    if (callNumber !== currentCallNumber) {
      // directions are for a different call
      console.log('directions came in for ', callNumber, ' but we are currently on call ', currentCallNumber);
      return;
    }

    // display estimated travel time
    if (data.json.routes.length > 0 &&
      data.json.routes[0].legs.length > 0 &&
      data.json.routes[0].legs[0].steps.length > 0) {
      $('.travel-time').text('estimated travel time is ' + data.json.routes[0].legs[0].duration.text);
    }

    // display route travel directions
    if ($('.route ol').length != 0) {
      // clear them if they already have something
      $('.route').empty();
      $('.route').append($('<ol>'));
    }
    for (let i = 0; i < data.json.routes[0].legs[0].steps.length; i++) {
      $('.route ol').append($('<li>')
        .html(data.json.routes[0].legs[0].steps[i].html_instructions +
           ' (' + data.json.routes[0].legs[0].steps[i].distance.text + ')'));
    }

    // size the map to the container and have the browser fetch it
    const m = $('.map');
    m.empty();
    m.append($('<img src="' + mapUrl + m[0].parentElement.offsetWidth + 'x' + m[0].parentElement.offsetHeight + '"/>'));
  });

  /**
   * display initial or updated call information
   *
   * data from websocket from server
   * @param {string} callNumber id of call from 911
   * @param {object} response call data from 911
   */
  socket.on('call', function(data, ackHandler) {
    // acknowledge that we received the data
    if (ackHandler) ackHandler(true);

    // if this is a new call then add it to our active calls list
    const callNumber = data.callNumber;
    let callEl = document.querySelector("[data-call-number='" + callNumber + "']"); /* eslint quotes:off */
    let call = calls.find((entry) => entry.data.callNumber == callNumber);
    if (call == null) {
      // duplicate the template and add the call info to the dom
      callEl = document.getElementsByClassName('template')[0].cloneNode(true);
      callEl.classList.remove('template');
      callEl.classList.remove('hidden');
      callEl.dataset.callNumber = callNumber;

      // add to the active calls,
      call = {
        data,
        countdownStart: moment(),
      };
      calls.push(call);

      // display when the call came in to 911 operator
      let callTime = moment(data.callDateTime, 'MM/DD/YYYY HH:mm:ss');
      $(callEl).find('.call .time').text('Call came in at ' + callTime.format('h:mm a'));
      $(callEl).find('.call .elapsed').text(moment.preciseDiff(callTime, moment()) + ' ago');
      $(callEl).find('.countdown').text('00');

      call.countdownHandle = setInterval(function() {
        let callEl = document.querySelector("[data-call-number='" + callNumber + "']"); /* eslint quotes:off */
        const elapsed = Math.floor((moment() - call.countdownStart) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = ('00' + Math.floor(elapsed - mins * 60).toString()).slice(-2);
        if (mins == 0) {
          $(callEl).find('.countdown').text(secs);
        } else {
          $(callEl).find('.countdown').text(mins.toString() + ':' + secs);
        }
        $(callEl).find('.call .elapsed').text(moment.preciseDiff(callTime, moment()) + ' ago');

        // if we reached OUT_SECS, then reset and hide and remove from active calls
        if (elapsed >= OUT_SECS) {
          clearInterval(call.countdownHandle);
          call.countdownHandle = null;
          callEl.parentElement.removeChild(callEl);
          calls.splice(calls.indexOf(call), 1);
        }
      }, 1000);

      document.body.appendChild(callEl);
    } else {
      // we found it, so maybe we are getting updated info
      call.data = data;
    }

    if (data.callType) {
      $(callEl).find('.call-type').text(data.callType);
    }
    if (data.dispatchCode) {
      $(callEl).find('.dispatch-code').text(data.dispatchCode);
    }

    if (data.breathing) {
      $(callEl).find('.breathing').text('BREATHING: ' + data.breathing);
    }
    if (data.conscious) {
      $(callEl).find('.conscious').text('CONSCIOUS: ' + data.conscious);
    }

    if (data.location) {
      $(callEl).find('.location').text(data.location);
    }
    if (data.venue) {
      $(callEl).find('.venue').text(data.venue);
    }
    if (data.crossStreets) {
      $(callEl).find('.cross-streets').text(data.crossStreets);
    }
  });

  /**
   * clear the screen contents of call data, and unhide the container
   */
  // function reset() {
  //   $('.field').text('');
  //   $('.route').empty();
  //   $('.route').append($('<ol>'));
  //   $('.map').empty();
  //   $('.countdown').removeClass('red');
  //   $('.container').removeClass('hidden');
  // }

  /**
   * display status
   */
  function statusUpdate() {
    fetch('/status')
      .then((results) => results.json())
      .then((results) => {
        console.log(results);
      });
  }
  // statusUpdate();
})();
