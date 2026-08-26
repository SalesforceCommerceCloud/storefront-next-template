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
import { FULFILLMENT_OPTION_IDS, createFulfillmentSelection, serializeFulfillmentSelection } from './types';

describe('fulfillment contract', () => {
    it('keeps the existing delivery and pickup payload IDs', () => {
        expect(FULFILLMENT_OPTION_IDS).toEqual({
            DELIVERY: 'delivery',
            PICKUP: 'pickup',
        });
    });

    it('creates and serializes a selected option with JSON-safe metadata', () => {
        const selection = createFulfillmentSelection(FULFILLMENT_OPTION_IDS.PICKUP, {
            storeId: 'store-1',
            inventoryId: 'inventory-1',
        });

        expect(selection).toEqual({
            optionId: 'pickup',
            metadata: {
                storeId: 'store-1',
                inventoryId: 'inventory-1',
            },
        });
        expect(serializeFulfillmentSelection(selection)).toBe(
            '{"optionId":"pickup","metadata":{"storeId":"store-1","inventoryId":"inventory-1"}}'
        );
    });
});
