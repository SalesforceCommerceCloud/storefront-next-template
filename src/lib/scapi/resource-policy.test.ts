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
import { isResourceLoaderAllowed, isResourceOperationAllowed } from './resource-policy';

describe('resource operation boundaries', () => {
    it.each([
        ['shopperBasketsV2', 'getBasket'],
        ['shopperProducts', 'getProduct'],
        ['shopperProducts', 'getProducts'],
        ['shopperSearch', 'getSearchSuggestions'],
    ])('allows %s.%s only as a loader', (client, method) => {
        expect(isResourceLoaderAllowed(client, method)).toBe(true);
        expect(isResourceOperationAllowed('loader', client, method)).toBe(true);
        expect(isResourceOperationAllowed('action', client, method)).toBe(false);
    });

    it.each([
        'createCustomerAddress',
        'updateCustomerAddress',
        'updateCustomer',
        'updateCustomerPassword',
        'removeCustomerAddress',
    ])('keeps %s action-only and outside read qualification', (method) => {
        expect(isResourceLoaderAllowed('shopperCustomers', method)).toBe(false);
        expect(isResourceOperationAllowed('loader', 'shopperCustomers', method)).toBe(false);
        expect(isResourceOperationAllowed('action', 'shopperCustomers', method)).toBe(true);
    });

    it.each([
        [undefined, 'getProduct'],
        ['shopperProducts', null],
        ['shopperProducts', 'unknown'],
        ['unknown', 'getProduct'],
        ['helpers', 'basket'],
    ])('rejects unsupported or malformed operation %s.%s', (client, method) => {
        expect(isResourceLoaderAllowed(client, method)).toBe(false);
        expect(isResourceOperationAllowed('loader', client, method)).toBe(false);
        expect(isResourceOperationAllowed('action', client, method)).toBe(false);
    });
});
