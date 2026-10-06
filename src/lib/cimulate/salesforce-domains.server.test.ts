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
import { getTokenBridgeUrl, normalizeSalesforceMyDomain } from './salesforce-domains.server';

describe('normalizeSalesforceMyDomain', () => {
    it.each([
        ['acme.my.salesforce.com', 'https://acme.my.salesforce.com'],
        ['https://acme.sandbox.my.salesforce.com/', 'https://acme.sandbox.my.salesforce.com'],
        ['acme.scratch.my.salesforce.com', 'https://acme.scratch.my.salesforce.com'],
        ['acme.develop.my.salesforce.com', 'https://acme.develop.my.salesforce.com'],
    ])('normalizes trusted Core host %s', (input, expected) => {
        expect(normalizeSalesforceMyDomain(input)).toBe(expected);
    });

    it.each([
        '',
        'http://acme.my.salesforce.com',
        'https://user:pass@acme.my.salesforce.com',
        'https://acme.my.salesforce.com/path',
        'https://acme.my.salesforce.com?query=1',
        'https://acme.my.salesforce.com#fragment',
        'https://acme.my.salesforce.com:8443',
        'https://127.0.0.1',
        'https://[::1]',
        'https://salesforce.com.evil.test',
        'https://evilsalesforce.com',
        'https://acme.salesforce.com',
        'https://acme.my.site.com',
        'https://acme.my.salesforce.com.',
        'https://.my.salesforce.com',
        'https://acme..my.salesforce.com',
        'https://-acme.my.salesforce.com',
        'https://acme-.my.salesforce.com',
        'https://ac_me.my.salesforce.com',
        `https://${'a'.repeat(64)}.my.salesforce.com`,
        'https://café.my.salesforce.com',
        'https://caf%C3%A9.my.salesforce.com',
        'not a host',
    ])('rejects untrusted or ambiguous value %s', (input) => {
        expect(normalizeSalesforceMyDomain(input)).toBeNull();
    });

    it('accepts a configured exact-host override', () => {
        expect(
            normalizeSalesforceMyDomain(
                'orgfarm-123.test2.my.pc-rnd.salesforce.com',
                'orgfarm-123.test2.my.pc-rnd.salesforce.com'
            )
        ).toBe('https://orgfarm-123.test2.my.pc-rnd.salesforce.com');
    });

    it.each([
        ['orgfarm-123.test2.my.pc-rnd.salesforce.com', 'other.test2.my.pc-rnd.salesforce.com'],
        ['orgfarm-123.test2.my.pc-rnd.salesforce.com', '*.test2.my.pc-rnd.salesforce.com'],
        ['https://orgfarm-123.test2.my.pc-rnd.salesforce.com/path', 'orgfarm-123.test2.my.pc-rnd.salesforce.com'],
    ])('rejects value %s when exact-host override %s does not authorize it', (input, allowedHost) => {
        expect(normalizeSalesforceMyDomain(input, allowedHost)).toBeNull();
    });

    it('constructs the fixed Core bridge URL', () => {
        expect(getTokenBridgeUrl('acme.my.salesforce.com')).toBe(
            'https://acme.my.salesforce.com/agent/identity/bridge'
        );
    });

    it('constructs the fixed bridge URL for an exact-host override', () => {
        expect(
            getTokenBridgeUrl(
                'orgfarm-123.test2.my.pc-rnd.salesforce.com',
                'orgfarm-123.test2.my.pc-rnd.salesforce.com'
            )
        ).toBe('https://orgfarm-123.test2.my.pc-rnd.salesforce.com/agent/identity/bridge');
    });
});
