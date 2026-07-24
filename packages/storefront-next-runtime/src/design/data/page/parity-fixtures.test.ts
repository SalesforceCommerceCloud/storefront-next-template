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
 * Page Designer Attribute Serialization parity harness.
 *
 * For each fixture under `test-fixtures/page-designer-parity/fixtures/`,
 * this test feeds the canonical input `PageManifest` through `resolvePage`
 * and asserts the output matches the canonical SCAPI `getPage` response,
 * after JSON canonicalisation (sorted keys).
 *
 * Note: the fixtures live outside `src/` so they are not bundled into the
 * runtime package's published output. The loader at
 * `test-fixtures/page-designer-parity/index.ts` is the canonical accessor;
 * this file mirrors its on-disk contract so the test compiles within the
 * runtime package's `rootDir: ./src` constraint.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePage } from './resolve-page';
import type { AttributeResolutionContext } from './attribute-resolution';
import type { ManifestStorage, PageManifest, SiteManifest } from '../types';
import type { ShopperExperience } from '@/scapi-client/types';

interface ParityFixtureMeta {
    sourceStack: string;
    requestHost: string;
    locale: string;
    defaultLocale: string;
    siteId: string;
    capturedAt: string;
    description: string;
}

interface ParityFixture {
    id: string;
    manifest: PageManifest;
    expected: ShopperExperience.schemas['Page'];
    meta: ParityFixtureMeta;
}

// Resolve the fixtures directory relative to this test file.
// `<repo>/packages/storefront-next-runtime/src/design/data/page/parity-fixtures.test.ts`
// → `<repo>/packages/storefront-next-runtime/test-fixtures/page-designer-parity/fixtures`
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, '../../../../test-fixtures/page-designer-parity/fixtures');

function listFixtureIds(): string[] {
    if (!fs.existsSync(fixturesDir)) return [];

    return fs
        .readdirSync(fixturesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
}

function loadFixture(id: string): ParityFixture {
    const dir = path.join(fixturesDir, id);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as PageManifest;
    const expected = JSON.parse(
        fs.readFileSync(path.join(dir, 'expected.json'), 'utf8')
    ) as ShopperExperience.schemas['Page'];
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as ParityFixtureMeta;

    return { id, manifest, expected, meta };
}

/**
 * Recursively sorts object keys so byte-equality assertions are
 * independent of property order. Arrays are left in the original order
 * because Page Designer regions and components are order-significant.
 */
function canonicalize<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(canonicalize) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;

        return Object.keys(obj)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = canonicalize(obj[key]);
                return acc;
            }, {}) as unknown as T;
    }

    return value;
}

function makeStorage(pageManifest: PageManifest): ManifestStorage {
    return {
        getPageManifest: () => Promise.resolve(pageManifest),
        getComponentManifest: () => Promise.resolve(null),
        getSiteManifest: () => Promise.resolve({ contentObjectAssignments: {}, categories: {} } as SiteManifest),
    };
}

const ids = listFixtureIds();

describe('page-designer parity fixtures', () => {
    // Sanity check: if the fixtures directory is missing or empty, the harness
    // is not exercising anything. Fail loudly so a bad workspace setup doesn't
    // silently pass.
    it('finds at least one fixture', () => {
        expect(ids.length, `No fixtures found under ${fixturesDir}`).toBeGreaterThan(0);
    });

    for (const id of ids) {
        const fixture = loadFixture(id);

        it(`fixture: ${id}`, async () => {
            // Build the resolver context from the fixture meta. `host` matches the host
            // SCAPI was captured against so URL stamping reproduces the exact strings the
            // expected fixture carries. `resolveMediaUrl` mirrors ECOM's
            // URLWebRootProvider#getRelativeWebRoot output: the storefront origin, then
            // /on/demandware.static/<siteOrDash>/<libraryDomain>/<locale>/<fingerprint>/<path>.
            const attrCtx: AttributeResolutionContext = {
                host: fixture.meta.requestHost,
                resolveMediaUrl: ({ libraryDomain, path: mediaPath, locale: mediaLocale }) => {
                    const siteOrDash = libraryDomain === '-' ? fixture.meta.siteId : '-';
                    const localeSeg = mediaLocale ?? fixture.meta.locale ?? 'default';
                    const cleanPath = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
                    return `${fixture.meta.requestHost}/on/demandware.static/${siteOrDash}/${libraryDomain}/${localeSeg}/v1${cleanPath}`;
                },
                locale: fixture.meta.locale,
            };

            const resolved = await resolvePage({
                id: fixture.manifest.pageId,
                attrCtx,
                identifierType: 'page',
                locale: fixture.meta.locale,
                defaultLocale: fixture.meta.defaultLocale,
                manifestStorage: makeStorage(fixture.manifest),
            });

            expect(resolved, `resolvePage returned null for fixture ${id}`).not.toBeNull();
            expect(canonicalize(resolved)).toEqual(canonicalize(fixture.expected));
        });
    }
});
