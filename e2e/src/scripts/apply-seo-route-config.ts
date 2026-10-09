/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Adds an explicit site SEO route configuration before a test build.
 *
 * Usage: tsx apply-seo-route-config.ts <site-id> <product-prefix> <category-prefix> <category-mode>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const TEMPLATE_APP_PATH = resolve(__dirname, '../../../');
const BASE_CONFIG_PATH = resolve(TEMPLATE_APP_PATH, 'config.server.base.ts');
const CONFIG_PATH = existsSync(BASE_CONFIG_PATH) ? BASE_CONFIG_PATH : resolve(TEMPLATE_APP_PATH, 'config.server.ts');
const CONFIG_FILE_NAME = basename(CONFIG_PATH);
const SAFE_CONFIG_VALUE = /^[A-Za-z0-9_-]+$/;

const [siteId, productPrefix, categoryPrefix, categoryMode] = process.argv.slice(2);

if (
    !siteId ||
    !productPrefix ||
    !categoryPrefix ||
    !SAFE_CONFIG_VALUE.test(siteId) ||
    !SAFE_CONFIG_VALUE.test(productPrefix) ||
    !SAFE_CONFIG_VALUE.test(categoryPrefix) ||
    !['id-suffix', 'slug-path'].includes(categoryMode)
) {
    console.error(
        'Usage: tsx apply-seo-route-config.ts <site-id> <product-prefix> <category-prefix> <id-suffix|slug-path>'
    );
    process.exit(1);
}

const originalConfig = readFileSync(CONFIG_PATH, 'utf8');
const excludeRoutesPattern = /^(\s*)excludeRoutes:\s*\[[^\n]*\],$/m;
const excludeRoutesMatch = originalConfig.match(excludeRoutesPattern);

if (!excludeRoutesMatch || /^\s*seoRoutes:/m.test(originalConfig)) {
    console.error(`Could not add app.url.seoRoutes to ${CONFIG_FILE_NAME}`);
    process.exit(1);
}

const indentation = excludeRoutesMatch[1];
const routeIndentation = `${indentation}    `;
const fieldIndentation = `${routeIndentation}    `;
const seoRoutes = [
    `${indentation}seoRoutes: {`,
    `${routeIndentation}${JSON.stringify(siteId)}: {`,
    `${fieldIndentation}product: { prefix: '${productPrefix}' },`,
    `${fieldIndentation}category: { prefix: '${categoryPrefix}', mode: '${categoryMode}' },`,
    `${routeIndentation}},`,
    `${indentation}},`,
].join('\n');
const config = originalConfig.replace(excludeRoutesPattern, (excludeRoutes) => `${excludeRoutes}\n${seoRoutes}`);

writeFileSync(CONFIG_PATH, config, 'utf8');
console.log(
    `Updated ${CONFIG_FILE_NAME}: site=${siteId}, product=${productPrefix}, category=${categoryPrefix}, mode=${categoryMode}`
);
