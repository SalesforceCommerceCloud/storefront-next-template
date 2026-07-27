/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Custom Allure Helper for E2E tests
 * Provides environment reporting and test failure tracking for Allure dashboard
 */

const { appendFileSync, mkdirSync, existsSync, readFileSync } = require('fs');
const { join, dirname } = require('path');
const { env } = require('process');

// Import Helper base class
const Helper = require('@codeceptjs/helper');

const NAME = 'environment.properties';

class AllureHelper extends Helper {
    constructor(config) {
        super(config);
        this.output = config.output || './output/allure-results/';
        this.failedTags = [];
        this.uniqueFailedTags = [];
    }

    buildPath(name) {
        const path = join(this.output, name);
        return path;
    }

    printEnvOnAllureReport = (key, value) => {
        if (!key || value === 'undefined' || value === undefined) return;
        if (value !== undefined && typeof value === 'string' && value.trim().length === 0) return;

        key = key ? key.replace(/ /g, '_').toUpperCase() : '';

        if (value && typeof value === 'object') {
            value = JSON.stringify(value);
        }
        const text = `${key}=${value}\n`;
        const path = this.buildPath(NAME);
        
        // Ensure directory exists before writing
        const dir = dirname(path);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        
        appendFileSync(path, text);
    };

    _before() {
        this._isFailedTest = false;
        // Store page reference now so we can access video path in _after,
        // after Playwright has already closed the context and saved the video.
        const playwright = this.helpers.Playwright;
        this._currentPage = playwright ? playwright.page : null;
    }

    _passed(test) {
        if (test.title && env.SUITE === 'setup') {
            const setupTag = test.title.substring(1, test.title.indexOf('-'));
            if (this.failedTags.indexOf(setupTag) >= 0) {
                this.failedTags.splice(this.failedTags.indexOf(setupTag), 1);
                this.printEnvOnAllureReport('FAILED_TESTS_TO_RETRY', this.failedTags.join(','));
            }
        }
    }

    _failed(test) {
        this._isFailedTest = true;
        if (test.title && env.SUITE === 'setup') {
            const setupTag = test.title.substring(1, test.title.indexOf('-'));
            if (this.failedTags.indexOf(setupTag) < 0) {
                this.failedTags.push(setupTag);
                this.printEnvOnAllureReport('FAILED_TESTS_TO_RETRY', this.failedTags.join(','));
            }
        }
    }

    async _after() {
        if (!this._isFailedTest || process.env.RECORD_VIDEO !== 'true') return;
        // Playwright helper's _after runs before ours (helper registration order),
        // so the context is already closed and the video file is saved to disk.
        try {
            const videoPath = await this._currentPage?.video()?.path();
            if (!videoPath || !existsSync(videoPath)) return;

            const allurePlugin = codeceptjs.container.plugins('allure');
            if (!allurePlugin) return;

            allurePlugin.addAttachment('Test Recording', readFileSync(videoPath), 'video/webm');
        } catch (e) {
            console.warn('[AllureHelper] Could not attach video recording:', e.message);
        }
    }

    driver() {
        return this.helpers.WebDriver || this.helpers.Playwright;
    }

    grabSessionId() {
        const browser = this.driver()?.browser;
        return browser?.sessionId || 'unknown';
    }

    _beforeSuite() {
        // Add storefront-specific environment information
        this.printEnvOnAllureReport('BASE_URL', process.env.BASE_URL);
        this.printEnvOnAllureReport('SITE_ID', process.env.SITE_ID);
        this.printEnvOnAllureReport('TEST_MODE', process.env.TEST_MODE);
        this.printEnvOnAllureReport('BROWSER', 'chromium');
        this.printEnvOnAllureReport('HEADLESS', process.env.HEADLESS);
        this.printEnvOnAllureReport('CI', process.env.CI);
        this.printEnvOnAllureReport('NODE_VERSION', process.version);
        this.printEnvOnAllureReport('TIMESTAMP', new Date().toISOString());
        
        // Add AI configuration if enabled
        if (process.env.CODECEPT_AI === 'true') {
            this.printEnvOnAllureReport('AI_ENABLED', 'true');
            this.printEnvOnAllureReport('AI_PROVIDER_LLM_MODEL', process.env.AI_PROVIDER_LLM_MODEL);
        }
    }
}

module.exports = AllureHelper;