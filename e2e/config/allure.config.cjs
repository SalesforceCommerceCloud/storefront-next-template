/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Allure helper configuration for CodeceptJS
 */

/**
 * Get Allure helper configuration
 */
function getAllureConfig() {
  return {
    require: './helpers/allure.helper.cjs',
    output: './output/allure-results/',
  };
}

module.exports = {
  getAllureConfig,
};
