/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Environment variable loading configuration
 */

const path = require('path');
const fs = require('fs');

/**
 * Load environment variables from envs/ directory
 * Developers and CI maintain their own process.env file (gitignored)
 * Copy from process.env.sample to get started
 */
function loadEnvironmentVariables() {
  const envPath = path.join(__dirname, '..', 'envs', 'process.env');

  // Load environment variables from process.env (gitignored)
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}

module.exports = {
  loadEnvironmentVariables,
};
