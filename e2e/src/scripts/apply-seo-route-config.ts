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
 * Replaces the shared product and category SEO route defaults before a test build.
 *
 * Usage: tsx apply-seo-route-config.ts <product-prefix> <category-prefix> <category-mode>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const TEMPLATE_APP_PATH = resolve(__dirname, '../../../');
const BASE_CONFIG_PATH = resolve(TEMPLATE_APP_PATH, 'config.server.base.ts');
const CONFIG_PATH = existsSync(BASE_CONFIG_PATH) ? BASE_CONFIG_PATH : resolve(TEMPLATE_APP_PATH, 'config.server.ts');
const CONFIG_FILE_NAME = basename(CONFIG_PATH);
const SAFE_PREFIX = /^[A-Za-z0-9_-]+$/;

const [productPrefix, categoryPrefix, categoryMode] = process.argv.slice(2);

if (
    !productPrefix ||
    !categoryPrefix ||
    !SAFE_PREFIX.test(productPrefix) ||
    !SAFE_PREFIX.test(categoryPrefix) ||
    !['id-suffix', 'slug-path'].includes(categoryMode)
) {
    console.error('Usage: tsx apply-seo-route-config.ts <product-prefix> <category-prefix> <id-suffix|slug-path>');
    process.exit(1);
}

const originalConfig = readFileSync(CONFIG_PATH, 'utf8');
const productPattern = /product:\s*\{\s*prefix:\s*['"][^'"]+['"]\s*\}/;
const categoryPattern = /category:\s*\{\s*prefix:\s*['"][^'"]+['"],\s*mode:\s*['"](?:id-suffix|slug-path)['"]\s*\}/;

if (!productPattern.test(originalConfig) || !categoryPattern.test(originalConfig)) {
    console.error(`Could not find the shared SEO route defaults in ${CONFIG_FILE_NAME}`);
    process.exit(1);
}

const config = originalConfig
    .replace(productPattern, `product: { prefix: '${productPrefix}' }`)
    .replace(categoryPattern, `category: { prefix: '${categoryPrefix}', mode: '${categoryMode}' }`);

writeFileSync(CONFIG_PATH, config, 'utf8');
console.log(`Updated ${CONFIG_FILE_NAME}: product=${productPrefix}, category=${categoryPrefix}, mode=${categoryMode}`);
