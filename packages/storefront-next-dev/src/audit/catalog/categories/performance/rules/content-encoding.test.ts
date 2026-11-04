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
import contentEncoding, { dataSchema } from './content-encoding';

describe('performance/content-encoding', () => {
    it('passes compressed responses and ignores small or other ones', async () => {
        const result = await runRule(contentEncoding, {
            home: network([
                harEntry(PAGE_URL, { mimeType: 'text/html', size: 4096, headers: { 'Content-Encoding': 'br' } }),
                harEntry(`${PAGE_URL}a.js`, {
                    mimeType: 'text/javascript',
                    size: 20_000,
                    headers: { 'Content-Encoding': 'gzip' },
                }),
                harEntry(`${PAGE_URL}small.css`, { mimeType: 'text/css', size: 2000 }),
                harEntry(`${PAGE_URL}hero.png`, { mimeType: 'image/png', size: 200_000 }),
                harEntry(`${PAGE_URL}unsized.js`, { mimeType: 'text/javascript' }),
            ]),
        });
        expect(dataSchema.parse(result.data).checked[0]?.responses).toBe(2);
        expect(result.decision?.status).toBe('pass');
    });

    it('fails uncompressed HTML, JavaScript and CSS', async () => {
        const result = await runRule(contentEncoding, {
            home: network([
                harEntry(PAGE_URL, { mimeType: 'text/html', size: 4096, headers: { 'Content-Encoding': 'identity' } }),
                harEntry(`${PAGE_URL}app.css`, { mimeType: 'text/css', size: 30_720 }),
            ]),
        });
        expect(result.decision?.status).toBe('fail');
        expect(result.data.failures.map((failure) => [failure.reasons, failure.headers])).toEqual([
            [
                ['HTML response of 4 KiB has no br, gzip or zstd Content-Encoding.'],
                { 'content-type': null, 'content-encoding': 'identity' },
            ],
            [
                ['CSS response of 30 KiB has no br, gzip or zstd Content-Encoding.'],
                { 'content-type': null, 'content-encoding': null },
            ],
        ]);
    });
});
