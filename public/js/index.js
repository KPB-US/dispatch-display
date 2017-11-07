/* eslint-env browser, jquery */
/* globals google, moment, io */

(function() {
  'use strict';

  let isMapApiLoaded = false;
  let isRollbarConfigured = false;

  const ONLINE_CHECK_URL = 'http://localhost:8000/online_check.html';
  let CALL_ACTIVE_SECS = 60 * 25; // time the call is active after which it should disappear, overriden in config msg below
  const SWITCH_AFTER_SECS = 10; // how quickly we should switch between active calls
  const LAST_X_TEXT_DIRECTIONS = 6; // how many text directions steps to show

  const socket = io();
  const calls = []; // keep track of currently active calls

  let STATIONS = []; // stations this display is associated with
  let ADDRESS_SUFFIX = ''; // address suffix for resolving addresses

  /**
 * update the .calls-index element with which page (call) we are displaying
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
      $('.callslog').addClass('hidden');
      $('.messages').addClass('hidden');
      $('.messages').empty();
    } else {
      if ($('.callslog').hasClass('hidden')) {
        socket.emit('callslog-query');
        $('.callslog').empty();
        $('.callslog').removeClass('hidden');
      }
      $('div#time').text(new Date().toLocaleTimeString());

      // if we have lost connectivity and we have an online check url then go there
      if (!navigator.onLine && ONLINE_CHECK_URL) {
        window.location = ONLINE_CHECK_URL;
        return;
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
      if (!urgentCall.mapDisplayed) {
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
      if (!currentCall.mapDisplayed) {
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
          // reset the zoom
          if (currentCall.map && currentCall.map.getZoom() < 16) {
            currentCall.map.setZoom(14);
          }
          // reset the timer
          currentCall.visibleAt = moment();
        }
      } else {
        // still on current call
        nextCall = currentCall;
        // after we've been displayed for a third of the time, flip the zoom
        if (moment().diff(currentCall.visibleAt) / 1000 > SWITCH_AFTER_SECS / 2) {
          if (currentCall.map) {
            if (currentCall.map.getZoom() < 16) {
              currentCall.map.setZoom(15);
            }
            currentCall.map.setCenter(currentCall.args.destination);
          }
        }
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
      // reset zoom back to 14
      if (currentCall.map && currentCall.map.getZoom() < 16) {
        currentCall.map.setZoom(14);
      }
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
   * @param {object} data call data
   * @return {void} none
   */
  // function handleDirections(data) {
  //   const callNumber = data.callNumber;
  //   const directions = data.response;






  // const destination = (data.location.match(/[A-Z]/) == null ?
  //   data.location.split(',').map((s) => Number(s)) : data.location + ADDRESS_SUFFIX);
  // return googleMapsClient.directions({
  //   origin: [station.lat, station.lng],
  //   destination: destination,
  //   mode: 'driving',
  // }).asPromise()
  //   .then((response) => {
  //     // log('google directions api response', response);
  //     // if we got something and there is a route
  //     if (response.json.status === 'OK' && response.json.routes[0].legs[0] &&
  //       // must be less than 100 miles away or else google found some other matching location
  //       response.json.routes[0].legs[0].distance.value < 160934) {
  //       let dispatchCode = data.dispatchCode || 'X';
  //       const markers = '&markers=color:red|label:' + dispatchCode + '|' +
  //         response.json.routes[0].legs[0].end_location.lat + ',' +
  //         response.json.routes[0].legs[0].end_location.lng;
  //       const enc = encodeURIComponent(response.json.routes[0].overview_polyline.points);
  //       const directions = {
  //         callNumber: data.callNumber,
  //         station: data.station,
  //         response,
  //         cached: false,
  //         args: {
  //           origin: response.json.routes[0].legs[0].start_location,
  //           destination: response.json.routes[0].legs[0].end_location,
  //         },
  //         // centering on the destination to show the ending route in detail
  //         mapUrl: STATIC_MAP_BASE_URL + '&path=enc:' + enc + markers + '&center=' + destination,
  //       };
  //       sendToStation('directions', directions);
  //       call.directionsData = directions;
  //       return call;
  //     }
  //   })
  //   .catch((err) => {
  //     logger.error(err);
  //     if (rollbar) {
  //       rollbar.log(err);
  //     }
  //   });
// }

  /**
   * generate the map
   * @param {element} el the element to place the map
   * @param {call} call data
   */
  function initMap(el, call) {
    // geocode the destination
    let gr = null;
    if (call.data.location.match(/[A-Z]/) == null) {
      gr = {location: call.data.location.split(',').map((s) => Number(s))};
    } else {
      gr = {address: call.data.location + ADDRESS_SUFFIX};
    }

    let g = new google.maps.Geocoder();
    g.geocode(gr, function(results, status) {
      if (status == 'OK') {
        if (results.length > 0) {
          let destination = results[0].geometry.location;
          call.args = {destination};

          let origin = STATIONS.find((e) => e.area == call.data.area);
          if (!origin) {
            // cannot determine origin (location of station) for mapping
            console.log('directions came in for ', call.data.area, ' but we cannot find our local station');
            return;
          }
      
          let map = new google.maps.Map(el, {
            center: destination,
            zoom: 14,
          });
      
          call.map = map;
      
          let marker = new google.maps.Marker({
            position: destination,
            map: map,
            label: call.data.dispatchCode,
          });
      
          let directionsDisplay = new google.maps.DirectionsRenderer({
            map,
            // preserveViewport: true,  // prevents reZooming
            markerOptions: {
              label: call.data.dispatchCode,
            },
            suppressMarkers: true,
          });
      
          // Set destination, origin and travel mode.
          let request = {
            destination: destination,
            origin: {lat: origin.lat, lng: origin.lng},
            travelMode: 'DRIVING',
          };
      
          // Pass the directions request to the directions service.
          let directionsService = new google.maps.DirectionsService();
          directionsService.route(request, function(response, status) {
            if (status == 'OK') {
              // Display the route on the map.
              call.directions = response;
              directionsDisplay.setDirections(response);
      
              // find the dom element for the call we are on
              let callEl = document.querySelector("[data-call-number='" + call.data.callNumber + "']"); /* eslint quotes:off */
              if (callEl == null) {
                // directions are for a different call that we no longer or never have shown
                console.log('directions came in for ', call.data.callNumber, ' but that call is not active');
                return;
              }
      
              // display estimated travel time
              let route = (response.routes.length > 0 ? response.routes[0] : null);
              if (route && route.legs.length > 0 && route.legs[0].steps.length > 0) {
                $(callEl).find('.travel-time').text('estimated travel time is ' + route.legs[0].duration.text);
              }
      
              // display route travel directions
              if ($(callEl).find('.route ol').length != 0) {
                // clear them if they already have something
                $(callEl).find('.route').empty();
                $(callEl).find('.route').append($('<ol>'));
              }
              // if there are more than six steps, only show the last half
              let steps = route.legs[0].steps.slice(-LAST_X_TEXT_DIRECTIONS);
              for (let i = 0; i < steps.length; i++) {
                $(callEl).find('.route ol').append($('<li>')
                  .html(steps[i].instructions +
                    ' (' + steps[i].distance.text + ')'));
              }
            } else {
              console.log('directionsService.route status is ' + status);
            }
          });
        }
      }
    });
  }


/**
 * display the map
 *
 * @param {object} call call to display map for
 */
  function displayMap(call) {
    let callEl = document.querySelector("[data-call-number='" + call.data.callNumber + "']"); /* eslint quotes:off */
    const m = $(callEl).find('.map');
    m.empty();
    initMap(m[0], call);
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

    if (data.callInfo) {
      $(callEl).find('.call-info').text(data.callInfo);
    }
    if (data.ccText) {
      $(callEl).find('.call-cctext').text(data.ccText);
    }

    if (data.location) {
      $(callEl).find('.location').text(data.location);
    }
    if (data.commonName) {
      $(callEl).find('.common-name').text(data.commonName);
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
  socket.on('callslog', function(data, ackHandler) {
    // acknowledge that we received the data
    if (ackHandler) ackHandler(true);

    let html = '<div id="time"></div>';
    if (data.calls.length > 0) {
      const rows = data.calls.map((entry) => `<tr><td>${entry.callData.callDateTime}</td><td>${entry.callData.callType}</td><td>${entry.callData.dispatchCode}</td><td>${entry.callData.location}</td></tr>`)
        .join('');
      html = '<table>' + rows + '</table>';
      $('.messages').empty();
      $('.messages').addClass('hidden');
    }
    $('.callslog').html(html);
  });

  /**
   * change the page header to show the station id
   */
  socket.on('config', function(data, ackHandler) {
    // acknowledge that we received the data
    if (ackHandler) ackHandler(true);

    let stationIds = data.stations.map((e) => e.id).join(', ');
    console.log(stationIds);
    document.title = stationIds + ' Dispatch Display';

    CALL_ACTIVE_SECS = data.call_active_secs;
    ADDRESS_SUFFIX = data.address_suffix;
    STATIONS = data.stations;

    // if we have not already loaded the map api with the key we just received then we should do so now
    if (!isMapApiLoaded) {
      let js = document.createElement('script');
      js.type = 'application/javascript';
      js.src = 'https://maps.googleapis.com/maps/api/js?key=' + data.mapKey;
      document.body.appendChild(js);
      isMapApiLoaded = true;
    }

    // if we have not already set up rollbar with the key we just received then we should do so now
    if (!isRollbarConfigured) {
      let _rollbarConfig = {
        accessToken: data.rollbarToken,
        captureUncaught: true,
        captureUnhandledRejections: true,
        payload: {
            environment: data.environment
        }
      };
      // Rollbar Snippet
      !function(r){function o(n){if(e[n])return e[n].exports;var t=e[n]={exports:{},id:n,loaded:!1};return r[n].call(t.exports,t,t.exports,o),t.loaded=!0,t.exports}var e={};return o.m=r,o.c=e,o.p="",o(0)}([function(r,o,e){"use strict";var n=e(1),t=e(4);_rollbarConfig=_rollbarConfig||{},_rollbarConfig.rollbarJsUrl=_rollbarConfig.rollbarJsUrl||"https://cdnjs.cloudflare.com/ajax/libs/rollbar.js/2.2.7/rollbar.min.js",_rollbarConfig.async=void 0===_rollbarConfig.async||_rollbarConfig.async;var a=n.setupShim(window,_rollbarConfig),l=t(_rollbarConfig);window.rollbar=n.Rollbar,a.loadFull(window,document,!_rollbarConfig.async,_rollbarConfig,l)},function(r,o,e){"use strict";function n(r){return function(){try{return r.apply(this,arguments)}catch(r){try{console.error("[Rollbar]: Internal error",r)}catch(r){}}}}function t(r,o){this.options=r,this._rollbarOldOnError=null;var e=s++;this.shimId=function(){return e},window&&window._rollbarShims&&(window._rollbarShims[e]={handler:o,messages:[]})}function a(r,o){var e=o.globalAlias||"Rollbar";if("object"==typeof r[e])return r[e];r._rollbarShims={},r._rollbarWrappedError=null;var t=new p(o);return n(function(){o.captureUncaught&&(t._rollbarOldOnError=r.onerror,i.captureUncaughtExceptions(r,t,!0),i.wrapGlobals(r,t,!0)),o.captureUnhandledRejections&&i.captureUnhandledRejections(r,t,!0);var n=o.autoInstrument;return(void 0===n||n===!0||"object"==typeof n&&n.network)&&r.addEventListener&&(r.addEventListener("load",t.captureLoad.bind(t)),r.addEventListener("DOMContentLoaded",t.captureDomContentLoaded.bind(t))),r[e]=t,t})()}function l(r){return n(function(){var o=this,e=Array.prototype.slice.call(arguments,0),n={shim:o,method:r,args:e,ts:new Date};window._rollbarShims[this.shimId()].messages.push(n)})}var i=e(2),s=0,d=e(3),c=function(r,o){return new t(r,o)},p=d.bind(null,c);t.prototype.loadFull=function(r,o,e,t,a){var l=function(){var o;if(void 0===r._rollbarDidLoad){o=new Error("rollbar.js did not load");for(var e,n,t,l,i=0;e=r._rollbarShims[i++];)for(e=e.messages||[];n=e.shift();)for(t=n.args||[],i=0;i<t.length;++i)if(l=t[i],"function"==typeof l){l(o);break}}"function"==typeof a&&a(o)},i=!1,s=o.createElement("script"),d=o.getElementsByTagName("script")[0],c=d.parentNode;s.crossOrigin="",s.src=t.rollbarJsUrl,e||(s.async=!0),s.onload=s.onreadystatechange=n(function(){if(!(i||this.readyState&&"loaded"!==this.readyState&&"complete"!==this.readyState)){s.onload=s.onreadystatechange=null;try{c.removeChild(s)}catch(r){}i=!0,l()}}),c.insertBefore(s,d)},t.prototype.wrap=function(r,o,e){try{var n;if(n="function"==typeof o?o:function(){return o||{}},"function"!=typeof r)return r;if(r._isWrap)return r;if(!r._rollbar_wrapped&&(r._rollbar_wrapped=function(){e&&"function"==typeof e&&e.apply(this,arguments);try{return r.apply(this,arguments)}catch(e){var o=e;throw"string"==typeof o&&(o=new String(o)),o._rollbarContext=n()||{},o._rollbarContext._wrappedSource=r.toString(),window._rollbarWrappedError=o,o}},r._rollbar_wrapped._isWrap=!0,r.hasOwnProperty))for(var t in r)r.hasOwnProperty(t)&&(r._rollbar_wrapped[t]=r[t]);return r._rollbar_wrapped}catch(o){return r}};for(var u="log,debug,info,warn,warning,error,critical,global,configure,handleUncaughtException,handleUnhandledRejection,captureDomContentLoaded,captureLoad".split(","),f=0;f<u.length;++f)t.prototype[u[f]]=l(u[f]);r.exports={setupShim:a,Rollbar:p}},function(r,o){"use strict";function e(r,o,e){if(r){var t;"function"==typeof o._rollbarOldOnError?t=o._rollbarOldOnError:r.onerror&&!r.onerror.belongsToShim&&(t=r.onerror,o._rollbarOldOnError=t);var a=function(){var e=Array.prototype.slice.call(arguments,0);n(r,o,t,e)};a.belongsToShim=e,r.onerror=a}}function n(r,o,e,n){r._rollbarWrappedError&&(n[4]||(n[4]=r._rollbarWrappedError),n[5]||(n[5]=r._rollbarWrappedError._rollbarContext),r._rollbarWrappedError=null),o.handleUncaughtException.apply(o,n),e&&e.apply(r,n)}function t(r,o,e){if(r){"function"==typeof r._rollbarURH&&r._rollbarURH.belongsToShim&&r.removeEventListener("unhandledrejection",r._rollbarURH);var n=function(r){var e=r.reason,n=r.promise,t=r.detail;!e&&t&&(e=t.reason,n=t.promise),o&&o.handleUnhandledRejection&&o.handleUnhandledRejection(e,n)};n.belongsToShim=e,r._rollbarURH=n,r.addEventListener("unhandledrejection",n)}}function a(r,o,e){if(r){var n,t,a="EventTarget,Window,Node,ApplicationCache,AudioTrackList,ChannelMergerNode,CryptoOperation,EventSource,FileReader,HTMLUnknownElement,IDBDatabase,IDBRequest,IDBTransaction,KeyOperation,MediaController,MessagePort,ModalWindow,Notification,SVGElementInstance,Screen,TextTrack,TextTrackCue,TextTrackList,WebSocket,WebSocketWorker,Worker,XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload".split(",");for(n=0;n<a.length;++n)t=a[n],r[t]&&r[t].prototype&&l(o,r[t].prototype,e)}}function l(r,o,e){if(o.hasOwnProperty&&o.hasOwnProperty("addEventListener")){for(var n=o.addEventListener;n._rollbarOldAdd&&n.belongsToShim;)n=n._rollbarOldAdd;var t=function(o,e,t){n.call(this,o,r.wrap(e),t)};t._rollbarOldAdd=n,t.belongsToShim=e,o.addEventListener=t;for(var a=o.removeEventListener;a._rollbarOldRemove&&a.belongsToShim;)a=a._rollbarOldRemove;var l=function(r,o,e){a.call(this,r,o&&o._rollbar_wrapped||o,e)};l._rollbarOldRemove=a,l.belongsToShim=e,o.removeEventListener=l}}r.exports={captureUncaughtExceptions:e,captureUnhandledRejections:t,wrapGlobals:a}},function(r,o){"use strict";function e(r,o){this.impl=r(o,this),this.options=o,n(e.prototype)}function n(r){for(var o=function(r){return function(){var o=Array.prototype.slice.call(arguments,0);if(this.impl[r])return this.impl[r].apply(this.impl,o)}},e="log,debug,info,warn,warning,error,critical,global,configure,handleUncaughtException,handleUnhandledRejection,_createItem,wrap,loadFull,shimId,captureDomContentLoaded,captureLoad".split(","),n=0;n<e.length;n++)r[e[n]]=o(e[n])}e.prototype._swapAndProcessMessages=function(r,o){this.impl=r(this.options);for(var e,n,t;e=o.shift();)n=e.method,t=e.args,this[n]&&"function"==typeof this[n]&&("captureDomContentLoaded"===n||"captureLoad"===n?this[n].apply(this,[t[0],e.ts]):this[n].apply(this,t));return this},r.exports=e},function(r,o){"use strict";r.exports=function(r){return function(o){if(!o&&!window._rollbarInitialized){r=r||{};for(var e,n,t=r.globalAlias||"Rollbar",a=window.rollbar,l=function(r){return new a(r)},i=0;e=window._rollbarShims[i++];)n||(n=e.handler),e.handler._swapAndProcessMessages(l,e.messages);window[t]=n,window._rollbarInitialized=!0}}}}]);
      // End Rollbar Snippet            
      isRollbarConfigured = true;
    }

    // clear the message log since we've connected ok
    $('.messages').addClass('hidden');
    $('.messages').empty();
  });

  /**
   * display message from the socket, such as 'remote address unmatched'
   */
  socket.on('message', function(data, ackHandler) {
    // acknowledge that we received the data
    if (ackHandler) ackHandler(true);

    console.log(data);
    if (data.match(/Welcome/)) {
      $('.messages').addClass('hidden');
      $('.messages').empty();
    } else {
      const html = '<li>' + data + '</li>';
      $('.messages').append(html);
      $('.messages').removeClass('hidden');
    }
  });
})();
