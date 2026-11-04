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
import browserHardeningHeaders, { dataSchema } from './browser-hardening-headers';

const HARDENED = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=()',
};
const page = (headers: Record<string, string>) => ({
    home: network([harEntry(PAGE_URL, { headers, mimeType: 'text/html' })]),
});

describe('security/browser-hardening-headers', () => {
    it('passes a hardened document', async () => {
        const result = await runRule(browserHardeningHeaders, page(HARDENED));
        expect(dataSchema.parse(result.data).checked).toEqual([{ page: 'home', url: PAGE_URL, responses: 1 }]);
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.evidence[0]).toMatchObject({ pointer: '/log/entries/0/request/url' });
    });

    it('accepts CSP frame-ancestors in place of X-Frame-Options', async () => {
        const rest: Record<string, string> = { ...HARDENED };
        delete rest['X-Frame-Options'];
        const result = await runRule(
            browserHardeningHeaders,
            page({ ...rest, 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" })
        );
        expect(result.decision?.status).toBe('pass');
    });

    it('fails each missing or weak header', async () => {
        const result = await runRule(browserHardeningHeaders, page({}));
        expect(result.decision?.status).toBe('fail');
        expect(result.data.failures[0]?.reasons).toEqual([
            'X-Content-Type-Options is not nosniff.',
            'Neither CSP frame-ancestors nor X-Frame-Options is set.',
            'Referrer-Policy is missing.',
            'Permissions-Policy is missing.',
        ]);
        expect(result.decision?.summary).toMatch(/\(\+1 more\)$/);
        // The last recognized policy wins.
        const unsafe = await runRule(
            browserHardeningHeaders,
            page({ ...HARDENED, 'Referrer-Policy': 'no-referrer, unsafe-url' })
        );
        expect(unsafe.data.failures[0]?.reasons).toEqual([
            'Referrer-Policy unsafe-url discloses more than the baseline allows.',
        ]);
    });

    it('leaves the rule undecided without a matching document', async () => {
        const missing = await runRule(browserHardeningHeaders, { home: {} });
        expect(missing.decision).toBeUndefined();
        expect(missing.data.skipped).toEqual([
            { page: 'home', reason: 'The HAR or final document identity was unavailable.' },
        ]);
        const unmatched = await runRule(browserHardeningHeaders, {
            home: network([harEntry('https://shop.test/other')]),
        });
        expect(unmatched.data.skipped[0]?.reason).toBe('The final document response could not be matched in the HAR.');
    });
});
