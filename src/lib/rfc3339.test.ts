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
import { compareRfc3339Timestamps, parseRfc3339Timestamp } from './rfc3339';

describe('parseRfc3339Timestamp', () => {
    it.each([
        '2026-09-25',
        '2026-09-25T12:00:00',
        '2026-02-30T00:00:00.000Z',
        '2026-09-25T12:00:60Z',
        '2026-09-25T12:00:00-00:00',
    ])('rejects a non-RFC 3339 or invalid timestamp: %s', (timestamp) => {
        expect(parseRfc3339Timestamp(timestamp)).toBeNull();
    });

    it('parses offsets and preserves fractional precision', () => {
        expect(parseRfc3339Timestamp('2026-09-25T12:00:00.123456-07:00')).toEqual({
            epochSecond: 1790362800,
            epochMilliseconds: 1790362800123,
            fractionalSecond: '123456',
        });
    });
});

describe('compareRfc3339Timestamps', () => {
    it('orders sub-millisecond timestamps without losing precision', () => {
        expect(compareRfc3339Timestamps('2026-09-25T12:00:00.123456Z', '2026-09-25T12:00:00.123457Z')).toBe(-1);
    });

    it('returns null when either timestamp is invalid', () => {
        expect(compareRfc3339Timestamps('not-a-date', '2026-09-25T12:00:00Z')).toBeNull();
    });
});
