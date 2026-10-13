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
import { isCartMutationResponse } from './cart-response';

describe('isCartMutationResponse', () => {
    it.each([
        ['POST', 'https://storefront.example/action/cart-item-add'],
        ['POST', 'https://storefront.example/action/cart-set-add'],
        ['POST', 'https://storefront.example/action/cart-bundle-add'],
        ['PATCH', 'https://storefront.example/action/cart-item-update'],
        ['PATCH', 'https://storefront.example/action/cart-bundle-update'],
        ['POST', 'https://storefront.example/action/cart-item-add.data'],
        ['POST', 'https://storefront.example/action/cart-bundle-add.data'],
        ['PATCH', 'https://storefront.example/action/cart-item-update.data'],
        ['PATCH', 'https://storefront.example/action/cart-bundle-update.data'],
        ['POST', 'https://storefront.example/action/cart-set-add?source=pdp'],
        ['POST', 'https://storefront.example/action/cart-set-add.data?source=pdp'],
        ['POST', 'https://storefront.example/global/en-GB/action/cart-item-add'],
        ['PATCH', 'https://storefront.example/us/en-US/action/cart-item-update'],
    ])('accepts %s %s', (method, url) => {
        expect(isCartMutationResponse({ method, url })).toBe(true);
    });

    it.each([
        ['PATCH', 'https://storefront.example/action/cart-item-add'],
        ['PATCH', 'https://storefront.example/action/cart-set-add'],
        ['GET', 'https://storefront.example/action/cart-bundle-add'],
        ['POST', 'https://storefront.example/action/cart-item-update'],
        ['POST', 'https://storefront.example/action/cart-item-remove'],
        ['POST', 'https://storefront.example/global/en-GB/action/cart-item-additional'],
        ['POST', 'https://storefront.example/action/cart-item-add/extra'],
        ['POST', 'https://storefront.example/action/cart-item-add.data.extra'],
    ])('rejects %s %s', (method, url) => {
        expect(isCartMutationResponse({ method, url })).toBe(false);
    });
});
