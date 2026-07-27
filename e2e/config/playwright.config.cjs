/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Playwright helper configuration for CodeceptJS
 */

/** Pixel 7 emulation settings — shared between getPlaywrightConfig() and codecept.conf.cjs. */
const MOBILE_EMULATION = {
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2.625
};

/**
 * Get Playwright helper configuration
 */
function getPlaywrightConfig() {
  const isMobile = process.env.PLAYWRIGHT_MOBILE === 'true';

  const config = {
    url: (process.env.BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
    show: process.env.HEADLESS !== 'true',
    browser: 'chromium',
    waitForTimeout: parseInt(process.env.WAIT_FOR_TIMEOUT || '30000'),
    waitForAction: parseInt(process.env.WAIT_FOR_ACTION || '1000'),
    chromium: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    }
  };

  if (process.env.RECORD_VIDEO === 'true') {
    config.recordVideo = {
      dir: './output/videos/',
      size: { width: 1280, height: 720 }
    };
  }

  // windowSize and emulate are mutually exclusive: windowSize calls page.setViewportSize()
  // after context creation and overrides the context-level emulate.viewport, breaking
  // isMobile layout behavior. Only one should be set at a time.
  if (isMobile) {
    config.emulate = MOBILE_EMULATION;
  } else {
    config.windowSize = process.env.WINDOW_SIZE || '1200x900';
  }

  // Add webServer configuration for local development
  if (process.env.START_DEV_SERVER === 'true') {
    config.webServer = {
      command: 'pnpm dev',
      port: parseInt(process.env.STOREFRONT_DEV_PORT || '5173'),
      timeout: 60000,
      reuseExistingServer: true
    };
  }

  return config;
}

module.exports = {
  getPlaywrightConfig,
  MOBILE_EMULATION,
};
