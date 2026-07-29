/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Plugins configuration for CodeceptJS
 */

/**
 * Get plugins configuration
 */
function getPluginsConfig() {
  // TODO: try the analyze plugin for AI analysis that perhaps Claude can leverage.
  // https://codecept.io/ai/#analyze-results
  return {
    // Allure reporting plugin
    allure: {
      enabled: true,
      require: '@codeceptjs/allure-legacy',
    },

    // AI-powered self-healing plugin
    heal: {
      enabled: true,
    },

    // Take screenshots on failure
    screenshotOnFail: {
      enabled: true,
      fullPageScreenshots: true
    },

    // Pause on failure for debugging (enabled when DEBUG_E2E=true)
    pauseOnFail: {
      enabled: process.env.DEBUG_E2E === 'true'
    },

    // Suppress retries for confirmed a11y baseline regressions (infrastructure
    // failures still get the normal retry behavior from the Feature's .retry())
    a11yNoRetry: {
      enabled: true,
      require: './plugins/a11y-no-retry.plugin.cjs',
    },

    // Step-by-step mode for debugging
    stepByStepReport: {
      enabled: process.env.VERBOSE === 'true',
      deleteSuccessful: false,
      animateSlides: true,
      ignoreSteps: [
        'grab*',
        'wait*',
        'see*'
      ]
    },
  };
}

module.exports = {
  getPluginsConfig,
};
