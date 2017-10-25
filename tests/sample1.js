module.exports = {
  'Demo Test': function(browser) {
    browser
      .url('http://localhost:3000')
      .waitForElementVisible('body', 1000)
      .pause(2000)
      .assert.containsText('#time', ':')
      .end();
  },
};
