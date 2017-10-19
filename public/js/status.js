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
    updateStatus: function() {
      console.log('fetching status');
      fetch('/status')
      .then(results => results.json())
      .then((results) => {
        console.log('updating status');
        this.results = results;
      });
    },
  },
});

// refresh the data
v.updateStatus();
setInterval(v.updateStatus, 60000);
