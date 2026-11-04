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
import strictTransportSecurity, { dataSchema } from './strict-transport-security';

const GOOD = 'max-age=31536000; includeSubDomains';
const hsts = (...values: string[]) => [
    harEntry(PAGE_URL, {
        mimeType: 'text/html',
        headers: {},
        response: {
            headers: values.map((value) => ({ name: 'Strict-Transport-Security', value })),
        },
    }),
];
const documents = async (pages: Parameters<typeof runRule>[1]) =>
    dataSchema.parse((await runRule(strictTransportSecurity, pages)).data).documents;

describe('security/strict-transport-security', () => {
    it('passes a long max-age with includeSubDomains on every cell', async () => {
        const result = await runRule(strictTransportSecurity, {
            home: {
                ...network(hsts(GOOD)),
                'network-desktop-cold.har': {
                    log: { entries: hsts('max-age="31536000"; includeSubDomains; preload') },
                },
                'network-desktop-cold.json': { document: { url: PAGE_URL } },
            },
        });
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.summary).toMatch(/^2 HTML page responses sent/);
        expect(result.decision?.evidence[1]).toMatchObject({
            pointer: '/log/entries/0/response/headers/0/value',
            value: 'max-age="31536000"; includeSubDomains; preload',
        });
    });

    it('fails a missing, short or invalid policy', async () => {
        const result = await runRule(strictTransportSecurity, {
            home: network(hsts()),
            plp: network(hsts('max-age=600')),
            pdp: network(hsts('max-age=forever; includeSubDomains')),
        });
        expect(result.decision?.summary).toMatch(/^3 HTML page responses failed/);
        expect(dataSchema.parse(result.data).documents.map((item) => item.reasons)).toEqual([
            ['Strict-Transport-Security is missing.'],
            ['max-age is below 15552000 seconds.', 'includeSubDomains is missing.'],
            ['max-age is missing or invalid.'],
        ]);
        const one = await runRule(strictTransportSecurity, { home: network(hsts('max-age=600; includeSubDomains')) });
        expect(one.decision?.summary).toMatch(/^1 HTML page response failed/);
    });

    it('leaves ambiguous, development and unmatched documents unresolved', async () => {
        const items = await documents({
            home: network(hsts(GOOD, GOOD)),
            local: network([harEntry('http://localhost:3000/')], 'http://localhost:3000/'),
            broken: network([], 'not a url'),
            unmatched: { 'network-mobile-cold.har': { log: { entries: [] } } },
            empty: {},
        });
        expect(items.map((item) => [item.page, item.result, item.reasons])).toEqual([
            [
                'home',
                'not-evaluated',
                ['Multiple Strict-Transport-Security headers make the effective policy ambiguous.'],
            ],
            ['local', 'not-evaluated', ['The final document is not an eligible public HTTPS URL.']],
            ['broken', 'not-evaluated', ['The final document is not an eligible public HTTPS URL.']],
            ['unmatched', 'not-evaluated', ['The HAR or final document identity was unavailable.']],
            ['empty', 'not-evaluated', ['No representative HAR artifact was available.']],
        ]);
        // A pass with an unresolved document stays undecided.
        const mixed = await runRule(strictTransportSecurity, { home: network(hsts(GOOD)), empty: {} });
        expect(mixed.decision).toBeUndefined();
    });
});
