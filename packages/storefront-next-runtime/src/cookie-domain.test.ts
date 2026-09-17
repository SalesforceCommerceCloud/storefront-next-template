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
import { isValidCookieDomain } from './cookie-domain';

describe('isValidCookieDomain', () => {
    it('treats an empty / undefined / null domain as valid (host-only: no Domain attribute)', () => {
        expect(isValidCookieDomain(undefined)).toBe(true);
        expect(isValidCookieDomain(null)).toBe(true);
        expect(isValidCookieDomain('')).toBe(true);
    });

    it('accepts well-formed domains', () => {
        // Leading dot, bare host, subdomain, trailing dot, localhost, and a bare IP all pass — the
        // check is deliberately conservative and only rejects clearly-unusable values.
        for (const domain of [
            '.example.com',
            'example.com',
            'shop.example.co.uk',
            'example.com.',
            'localhost',
            '127.0.0.1',
        ]) {
            expect(isValidCookieDomain(domain)).toBe(true);
        }
    });

    it('rejects values a browser would drop or that could inject an extra cookie attribute', () => {
        // Wildcard, comma/semicolon separators, an `=`, and any whitespace (incl. a trailing
        // space or embedded tab/newline) are all rejected.
        for (const domain of [
            '*.example.com',
            '.example.com, .evil.com',
            '.example.com; Secure',
            'domain=.example.com',
            '.example.com ',
            '.exa mple.com',
            '.example.com\t',
            '.example.com\n',
        ]) {
            expect(isValidCookieDomain(domain)).toBe(false);
        }
    });
});
