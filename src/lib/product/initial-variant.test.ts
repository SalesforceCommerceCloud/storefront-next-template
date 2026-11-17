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
import { getInitialVariant, getInitialVariationValues } from './initial-variant';
import type { ShopperProducts } from '@/scapi';

const product: ShopperProducts.schemas['Product'] = {
    id: 'master',
    type: { master: true },
    variationAttributes: [{ id: 'color', values: [{ value: 'red' }, { value: 'blue' }] }],
    variants: [
        { productId: 'red-sku', orderable: false, variationValues: { color: 'red' } },
        { productId: 'blue-sku', orderable: true, variationValues: { color: 'blue' } },
    ],
};
describe('initial SKU seed', () => {
    it('uses the first orderable child default without a client callback', () => {
        expect(getInitialVariant(product, new URLSearchParams(), true)?.productId).toBe('blue-sku');
    });
    it('keeps an explicit child selection ahead of defaults', () => {
        expect(getInitialVariant(product, new URLSearchParams('color=red'), true)?.productId).toBe('red-sku');
    });
    it('does not guess a master SKU when the selection is ambiguous', () => {
        expect(getInitialVariant(product)).toBeUndefined();
    });
    it('keeps represented product and product variation values ahead of child fallback', () => {
        expect(
            getInitialVariationValues({ ...product, representedProduct: { id: 'red-sku' } }, undefined, true)
        ).toEqual({ color: 'red' });
        expect(getInitialVariationValues({ ...product, variationValues: { color: 'red' } }, undefined, true)).toEqual({
            color: 'red',
        });
    });
});
