# dispatch-display
Displays 911 dispatch details, timer, and map in the station. Cycles through multiple active calls.  Displays a call log when no calls are active.

![image](https://user-images.githubusercontent.com/473165/31039706-621baff4-a52c-11e7-8593-2bd326b41b45.png)

## configuration

1. Set the following environment variables.
- GOOGLE_DIRECTIONS_API_KEY
- GOOGLE_STATIC_MAPS_API_KEY
- ROLLBAR_TOKEN
- DISPLAY_TTL
- CALL_HISTORY_LIMIT
2. Update the list of `STATIONS` in server.js.
3. Update the `parseFrom911` function in server.js to parse your JSON data into the object used by dispatch-display:
```
{
  callNumber: null,
  callDateTime: null,
  callType: 'Unknown',
  breathing: 'Unknown',
  conscious: 'Unknown',

  station: null,
  dispatchDateTime: null,
  dispatchCode: '', // severity level

  location: null,
  crossStreets: null,
  venue: null,
}
```
## production

1. set up your nodejs server to run server.js
2. Set up your RasperryPi 3's with debian jessie to point chromium at your server http://server.
3. Get your 911 system (or an intermediary) to post calls to your server at http://server/incoming.

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
	"district": "CES AMBULANCE",
	"callNumber": "4448",
	"callType": "43-Caffeine Withdrawal",
	"callDateTime": "09/25/2017 08:44:34",
	"dispatchDateTime": "09/25/2017 08:47:47",
	"dispatchCode": "25C01",
	"breathing": "Yes",
	"conscious": "No"
}
```
