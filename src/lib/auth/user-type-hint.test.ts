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
import { getUserTypeCookieName, parseUserTypeCookie, USERTYPE_COOKIE_NAME, validateUserType } from './user-type-hint';

const SITE_ID = 'RefArch';
const cookieName = `${USERTYPE_COOKIE_NAME}_${SITE_ID}`;

// The hint is written as base64(JSON) (see the middleware) and read via the shared `parseCookie`, so
// on-the-wire fixtures must be encoded the same way — matching the currency/basket companion cookies.
const encode = (value: unknown) => btoa(JSON.stringify(value));

describe('validateUserType', () => {
    it('accepts the two valid user types', () => {
        expect(validateUserType('guest')).toBe('guest');
        expect(validateUserType('registered')).toBe('registered');
    });

    it('rejects any other value (tampered / malformed)', () => {
        // A JS-readable cookie is user-editable — a tampered value must never reach an auth branch.
        expect(validateUserType('admin')).toBeNull();
        expect(validateUserType('REGISTERED')).toBeNull();
        expect(validateUserType('')).toBeNull();
        expect(validateUserType(' guest')).toBeNull();
        expect(validateUserType(0)).toBeNull();
        expect(validateUserType(true)).toBeNull();
        expect(validateUserType(null)).toBeNull();
        expect(validateUserType(undefined)).toBeNull();
        expect(validateUserType({ userType: 'registered' })).toBeNull();
        expect(validateUserType(['guest'])).toBeNull();
    });
});

describe('getUserTypeCookieName', () => {
    it('namespaces the base name with the site id', () => {
        expect(getUserTypeCookieName(SITE_ID)).toBe('__sfdc_usertype_RefArch');
    });
});

describe('parseUserTypeCookie', () => {
    it('parses a valid hint for the given site', () => {
        expect(parseUserTypeCookie(`${cookieName}=${encode('registered')}`, SITE_ID)).toBe('registered');
        expect(parseUserTypeCookie(`${cookieName}=${encode('guest')}`, SITE_ID)).toBe('guest');
    });

    it('extracts the cookie when surrounded by other cookies', () => {
        expect(parseUserTypeCookie(`foo=bar; ${cookieName}=${encode('registered')}; baz=qux`, SITE_ID)).toBe(
            'registered'
        );
    });

    it('returns null when the cookie is absent', () => {
        expect(parseUserTypeCookie('foo=bar; baz=qux', SITE_ID)).toBeNull();
    });

    it('returns null when the value is not valid base64(JSON)', () => {
        // A verbatim (unencoded) value must not be accepted — the shared reader expects base64(JSON).
        expect(parseUserTypeCookie(`${cookieName}=registered`, SITE_ID)).toBeNull();
    });

    it('returns null for an empty header or missing site id', () => {
        expect(parseUserTypeCookie('', SITE_ID)).toBeNull();
        expect(parseUserTypeCookie(`${cookieName}=${encode('registered')}`, '')).toBeNull();
    });

    it('returns null for a tampered value', () => {
        expect(parseUserTypeCookie(`${cookieName}=${encode('admin')}`, SITE_ID)).toBeNull();
        expect(parseUserTypeCookie(`${cookieName}=`, SITE_ID)).toBeNull();
    });

    it('does not match a different site’s hint', () => {
        // Namespacing isolates sites: a hint for RefArchGlobal must not satisfy a RefArch read.
        expect(
            parseUserTypeCookie(`${USERTYPE_COOKIE_NAME}_RefArchGlobal=${encode('registered')}`, SITE_ID)
        ).toBeNull();
    });

    it('does not partial-match a cookie whose name is a prefix', () => {
        // `__sfdc_usertype_RefArch2` must not be read as the `RefArch` hint.
        expect(parseUserTypeCookie(`${USERTYPE_COOKIE_NAME}_RefArch2=${encode('registered')}`, SITE_ID)).toBeNull();
    });
});
