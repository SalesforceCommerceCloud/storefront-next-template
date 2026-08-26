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
import { normalizeCountryCode } from './country-code';

describe('normalizeCountryCode', () => {
    it.each([
        [' ca ', 'CA'],
        ['GB', 'GB'],
        ['tw', 'TW'],
    ])('normalizes %p to %s', (value, expected) => {
        expect(normalizeCountryCode(value)).toBe(expected);
    });

    it.each(['ZZ', 'QQ', 'USA', '', '  ', null, undefined])('rejects unassigned or malformed value %p', (value) => {
        expect(normalizeCountryCode(value)).toBeUndefined();
    });
});
