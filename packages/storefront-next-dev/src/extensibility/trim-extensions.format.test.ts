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
 * Real-filesystem coverage for the Biome formatting path in `updateExtensionConfig`.
 *
 * The main suite (`trim-extensions.test.ts`) mocks `fs` with memfs, so the generated
 * config.json never lands on a real disk and the *shape* Biome produces is never
 * asserted there. This file deliberately uses the REAL `fs` against a throwaway temp
 * directory so the SDK-bundled Biome actually runs and we can assert the exact bytes
 * a customer receives — the whole point of W-23074938 (lint-clean out of the box).
 *
 * Two properties matter for lint-cleanliness and are NOT what `JSON.stringify(…, null, 4)`
 * emits, so they're the regression guards:
 *   1. a trailing newline, and
 *   2. short arrays printed on a single line (`["X"]`, not one element per line).
 */
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import trimExtensions from './trim-extensions';

describe('trim-extensions — real Biome formatting (W-23074938)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfnext-trim-fmt-'));
        fs.mkdirSync(path.join(tmpDir, 'src', 'extensions'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes config.json in the shape the project Biome produces (trailing newline + single-line arrays)', async () => {
        const extensionConfig = {
            extensions: {
                SFDC_EXT_STORE_LOCATOR: {
                    name: 'Store Locator',
                    description: 'Store locator feature',
                    dependencies: ['SFDC_EXT_MAPS'],
                },
                SFDC_EXT_MAPS: {
                    name: 'Maps',
                    description: 'Maps feature',
                },
                SFDC_EXT_WISHLIST: {
                    name: 'Wishlist',
                    description: 'Wishlist feature',
                },
            },
            // `ExtensionMeta` requires install/uninstall/folder fields that are irrelevant to
            // the formatting assertion below, and `trimExtensions` only reads `.extensions` as
            // `Record<string, unknown>` internally — so keep the fixture minimal and cast to the
            // parameter type rather than pad every entry.
        } as unknown as Parameters<typeof trimExtensions>[2];
        const configPath = path.join(tmpDir, 'src', 'extensions', 'config.json');
        // Seed with the multilined, newline-less output of raw JSON.stringify — exactly the
        // shape we must NOT ship — so a passing assertion proves Biome rewrote it.
        fs.writeFileSync(configPath, JSON.stringify(extensionConfig, null, 4), 'utf8');

        await trimExtensions(
            tmpDir,
            { SFDC_EXT_STORE_LOCATOR: true, SFDC_EXT_MAPS: true, SFDC_EXT_WISHLIST: false },
            extensionConfig
        );

        const raw = fs.readFileSync(configPath, 'utf8');

        // Disabled extension trimmed; enabled ones kept.
        const parsed = JSON.parse(raw);
        expect(parsed.extensions).toHaveProperty('SFDC_EXT_STORE_LOCATOR');
        expect(parsed.extensions).toHaveProperty('SFDC_EXT_MAPS');
        expect(parsed.extensions).not.toHaveProperty('SFDC_EXT_WISHLIST');

        // Biome shape — the bytes that make `pnpm lint` pass on a fresh project.
        expect(raw.endsWith('\n')).toBe(true);
        expect(raw).toContain('"dependencies": ["SFDC_EXT_MAPS"]');
        // The short array is NOT expanded one-element-per-line.
        expect(raw).not.toContain('"SFDC_EXT_MAPS"\n');
    });
});
