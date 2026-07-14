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

// Hang watchdog — diagnostic for the nightly 6h video-teardown hang.
// The `run-workers` coordinator has hung indefinitely after the last scenario:
// a worker thread's event loop stays alive (un-awaited Playwright video
// saveAs/delete promises are the prime suspect), so the coordinator never
// exits and the parent CLI (cli-utils.ts, which waits on the child 'exit')
// runs to the GitHub 6h cap with NO diagnostic in the log. The job-level
// `timeout-minutes: 45` bounds the burn but tells us nothing about *what*
// lingered. This timer dumps the still-open handles/requests so the next hung
// run names the culprit (open socket vs video writer stream vs worker).
//
// .unref() is load-bearing: an unref'd timer cannot itself hold the event loop
// open, so a healthy run (exits ~24min) lets it die unfired. It fires ONLY if
// something else is keeping the loop alive at the deadline — i.e. the hang.
// (An unref'd timer still fires on schedule *while* the loop is alive; unref only
// affects whether the timer alone would keep it alive.)
//
// Armed in BOTH the coordinator (main thread) AND each worker thread — the conf
// re-runs top-level inside every worker (run-workers' getConfig requires it), and
// worker stdout pipes to the coordinator/CI log. The leak lives in a worker, so
// the worker's own dump names the exact lingering resource (socket vs video
// writer stream); the coordinator's dump only shows a generic `Worker` handle.
//
// process.exit() in a worker thread is thread-local (kills only that worker), so
// the KILL-SWITCH is the coordinator's timer — armed first (main thread runs
// before it spawns workers), it elapses first and its exit(1) fails the whole job
// with a non-zero code. The worker timers are the DIAGNOSTIC dump; even if a
// worker's exit only stopped that thread, the coordinator still bounds the run.
if (process.env.CI === 'true') {
    const { isMainThread, threadId } = require('worker_threads');
    const label = isMainThread ? 'coordinator' : `worker-${threadId}`;
    // Guard the override like the sibling E2E_NIGHTLY_RETRY_DELAY_MINUTES var: a
    // malformed or non-positive value (NaN, 0, "garbage") would make setTimeout fire
    // on the next tick and exit(1) every CI run instantly. Fall back to 40.
    const parsed = parseInt(process.env.E2E_HANG_WATCHDOG_MINUTES || '40', 10);
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
    // The watchdog is only useful if it fires BEFORE the job-level timeout-minutes:45
    // (e2e-template-runner.yml) — GitHub kills the job at 45m with no diagnostic, so a
    // watchdog set >= 45 (or a job cap lowered below the watchdog) silently loses the
    // only path to the hung resource. Warn loudly instead of failing on the next hang.
    const JOB_TIMEOUT_MINUTES = 45;
    if (minutes >= JOB_TIMEOUT_MINUTES) {
        console.warn(
            `::warning::E2E_HANG_WATCHDOG_MINUTES=${minutes} is >= the job timeout-minutes:${JOB_TIMEOUT_MINUTES} — the watchdog will never fire before GitHub kills the job, losing the hang diagnostic. Lower it below ${JOB_TIMEOUT_MINUTES}.`
        );
    }
    setTimeout(
        () => {
            console.error(
                `::error::E2E hang watchdog (${label}) fired after ${minutes}m — event loop still alive. Dumping active resources:`
            );
            // getActiveResourcesInfo() (Node 17+, public/stable) returns the resource
            // TYPES keeping the loop alive, e.g. 'TCPSocketWrap' (open socket), a
            // FS/stream handle (video writer), 'Timeout', 'MessagePort' (worker IPC).
            console.error(`[${label}] activeResources:`, process.getActiveResourcesInfo());
            process.exit(1);
        },
        minutes * 60 * 1000
    ).unref();
}

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
        AI: aiConfigInstance,
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
            chunks: parseInt(process.env.WORKERS, 10) || 1,
        },

        // Mobile configuration — Pixel 7 emulation via Playwright device settings
        // Runs all tests except those explicitly tagged @desktop-only.
        // emulate is placed inside the browser object entry (not in a suite-level
        // helpers block) so that run-multiple's replaceValueDeep picks it up.
        mobile: {
            browsers: [{ browser: 'chromium', emulate: MOBILE_EMULATION }],
            grep: '(?!.*@desktop)|(?=.*@mobile)',
            chunks: parseInt(process.env.WORKERS, 10) || 1,
        },
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
                    quiet: false,
                },
            },
        },
    },
};
