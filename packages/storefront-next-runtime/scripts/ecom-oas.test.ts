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

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ECOM_BUNDLE_LOCATIONS, loadBundledApi, readEcomSource } from './ecom-oas.ts';

const SPECS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi-specs');

describe('ECOM_BUNDLE_LOCATIONS', () => {
    it('has a location for every tracked spec folder and nothing else', () => {
        const trackedKeys = fs
            .readdirSync(SPECS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(SPECS_DIR, entry.name, 'exchange.json')))
            .map((entry) => {
                const { assetId, apiVersion } = JSON.parse(
                    fs.readFileSync(path.join(SPECS_DIR, entry.name, 'exchange.json'), 'utf-8')
                );
                return `${assetId}-${apiVersion}`;
            });
        expect(Object.keys(ECOM_BUNDLE_LOCATIONS).sort()).toEqual(trackedKeys.sort());
    });

    it('maps each tracked API to its own bundle folder', () => {
        const locations = Object.values(ECOM_BUNDLE_LOCATIONS);
        expect(new Set(locations).size).toBe(locations.length);
    });

    it('ends every location in the version the key names', () => {
        for (const [key, location] of Object.entries(ECOM_BUNDLE_LOCATIONS)) {
            expect(location.endsWith(`/${key.slice(key.lastIndexOf('-') + 1)}`)).toBe(true);
        }
    });
});

describe('loadBundledApi', () => {
    const location = 'shopper/product/shopper-products/v1';
    let bundlesRoot: string;

    const writeBundle = (
        overrides: { manifest?: Record<string, unknown>; specText?: string; recordedSha?: string } = {}
    ): void => {
        const specText = overrides.specText ?? 'openapi: 3.0.3\n';
        const dir = path.join(bundlesRoot, location);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'spec-public.yaml'), specText);
        const sha256 = overrides.recordedSha ?? crypto.createHash('sha256').update(specText).digest('hex');
        fs.writeFileSync(
            path.join(dir, 'manifest.json'),
            JSON.stringify({
                apiName: 'shopper-products',
                apiVersion: 'v1',
                schemaVersion: '1.15.0',
                internalOnly: false,
                artifacts: { public: { path: `${location}/spec-public.yaml`, sha256 } },
                ...overrides.manifest,
            })
        );
    };

    beforeEach(() => {
        bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-bundles-test-'));
    });

    afterEach(() => {
        fs.rmSync(bundlesRoot, { recursive: true, force: true });
    });

    it('returns the schema version and public bundle path', () => {
        writeBundle();
        expect(loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toEqual({
            version: '1.15.0',
            publicSpec: path.join(bundlesRoot, location, 'spec-public.yaml'),
        });
    });

    it('throws when the location has no manifest', () => {
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('No bundle manifest');
    });

    it('throws when the manifest describes a different API', () => {
        writeBundle({ manifest: { apiName: 'shopper-search' } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow(
            'describes shopper-search-oas-v1'
        );
    });

    it('throws for an internal-only API', () => {
        writeBundle({ manifest: { internalOnly: true } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('internal-only');
    });

    it('throws when the bundle does not match its recorded SHA-256', () => {
        writeBundle({ recordedSha: 'deadbeef' });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('SHA-256');
    });

    it.each([
        ['internalOnly', { internalOnly: undefined }],
        ['apiName', { apiName: 42 }],
        ['schemaVersion', { schemaVersion: undefined }],
        ['artifact path', { artifacts: { public: { path: 7, sha256: 'x' } } }],
        ['artifact sha256', { artifacts: { public: { path: 'shopper/product/shopper-products/v1/x.yaml' } } }],
    ])('throws when the manifest has a missing or mistyped %s', (_field, manifest) => {
        writeBundle({ manifest });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('malformed manifest');
    });

    it('throws when the manifest is not a JSON object', () => {
        writeBundle();
        fs.writeFileSync(path.join(bundlesRoot, location, 'manifest.json'), '[]');
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('malformed manifest');
    });

    it('throws when the manifest has no public artifact', () => {
        writeBundle({ manifest: { artifacts: undefined } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('no public artifact');
    });

    it('throws when schemaVersion is not MAJOR.MINOR.PATCH', () => {
        writeBundle({ manifest: { schemaVersion: '1.15' } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('MAJOR.MINOR.PATCH');
    });

    it('throws when the schemaVersion major does not match the API version', () => {
        writeBundle({ manifest: { schemaVersion: '2.0.0' } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('does not match v1');
    });

    it.each([
        '../shopper-search/v1/spec-public.yaml',
        `${'shopper/product/shopper-products/v1'}/../v2/x.yaml`,
    ])('throws when the bundle path leaves the bundle folder (%s)', (artifactPath) => {
        writeBundle({ manifest: { artifacts: { public: { path: artifactPath, sha256: 'x' } } } });
        expect(() => loadBundledApi(bundlesRoot, 'shopper-products-oas-v1', location)).toThrow('outside');
    });
});

describe('readEcomSource', () => {
    it('returns the repo URL and bundles root from the environment', () => {
        expect(readEcomSource({ ECOM_REPO_URL: 'https://example.test/r.git', ECOM_BUNDLES_ROOT: 'a/b' })).toEqual({
            repoUrl: 'https://example.test/r.git',
            bundlesRoot: 'a/b',
        });
    });

    it('trims whitespace and drops trailing slashes from the bundles root', () => {
        expect(
            readEcomSource({ ECOM_REPO_URL: ' https://example.test/r.git\n', ECOM_BUNDLES_ROOT: ' a/b//\n' })
        ).toEqual({
            repoUrl: 'https://example.test/r.git',
            bundlesRoot: 'a/b',
        });
    });

    it('names every variable that is unset, empty or blank', () => {
        expect(() => readEcomSource({ ECOM_REPO_URL: ' \n', ECOM_BUNDLES_ROOT: 'a/b' })).toThrow(
            'ECOM_REPO_URL not set'
        );
        expect(() => readEcomSource({ ECOM_REPO_URL: '' })).toThrow('ECOM_REPO_URL and ECOM_BUNDLES_ROOT not set');
        expect(() => readEcomSource({ ECOM_REPO_URL: 'https://example.test/r.git' })).toThrow(
            'ECOM_BUNDLES_ROOT not set'
        );
    });
});
