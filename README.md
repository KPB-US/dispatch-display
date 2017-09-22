# dispatch-display
display 911 dispatch details, timer, and map in station

![selection_214](https://user-images.githubusercontent.com/473165/30765332-a2a3af5e-9f9b-11e7-978e-a816690ce51d.png)

Uses the following environment variables:
- GOOGLE_DIRECTIONS_API_KEY
- GOOGLE_STATIC_MAPS_API_KEY

## development

1. Git clone the repo
1. run `npm install`
1. run `node index.js`
1. Point your display's browser to http://localhost:3000
1. Use postman to post to http://localhost:3000/incoming
