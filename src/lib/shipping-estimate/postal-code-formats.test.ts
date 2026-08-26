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
import { getCountryCodeFromLocale, getPostalCodeFormat } from './postal-code-formats';

describe('getCountryCodeFromLocale', () => {
    it.each([
        ['zh-Hans-CN', 'CN'],
        ['en-US-u-ca-gregory', 'US'],
        [' EN-us ', 'US'],
    ])('extracts the region from %s', (locale, expected) => {
        expect(getCountryCodeFromLocale(locale)).toBe(expected);
    });

    it.each(['en-ZZ', 'not_a_locale', 'en', '', '  '])('returns undefined for %p', (locale) => {
        expect(getCountryCodeFromLocale(locale)).toBeUndefined();
    });
});

describe('getPostalCodeFormat', () => {
    describe('resolution', () => {
        it('resolves by country suffix, case-insensitively', () => {
            expect(getPostalCodeFormat('en-US').example).toBe('90210');
            expect(getPostalCodeFormat('en-us').example).toBe('90210');
            expect(getPostalCodeFormat(' en-US-u-ca-gregory ').example).toBe('90210');
            expect(getPostalCodeFormat('zh-Hans-CN').example).toBe('100000');
            expect(getPostalCodeFormat('fr-CA').example).toBe('M5V 3A8');
            expect(getPostalCodeFormat('en-CA').example).toBe('M5V 3A8');
        });

        it('prefers a normalized country code over the site locale', () => {
            expect(getPostalCodeFormat('CA').example).toBe('M5V 3A8');
        });

        it('falls back to permissive format for unknown or missing country', () => {
            expect(getPostalCodeFormat('en-ZZ').example).toBe('');
            expect(getPostalCodeFormat('en').example).toBe('');
            expect(getPostalCodeFormat('not_a_locale').example).toBe('');
            expect(getPostalCodeFormat(null).example).toBe('');
            expect(getPostalCodeFormat(undefined).example).toBe('');
        });
    });

    describe('US', () => {
        const fmt = getPostalCodeFormat('en-US');
        it.each([
            ['90210', true],
            ['12345', true],
            ['12345-6789', true],
            ['-90210', true],
            ['94105-', true],
            ['1234', false],
            ['ABCDE', false],
            ['12345-678', false],
        ])('validates %s => %s', (input, valid) => {
            expect(fmt.regex.test(fmt.normalize(input))).toBe(valid);
        });
    });

    describe('CA', () => {
        const fmt = getPostalCodeFormat('en-CA');
        it('normalizes without-space to canonical space form', () => {
            expect(fmt.normalize('m5v3a8')).toBe('M5V 3A8');
            expect(fmt.normalize('M5V 3A8')).toBe('M5V 3A8');
        });
        it.each([
            ['M5V 3A8', true],
            ['m5v3a8', true],
            ['K1A 0B1', true],
            ['D5V 3A8', false], // D not allowed in position 1
            ['M5D 3A8', false], // D not allowed in position 3
            ['M5V 3O1', false], // O not allowed in position 5
            ['M5V 3W1', false], // W not allowed in position 5
            ['M5V 3Z1', false], // Z not allowed in position 5
            ['12345', false],
            ['M5V 3A', false],
        ])('validates %s => %s', (input, valid) => {
            expect(fmt.regex.test(fmt.normalize(input))).toBe(valid);
        });
    });

    describe('GB', () => {
        const fmt = getPostalCodeFormat('en-GB');
        it('inserts canonical space before final three chars', () => {
            expect(fmt.normalize('sw1a1aa')).toBe('SW1A 1AA');
            expect(fmt.normalize('m11ae')).toBe('M1 1AE');
        });
        it.each([
            ['SW1A 1AA', true],
            ['sw1a1aa', true],
            ['M1 1AE', true],
            ['EC1A 1BB', true],
            ['12345', false],
            ['ABC', false],
        ])('validates %s => %s', (input, valid) => {
            expect(fmt.regex.test(fmt.normalize(input))).toBe(valid);
        });
    });

    describe('IT', () => {
        const fmt = getPostalCodeFormat('it-IT');
        it.each([
            ['00100', true],
            ['20121', true],
            ['1234', false],
            ['ABCDE', false],
        ])('validates %s => %s', (input, valid) => {
            expect(fmt.regex.test(fmt.normalize(input))).toBe(valid);
        });
    });

    describe('NL', () => {
        const fmt = getPostalCodeFormat('nl-NL');
        it('normalizes to `1234 AB` form', () => {
            expect(fmt.normalize('1011ab')).toBe('1011 AB');
        });
        it('validates letters in second segment', () => {
            expect(fmt.regex.test(fmt.normalize('1011 AB'))).toBe(true);
            expect(fmt.regex.test(fmt.normalize('1011 12'))).toBe(false);
        });
    });

    describe('JP', () => {
        const fmt = getPostalCodeFormat('ja-JP');
        it('normalizes 7 digits to `NNN-NNNN`', () => {
            expect(fmt.normalize('1000001')).toBe('100-0001');
        });
    });

    describe('unknown country fallback', () => {
        const fmt = getPostalCodeFormat('xx-ZZ');
        it('accepts reasonable alphanumeric', () => {
            expect(fmt.regex.test(fmt.normalize('12345'))).toBe(true);
            expect(fmt.regex.test(fmt.normalize('AB1 2CD'))).toBe(true);
        });
        it('rejects too-short or too-long input', () => {
            expect(fmt.regex.test(fmt.normalize('A'))).toBe(false);
        });
    });
});
