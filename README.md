[![Build Status](https://travis-ci.org/KPB-US/dispatch-display.svg?branch=master)](https://travis-ci.org/KPB-US/dispatch-display.svg?branch=master)
[![Coverage Status](https://coveralls.io/repos/KPB-US/dispatch-display/badge.svg?branch=master)](https://coveralls.io/r/KPB-US/dispatch-display?branch=master)

# dispatch-display
Displays 911 dispatch details, timer, and map in the station. Cycles through multiple active calls.  Displays a call log when no calls are active.

![image](https://user-images.githubusercontent.com/473165/31039706-621baff4-a52c-11e7-8593-2bd326b41b45.png)

## configuration

1. Set the following environment variables.
- GAPI_KEY (GOOGLE MAPS JAVASCRIPT and MAPS DIRECTIONS APIS)
- ROLLBAR_TOKEN
- CALL_ACTIVE_SECS
- CALL_HISTORY_LIMIT
- ADDRESS_SUFFIX (for helping GoogleMaps find the location in your area)
- LOG_LEVEL
2. Update the list of `STATIONS` in server.js.
3. Update the `parse` function in lib/parser.js to parse your JSON data into the object used by dispatch-display:
```
{
  callNumber: null,
  callDateTime: null,
  callType: 'Unknown',
  callInfo: '',
  ccText: '',

  station: null,
  units: null,
  dispatchDateTime: null,
  dispatchCode: '', // severity level

  location: null,
  commonName: null,
  crossStreets: null,
  venue: null,
}
```
4. Update the DISPATCH_DISPLAY_SERVER at the top of the pi/online_check.html so it can redirect to the server when a connection is detected.
5. Update the ONLINE_CHECK_URL at the top of the index.js file to point to the localhost server port that will serve the online_check.html file.
6. Update the rollbar token at the top of the index.html file.

## production

1. Set up your nodejs server to run server.js
2. Set up your RasperryPi's with debian jessie to point chromium at the file location of the online_check.html file.  This file is served by `python -m SimpleHTTPServer -p 8000` from the /home/signage/pi folder.  If the network is not connected then a message will be displayed stating such.  If the network is connected then it will redirect to the dispatch server url.  When the dispatch server display page is idle (not actively showing a call) and the network does down, the browser will be redirected to the locally served online-check.html page also.  Your signage user on the pi could also be set to autostart the pi/signage.sh which starts the local server and launches chromium in kiosk mode.
3. Get your 911 system (or an intermediary) to post calls to your server at http://server/incoming.

## docker
This is still a work in progress-- getting the containers and compositions all set up...

## mapping

The origin is the lat/lng of the station.  The destination is the location in the call.  It can be a lat/lng or a text address.  If it is a text address, then the ADDRESS_SUFFIX is appeneded to it.  The origin and destination are used in determining the the directions via the Google Maps Directions API.  If the first leg's distance exceeds 100 miles, then the directions/map are ignored because we assume that google matched a location outside of our service area.

On the client browser, the map is generated dynamically and renders the directions.  If the zoom level at this point is greater than 15, then the zoom level never changes because it displayed a route at a very close level of detail.  If the zoom level is 15 or less, then as the call slide cycles, the first half of the cycle is shown at zoom level 14, and the second half of the cycle is shown at zoom level 15.  Regardless of the zoom levels, the destination is centered in the map.

If the text directions exceed LAST_X_TEXT_DIRECTIONS, then only the LAST_X_TEXT_DIRECTIONS are displayed in the text directions area on the map.

## development

1. Git clone the repo
1. Copy .env_sample to .env and update it with your keys and tokens and prefs
1. run `npm install`
1. run `node server.js`
1. Point your display's browser to http://localhost:3000
1. Use [postman](https://www.getpostman.com/apps) to post the following to http://localhost:3000/incoming

```
{
  "location": "144 N BINKLEY ST",
  "venue": "SOLDOTNA",
  "crossStreets": "N BINKLY ST / PARK ST",
  "station": "CES",
  "callNumber": "4448",
  "callType": "43-Caffeine Withdrawal",
  "callDateTime": "09/25/2017 08:44:34",
  "dispatchDateTime": "09/25/2017 08:47:47",
  "dispatchCode": "25C01",
  "callInfo": "93 year old, female, breathing, conscious.",
  "ccText": "shakes and convulsions",
}
```
