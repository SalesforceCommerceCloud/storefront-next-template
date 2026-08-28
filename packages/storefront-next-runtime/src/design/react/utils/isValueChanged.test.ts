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
import { describe, expect, test } from 'vitest';
import { isValueChanged, isValueEqual } from './isValueChanged';

describe('isValueChanged', () => {
    test.each([
        [undefined, undefined, false, 'the same undefined value'],
        [null, null, false, 'the same null value'],
        [NaN, NaN, false, 'NaN values'],
        [0, -0, true, 'positive and negative zero'],
        ['value', 'value', false, 'equal primitive values'],
        ['value', 'other', true, 'different primitive values'],
        [{}, null, true, 'an object and null'],
        [new Date(0), new Date(0), false, 'objects with no enumerable properties'],
    ])('returns %s for %s', (obj1, obj2, expected, _description) => {
        expect(isValueChanged(obj1, obj2)).toBe(expected);
    });

    test('compares arrays by length and item identity', () => {
        const reference = {};

        expect(isValueChanged([reference, 'value'], [reference, 'value'])).toBe(false);
        expect(isValueChanged([reference], [reference, 'value'])).toBe(true);
        expect(isValueChanged([{}], [{}])).toBe(true);
        expect(isValueChanged([], {})).toBe(true);
    });

    test('compares objects by enumerable keys and top-level value identity', () => {
        const reference = {};

        expect(isValueChanged({ name: 'Hero', reference }, { name: 'Hero', reference })).toBe(false);
        expect(isValueChanged({ name: 'Hero' }, { name: 'Footer' })).toBe(true);
        expect(isValueChanged({ name: 'Hero' }, { name: 'Hero', locale: 'en-US' })).toBe(true);
        expect(isValueChanged({ value: {} }, { value: {} })).toBe(true);
    });
});

describe('isValueEqual', () => {
    test.each([
        [{ name: 'Hero' }, { name: 'Hero' }, true],
        [[1, 2], [1, 2], true],
        [[1, 2], [2, 1], false],
        [{ value: {} }, { value: {} }, false],
    ])('returns the inverse of isValueChanged for %j and %j', (obj1, obj2, expected) => {
        expect(isValueEqual(obj1, obj2)).toBe(expected);
    });
});
