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
import { parseCookie } from './cookie';

// A value produced by React Router createCookie('x').serialize(...) for an ASCII payload.
const encode = (value: unknown) => encodeURIComponent(btoa(JSON.stringify(value)));

describe('parseCookie', () => {
    it('decodes the named cookie value written via createCookie', () => {
        expect(parseCookie(`name=${encode('GBP')}`, 'name')).toBe('GBP');
        expect(parseCookie(`name=${encode({ a: 1 })}`, 'name')).toEqual({ a: 1 });
    });

    it('reads the named cookie, ignoring others around it', () => {
        expect(parseCookie(`foo=bar; name=${encode('GBP')}; baz=qux`, 'name')).toBe('GBP');
    });

    it('returns null when the cookie is absent', () => {
        expect(parseCookie('other=1', 'name')).toBeNull();
        expect(parseCookie('', 'name')).toBeNull();
    });

    it('returns null on undecodable garbage', () => {
        expect(parseCookie('name=%%%not-base64%%%', 'name')).toBeNull();
    });

    it('matches a cookie name containing regex metacharacters literally', () => {
        // A `.` in the name must not act as "any char" and match a sibling cookie.
        expect(parseCookie(`nameXv2=${encode('GBP')}`, 'name.v2')).toBeNull();
        expect(parseCookie(`name.v2=${encode('GBP')}`, 'name.v2')).toBe('GBP');
    });

    it('does not match a name that is a prefix of a longer cookie name', () => {
        // `currency` must not accidentally read `currency_RefArch`.
        expect(parseCookie(`currency_RefArch=${encode('EUR')}`, 'currency')).toBeNull();
    });
});
