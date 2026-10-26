const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    testTimeout: 180000,
    hookTimeout: 180000
  }
});
