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
import { describe, expect, it } from 'vitest';
import { harEntry, network, PAGE_URL, runRule } from '../../../../__fixtures__/archive';
import cacheControl, { dataSchema } from './cache-control';

const asset = (file: string, mimeType: string | undefined, cache?: string, headers: Record<string, string> = {}) =>
    harEntry(`${PAGE_URL}${file}`, {
        ...(mimeType ? { mimeType } : {}),
        headers: { ...(cache ? { 'Cache-Control': cache } : {}), ...headers },
    });

describe('performance/cache-control', () => {
    it('passes long-lived fingerprinted and public assets, and skips what it does not grade', async () => {
        const result = await runRule(cacheControl, {
            home: network([
                harEntry(PAGE_URL, { mimeType: 'text/html' }),
                asset('entry.client-Be9z2OkY.js', 'text/javascript', 'public, max-age=31536000, immutable'),
                asset('logo.png', undefined, 'max-age="86400"', { 'Content-Type': 'image/png; charset=binary' }),
                asset('data.json', 'application/json'),
                harEntry('https://cdn.test/lib.js', { mimeType: 'text/javascript' }),
                harEntry(`${PAGE_URL}gone.js`, { status: 404, mimeType: 'text/javascript' }),
            ]),
        });
        expect(dataSchema.parse(result.data).checked[0]?.responses).toBe(2);
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.summary).toBe(
            'All 2 same-host script, stylesheet, image and font responses checked on home have long enough Cache-Control lifetimes.'
        );
    });

    it('fails short, private, uncacheable and missing lifetimes', async () => {
        const result = await runRule(cacheControl, {
            home: network([
                harEntry(PAGE_URL, { mimeType: 'text/html' }),
                // Words are not content hashes.
                asset('app.download.css', 'text/css', 'max-age=60'),
                asset('chunk.3f2a9c0d.js', 'application/ecmascript', 'max-age=3600'),
                asset('hero.webp', 'image/webp', 'private, no-store'),
                asset('brand.ttf', 'application/x-font-ttf'),
            ]),
        });
        expect(result.decision?.status).toBe('fail');
        expect(result.data.failures.map((failure) => failure.reasons)).toEqual([
            ['max-age=60 is under 3600 seconds for a non-fingerprinted script or stylesheet.'],
            ['max-age=3600 is under 31536000 seconds for a fingerprinted asset.'],
            ['Cache-Control is private.', 'Cache-Control is no-store.', 'Cache-Control has no valid max-age.'],
            ['Cache-Control is missing.'],
        ]);
        expect(result.decision?.summary).toMatch(/^4 of 4 .* failed: .*\(\+3 more\)$/);
        expect(result.decision?.evidence[0]).toMatchObject({ pointer: '/log/entries/1/response/headers' });
    });

    it('leaves the rule undecided when nothing is eligible', async () => {
        const result = await runRule(cacheControl, { home: network([harEntry(PAGE_URL, { mimeType: 'text/html' })]) });
        expect(result.decision).toBeUndefined();
        expect(result.data.checked).toEqual([{ page: 'home', url: PAGE_URL, responses: 0 }]);
    });
});
