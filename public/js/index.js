/* eslint-env browser, jquery */
/* globals moment, io */

(function() {
  'use strict';

  const CALL_ACTIVE_SECS = 60 * 10; // time the call is active after which it should disappear
  const SWITCH_AFTER_SECS = 5; // how quickly we should switch between active calls

  const socket = io();
  const calls = []; // keep track of currently active calls

/**
 * update the index
 *
 * @param {string} x call index
 * @param {string} y calls count
 */
  function updateCallIndex(x, y) {
    let html = '';
    if (y > 1) {
      for (let i = 1; i <= y; i++) {
        if (i == x) {
          html += `<i class="current">${calls[i - 1].data.dispatchCode}</i>`;
        } else {
          html += `<i>${calls[i - 1].data.dispatchCode}</i>`;
        }
      }
    }
    if ($('.calls-index').html() != html) {
      $('.calls-index').html(html);
    }
  }

  // set up a timer that will iterate through displaying the call
  setInterval(function() {
    // if there are calls hide the log, otherwise, show the log
    if (calls.length > 0) {
      $('.calls-log').addClass('hidden');
    } else {
      if ($('.calls-log').hasClass('hidden')) {
        socket.emit('calls-log-query');
        $('.calls-log').empty();
        $('.calls-log').removeClass('hidden');
      }
    }

    let urgentCall = calls.find((entry) => entry.visibleAt == -1);
    if (urgentCall) {
      // hide the other call containers and set their activeAt time to 0
      let el = $('.container.shown').addClass('hidden').removeClass('shown');
      // revert after 1s so transition can come in from right
      setTimeout(() => {
        $(el).removeClass('hidden');
      }, 1000);

      for (let i = 0; i < calls.length; i++) {
        calls[i].visibleAt = null;
      }
      urgentCall.visibleAt = moment();
      const callEl = document.querySelector("[data-call-number='" +
        urgentCall.data.callNumber + "']"); /* eslint quotes:off */
      $(callEl).removeClass('hidden').addClass('shown');
      if (!urgentCall.mapDisplayed && urgentCall.mapUrl) {
        displayMap(urgentCall);
      }
      updateCallIndex(calls.indexOf(urgentCall) + 1, calls.length);
      return;
    }

    // purge expired entries
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].state && calls[i].state == 'EXPIRED') {
        clearInterval(calls[i].countdownHandle);
        calls[i].countdownHandle = null;
        const callEl = document.querySelector("[data-call-number='" +
          calls[i].data.callNumber + "']"); /* eslint quotes:off */
        calls.splice(i, 1);
        if ($(callEl).hasClass('shown')) {
          $(callEl).removeClass('shown').addClass('hidden');
        }
        // remove from dom behind the scenes so it transitions out nicely
        setTimeout(() => {
          callEl.parentElement.removeChild(callEl);
        }, 1000);
      }
    }

    let currentCall = calls.find((entry) => entry.visibleAt != null);
    let nextCall = null;
    if (currentCall == undefined) {
      // there is no call currently visible
      if (calls.length > 0) {
        nextCall = calls[0];
      }
    } else {
      // display the map if we haven't yet
      if (!currentCall.mapDisplayed && currentCall.mapUrl) {
        displayMap(currentCall);
      }

      // see if the current call has been shown long enough
      if (moment().diff(currentCall.visibleAt) / 1000 > SWITCH_AFTER_SECS) {
        let i = calls.indexOf(currentCall);
        if (i < calls.length - 1) {
          nextCall = calls[i + 1];
        } else if (calls.length > 1) {
          // greater than one since one of them is the one that is current, wrap around
          nextCall = calls[0];
        } else {
          // the current call is the only call
          nextCall = currentCall;
        }
      } else {
        // still on current call
        nextCall = currentCall;
      }
    }

    updateCallIndex(calls.indexOf(nextCall) + 1, calls.length);
    if (nextCall == currentCall) {
      return;
    }

    // go to the next call if there is one and it's not the current call
    if (currentCall && nextCall != null) {
      const callEl = document.querySelector("[data-call-number='" +
        currentCall.data.callNumber + "']"); /* eslint quotes:off */
      $(callEl).addClass('hidden').removeClass('shown');
      // revert after 1s so transition can come in from right
      setTimeout(() => {
        $(callEl).removeClass('hidden');
      }, 1000);
      currentCall.visibleAt = null;
    }

    if (nextCall) {
      const callEl = document.querySelector("[data-call-number='" +
        nextCall.data.callNumber + "']"); /* eslint quotes:off */
      $(callEl).removeClass('hidden').addClass('shown');
      nextCall.visibleAt = moment();
    }
  }, 1000);

  /**
   * handle directions, display route and map
   *
   * data from websocket from server:
   * @param {string} callNumber id of call from 911 system
   * @param {object} response google directions api results
   * @param {string} mapUrl google static map url with route highlighted
   */
  socket.on('directions', function(data, ackHandler) {
    if (ackHandler) ackHandler(true);

    const callNumber = data.callNumber;
    const directions = data.response;
    const mapUrl = data.mapUrl + '&size=';

    // find the dom element for the call we are on
    let callEl = document.querySelector("[data-call-number='" + callNumber + "']"); /* eslint quotes:off */
    if (callEl == null) {
      // directions are for a different call that we no longer or never have shown
      console.log('directions came in for ', callNumber, ' but that call is not active');
      return;
    }

    // display estimated travel time
    let route = (directions.json.routes.length > 0 ? directions.json.routes[0] : null);
    if (route && route.legs.length > 0 && route.legs[0].steps.length > 0) {
      $(callEl).find('.travel-time').text('estimated travel time is ' + route.legs[0].duration.text);
    }

    // display route travel directions
    if ($(callEl).find('.route ol').length != 0) {
      // clear them if they already have something
      $(callEl).find('.route').empty();
      $(callEl).find('.route').append($('<ol>'));
    }
    for (let i = 0; i < route.legs[0].steps.length; i++) {
      $(callEl).find('.route ol').append($('<li>')
        .html(route.legs[0].steps[i].html_instructions +
           ' (' + route.legs[0].steps[i].distance.text + ')'));
    }

    // Since we have to size the map to the container and have the browser fetch it
    // queue it up to happen when the call is visible
    let call = calls.find((entry) => entry.data.callNumber == callNumber);
    if (call != undefined) {
      call.mapUrl = mapUrl;
      call.mapDisplayed = false;
    } else {
      console.log('call is not defined so we cannot store the mapUrl');
    }
  });

