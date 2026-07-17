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

import { describe, it, expect } from 'vitest';
import { parseCurrencyCookie, validateCurrency } from './cookie';

// Value produced by React Router createCookie('currency').serialize('GBP').
const SERIALIZED_GBP = 'IkdCUCI%3D';

describe('parseCurrencyCookie', () => {
    it('decodes the named cookie value written by the site-context middleware', () => {
        expect(parseCurrencyCookie(`currency=${SERIALIZED_GBP}`, 'currency')).toBe('GBP');
    });

    it('reads the configured cookie name, ignoring others', () => {
        expect(parseCurrencyCookie(`foo=bar; currency=${SERIALIZED_GBP}; baz=qux`, 'currency')).toBe('GBP');
    });

    it('returns null when the cookie is absent', () => {
        expect(parseCurrencyCookie('other=1', 'currency')).toBeNull();
    });

    it('returns null on undecodable garbage', () => {
        expect(parseCurrencyCookie('currency=%%%not-base64%%%', 'currency')).toBeNull();
    });

    it('matches a cookie name containing regex metacharacters literally', () => {
        // A `.` in the configured name must not act as "any char" and match a sibling cookie.
        expect(parseCurrencyCookie(`currencyXv2=${SERIALIZED_GBP}`, 'currency.v2')).toBeNull();
        expect(parseCurrencyCookie(`currency.v2=${SERIALIZED_GBP}`, 'currency.v2')).toBe('GBP');
    });
});

describe('validateCurrency', () => {
    const supported = ['USD', 'GBP', 'EUR'];

    it('returns the value when supported', () => {
        expect(validateCurrency('GBP', supported)).toBe('GBP');
    });

    it('returns null for an unsupported / tampered value', () => {
        expect(validateCurrency('XXX', supported)).toBeNull();
    });

    it('returns null for null input', () => {
        expect(validateCurrency(null, supported)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(validateCurrency('', supported)).toBeNull();
    });
});
