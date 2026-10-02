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
import { applyVariationChange, findVariant, getAvailableValues, hasExchangeOptions } from './exchange-options';
import type { ExchangeVariant } from './types';

const variants: ExchangeVariant[] = [
    { sku: 'red-s', variationValues: { color: 'red', size: 'S' }, orderable: true },
    { sku: 'red-m', variationValues: { color: 'red', size: 'M' }, orderable: true },
    { sku: 'blue-m', variationValues: { color: 'blue', size: 'M' }, orderable: true },
    { sku: 'blue-l', variationValues: { color: 'blue', size: 'L' }, orderable: false },
];

describe('exchange options', () => {
    it('finds only orderable exact matches', () => {
        expect(findVariant(variants, { color: 'red', size: 'M' })?.sku).toBe('red-m');
        expect(findVariant(variants, { color: 'blue', size: 'L' })).toBeUndefined();
    });

    it('keeps the other choices when the new combination exists', () => {
        expect(applyVariationChange(variants, { color: 'red', size: 'M' }, 'color', 'blue')).toEqual({
            color: 'blue',
            size: 'M',
        });
    });

    it('moves to the closest variant when the combination does not exist', () => {
        expect(applyVariationChange(variants, { color: 'red', size: 'S' }, 'color', 'blue')).toEqual({
            color: 'blue',
            size: 'M',
        });
    });

    it('returns null when no orderable variant has the value', () => {
        expect(applyVariationChange(variants, { color: 'red', size: 'M' }, 'size', 'L')).toBeNull();
    });

    it('lists available values', () => {
        expect(Array.from(getAvailableValues(variants, 'size'))).toEqual(['S', 'M']);
    });

    it('offers exchange only when another orderable variant exists', () => {
        expect(hasExchangeOptions({ sku: 'red-m', variants })).toBe(true);
        expect(hasExchangeOptions({ sku: 'red-m', variants: [variants[1]] })).toBe(false);
        expect(hasExchangeOptions({ sku: 'red-m', variants: [] })).toBe(false);
    });
});
