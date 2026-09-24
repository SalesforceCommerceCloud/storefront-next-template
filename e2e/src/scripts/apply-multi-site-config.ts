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
 * Patches config.server.ts with a multi-site URL preset before building.
 *
 * Used by the nightly multi-site E2E workflow to test different URL strategies.
 * Each preset defines a different `url` block and optional detection config
 * overrides that are written into config.server.ts before `pnpm build`.
 *
 * Usage: tsx apply-multi-site-config.ts <preset-name>
 *
 * @example
 *   tsx apply-multi-site-config.ts prefix-locale-only
 *   tsx apply-multi-site-config.ts search-all
 *   tsx apply-multi-site-config.ts no-site-locale
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const TEMPLATE_APP_PATH = resolve(__dirname, '../../../');
const BASE_CONFIG_PATH = resolve(TEMPLATE_APP_PATH, 'config.server.base.ts');
const CONFIG_PATH = existsSync(BASE_CONFIG_PATH) ? BASE_CONFIG_PATH : resolve(TEMPLATE_APP_PATH, 'config.server.ts');
const CONFIG_FILE_NAME = basename(CONFIG_PATH);

// ─── Types ──────────────────────────────────────────────────────────────────

interface UrlConfig {
    prefix?: string;
    search?: string;
    excludeRoutes: string[];
}

interface DetectionConfig {
    order: string[];
    lookupFromPathIndex?: number;
}

interface Preset {
    url: UrlConfig;
    siteDetectionConfig?: DetectionConfig;
    localeDetectionConfig?: DetectionConfig;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS: Record<string, Preset> = {
    // Case 1: /:siteId/:localeId/...  →  /global/en-GB/product/123
    'prefix-site-locale': {
        url: { prefix: '/:siteId/:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
    },

    // Case 2: /:localeId/...  →  /en-GB/product/123
    'prefix-locale-only': {
        url: { prefix: '/:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
        siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
        localeDetectionConfig: { order: ['path', 'querystring', 'cookie', 'header'], lookupFromPathIndex: 0 },
    },

    // Case 3: /:siteId/...?lng=:localeId  →  /global/product/123?lng=en-GB
    'prefix-site-search-locale': {
        url: { prefix: '/:siteId', search: '?lng=:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
        localeDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    },

    // Case 4: /...?site=:siteId&lng=:localeId  →  /product/123?site=global&lng=en-GB
    'search-all': {
        url: { search: '?site=:siteId&lng=:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
        siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
        localeDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    },

    // Case 5: /...?lng=:localeId  →  /product/123?lng=en-GB
    'search-locale-only': {
        url: { search: '?lng=:localeId', excludeRoutes: ['/resource/**', '/action/**'] },
        siteDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
        localeDetectionConfig: { order: ['querystring', 'cookie', 'header'] },
    },

    // Case 6: /...  →  /product/123
    'no-site-locale': {
        url: { excludeRoutes: ['/resource/**', '/action/**'] },
        siteDetectionConfig: { order: ['cookie', 'header'] },
        localeDetectionConfig: { order: ['cookie', 'header'] },
    },
};

// ─── Serializers ─────────────────────────────────────────────────────────────

/**
 * Serializes a {@link UrlConfig} into a TypeScript object literal string that can be
 * spliced into config.server.ts, matching the indentation of the existing `url:` block.
 */
function serializeUrlBlock(url: UrlConfig): string {
    const indent = '            '; // 12 spaces
    const inner = '                '; // 16 spaces
    const lines = [`${indent}url: {`];
    if (url.prefix) lines.push(`${inner}prefix: '${url.prefix}',`);
    if (url.search) lines.push(`${inner}search: '${url.search}',`);
    lines.push(`${inner}excludeRoutes: ['${url.excludeRoutes.join("', '")}'],`);
    lines.push(`${indent}},`);
    return lines.join('\n');
}

/**
 * Serializes a {@link DetectionConfig} into a TypeScript object literal string
 * (e.g. `siteDetectionConfig: { order: [...] }`) for insertion into config.server.ts.
 */
function serializeDetectionConfig(name: string, config: DetectionConfig): string {
    const indent = '            ';
    const inner = '                ';
    const lines = [`${indent}${name}: {`];
    if (config.order) {
        lines.push(`${inner}order: [${config.order.map((o) => `'${o}'`).join(', ')}],`);
    }
    if (config.lookupFromPathIndex !== undefined) {
        lines.push(`${inner}lookupFromPathIndex: ${config.lookupFromPathIndex},`);
    }
    lines.push(`${indent}},`);
    return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

const presetName = process.argv[2];
const validNames = Object.keys(PRESETS);

if (!presetName || !PRESETS[presetName]) {
    console.error(`Usage: tsx apply-multi-site-config.ts <preset-name>`);
    console.error(`Available: ${validNames.join(', ')}`);
    process.exit(1);
}

const preset = PRESETS[presetName];

console.log(`\n🔧 Multi-site config patch: ${presetName}`);
console.log(`   URL prefix: ${preset.url.prefix || '(none)'}`);
console.log(`   URL search: ${preset.url.search || '(none)'}`);
console.log(`   Site detection override: ${preset.siteDetectionConfig ? 'yes' : 'no'}`);
console.log(`   Locale detection override: ${preset.localeDetectionConfig ? 'yes' : 'no'}`);

let config = readFileSync(CONFIG_PATH, 'utf-8');
const originalConfig = config;

// 1. Replace the url block
const urlBlockRegex = /( {12})url:\s*\{[^}]+\},/s;
if (!urlBlockRegex.test(config)) {
    console.error(`❌ Could not find the url: { ... } block in ${CONFIG_FILE_NAME}`);
    process.exit(1);
}
config = config.replace(urlBlockRegex, serializeUrlBlock(preset.url));
console.log(`   ✅ Replaced url block`);

// 2. Strip any existing detection config overrides (idempotency)
const detectionKeyRegex = /\n? {12}(siteDetectionConfig|localeDetectionConfig):\s*\{[^}]+\},/g;
config = config.replace(detectionKeyRegex, '');
console.log(`   ✅ Stripped existing detection config overrides (if any)`);

// 3. Insert detection config overrides after siteAliasMap (if needed)
const detectionBlocks: string[] = [];
if (preset.siteDetectionConfig) {
    detectionBlocks.push(serializeDetectionConfig('siteDetectionConfig', preset.siteDetectionConfig));
}
if (preset.localeDetectionConfig) {
    detectionBlocks.push(serializeDetectionConfig('localeDetectionConfig', preset.localeDetectionConfig));
}

if (detectionBlocks.length > 0) {
    const siteAliasMapRegex = /(siteAliasMap:\s*\{[^}]+\},)/s;
    const match = config.match(siteAliasMapRegex);
    if (!match) {
        console.error(`❌ Could not find siteAliasMap block in ${CONFIG_FILE_NAME}`);
        writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        process.exit(1);
    }
    config = config.replace(match[0], `${match[0]}\n${detectionBlocks.join('\n')}`);
    console.log(`   ✅ Inserted detection config overrides`);
}

// 4. Write patched config
writeFileSync(CONFIG_PATH, config, 'utf-8');
console.log(`   ✅ Patched ${CONFIG_FILE_NAME}\n`);

// 5. Sanity check
if (!config.includes('url:') || !config.includes('excludeRoutes') || !config.includes('defineConfig')) {
    console.error('❌ Validation failed — restoring original');
    writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
    process.exit(1);
}

console.log('✅ Validation passed\n');