/**
 * display the map
 *
 * @param {object} call call to display map for
 */
  function displayMap(call) {
    let callEl = document.querySelector("[data-call-number='" + call.data.callNumber + "']"); /* eslint quotes:off */
    const m = $(callEl).find('.map');
    m.empty();
    let width = m[0].parentElement.offsetWidth;
    let height = m[0].parentElement.offsetHeight;
    m.append($('<img src="' + call.mapUrl + width + 'x' + height + '"/>'));
    call.mapDisplayed = true;
  }

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
      if (callEl == null) {
        console.error('the html is not structured as expected');
        return;
      }
      callEl.classList.remove('template');
      callEl.dataset.callNumber = callNumber;
      const callContainer = document.getElementsByClassName('template')[0].parentElement;
      // add to the active calls,
      call = {
        data,
        countdownStart: moment(),
        visibleAt: -1, // immediately
      };

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

        // if we reached CALL_ACTIVE_SECS, then reset and hide and remove from active calls
        if (elapsed >= CALL_ACTIVE_SECS) {
          call.state = 'EXPIRED';
        }
      }, 1000);

      callContainer.appendChild(callEl);
      calls.push(call);
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

    // if (data.breathing) {
    //   $(callEl).find('.breathing').text('BREATHING: ' + data.breathing);
    // }
    // if (data.conscious) {
    //   $(callEl).find('.conscious').text('CONSCIOUS: ' + data.conscious);
    // }
    if (data.callInfo) {
      $(callEl).find('.call-info').text(data.callInfo);
    }
    if (data.ccText) {
      $(callEl).find('.call-cctext').text(data.ccText);
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
   * display calls log
   *
   * data from websocket from server
   * @param {array} calls array of call data for this station
   */
  socket.on('calls-log', function(data, ackHandler) {
    // acknowledge that we received the data
    if (ackHandler) ackHandler(true);

    console.log('got calls-log', data);
    const rows = data.calls.map((entry) => `<tr><td>${entry.callData.callDateTime}</td><td>${entry.callData.callType}</td><td>${entry.callData.dispatchCode}</td><td>${entry.callData.location}</td></tr>`)
      .join('');
    $('.calls-log').html('<table>' + rows + '</table>');
  });
})();
