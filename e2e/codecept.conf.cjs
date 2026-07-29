/**
 * Copyright 2026 Salesforce, Inc.
 *
 * CodeceptJS Configuration for E2E tests
 * Modern JavaScript with TypeScript support via ts-node
 */

const { setHeadlessWhen, setCommonPlugins } = require('@codeceptjs/configure');
const path = require('path');

// Set ts-node project for CodeceptJS tests
process.env.TS_NODE_PROJECT = path.join(__dirname, 'tsconfig.codecept.json');

// Load environment variables
const { loadEnvironmentVariables } = require('./config/env.config.cjs');
loadEnvironmentVariables();

// Set headless mode based on environment
setHeadlessWhen(process.env.HEADLESS === 'true' || process.env.CI === 'true');

// Common plugins setup
setCommonPlugins();

// Load modular configurations
const { getPlaywrightConfig, MOBILE_EMULATION } = require('./config/playwright.config.cjs');
const { getAllureConfig } = require('./config/allure.config.cjs');
const { getAIConfig } = require('./config/ai.config.cjs');
const { getPluginsConfig } = require('./config/plugins.config.cjs');

// Get AI config - evaluated when config file loads
// Note: This happens after CODECEPT_AI env var is set by ConfigProvider
// and CodeceptJS processes --ai flag, so both should be available
const aiConfigInstance = getAIConfig();

// Import page objects and flows registries
const { pageObjects } = require('./src/pages/index.ts');
const { flows } = require('./src/flows/index.ts');

exports.config = {
  name: 'e2e',

  // CRITICAL: ts-node registration for TypeScript support
  // This enables .ts files for tests, page objects, and helpers
  require: ['ts-node/register'],

  // Test directories
  tests: './src/specs/**/*.spec.ts',
  output: './output/allure-results/',

  // Bootstrap hook for async initialization
  async bootstrap() {
    // Clean up previous test reports
    if (!process.env.AGGREGATE_REPORT) {
      const { rm } = require('fs/promises');
      try {
        await rm('./output/allure-results', { recursive: true, force: true });
      } catch (e) {
        // Ignore if directory doesn't exist
      }
    }
  },

  // Teardown hook for cleanup after all tests
  async teardown() {
    // Cleanup handled by plugins
  },

  // Helpers configuration
  helpers: {
    // Playwright helper for browser automation
    Playwright: getPlaywrightConfig(),

    // Custom Allure helper for enhanced reporting
    AllureHelper: getAllureConfig(),

    /**
     * AI Helper Registration
     *
     * Registers the AI helper with CodeceptJS to enable interactive AI methods:
     * - I.askForPageObject("pageName") - Generate page objects from DOM
     * - I.askFor("action description") - Natural language test commands
     *
     * Pass the AI config directly to ensure the helper has access to the request
     * function. The config will be empty {} if credentials are not present, which
     * disables AI features gracefully.
     *
     * @see ai - Root-level AI config (used by heal plugin and other features)
     */
    AI: aiConfigInstance
  },

  // Include page objects and flows
  // Registries are maintained in src/pages/index.ts and src/flows/index.ts
  // This keeps the config clean as we add more page objects and flows
  include: {
    ...pageObjects,
    ...flows,
  },

  // Plugins configuration
  plugins: getPluginsConfig(),

  /**
   * Root-Level AI Configuration
   *
   * Provides the AI request function and prompts used by:
   * 1. AI Helper (helpers.AI) - Reads from here to enable I.askForPageObject() and I.askFor()
   * 2. Heal Plugin - Uses this for self-healing broken locators during test execution
   * 3. Other AI Features - Any CodeceptJS AI functionality reads from this root-level config
   *
   * The AI helper registered above (helpers.AI: {}) automatically picks up this
   * configuration, so we don't need to pass it explicitly to the helper.
   *
   * @see helpers.AI - Helper registration that uses this config
   * @see plugins.heal - Self-healing plugin that uses this config
   */
  ai: aiConfigInstance,

  // Multiple browser configurations
  multiple: {
    // Desktop Chromium configuration
    // Runs all tests except those explicitly tagged @mobile-only
    desktop: {
      browsers: ['chromium'],
      grep: '(?!.*@mobile)|(?=.*@desktop)',
      chunks: parseInt(process.env.WORKERS, 10) || 1
    },

    // Mobile configuration — Pixel 7 emulation via Playwright device settings
    // Runs all tests except those explicitly tagged @desktop-only.
    // emulate is placed inside the browser object entry (not in a suite-level
    // helpers block) so that run-multiple's replaceValueDeep picks it up.
    mobile: {
      browsers: [{ browser: 'chromium', emulate: MOBILE_EMULATION }],
      grep: '(?!.*@desktop)|(?=.*@mobile)',
      chunks: parseInt(process.env.WORKERS, 10) || 1,
    }
  },

  // Retry failed scenarios up to 2 times before marking them as failed.
  // Using { Scenario: 2 } (not the shorthand number) sets retries at the test
  // level directly, which is more reliable than the suite-level inheritance
  // that the numeric form produces.
  retry: { Scenario: 2 },

  // Mocha configuration
  mocha: {
    reporterOptions: {
      'codeceptjs-cli-reporter': {
        stdout: '-',
        options: {
          verbose: process.env.VERBOSE === 'true',
          steps: process.env.VERBOSE === 'true', // Only show steps in verbose mode
          // Suppress default test result output - our colored plugin handles it
          quiet: false
        }
      }
    }
  }
};