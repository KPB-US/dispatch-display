/* eslint-env browser, jquery */
/* globals Vue */

const v = new Vue({
  el: '#status',
  data: {
    results: {
      directory: [],
      callHistory: [],
    },
  },
  methods: {
    directionsStatus(call) {
      let status = '';
      if (call && call.directionsData && call.directionsData.response && call.directionsData.response.json) {
        status = call.directionsData.response.json.status;
      }
      return status;
    },
    updateStatus: function() {
      fetch('/status')
      .then((results) => results.json())
      .then((results) => {
        this.results = results;
      });
    },
  },
});

// refresh the data
v.updateStatus();
setInterval(v.updateStatus, 60000);
