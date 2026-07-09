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
import {
    getReturnsAndWarranty,
    getIngredientsData,
    getUsageInstructions,
    getCareInstructions,
    getTechSpecs,
    pdpSectionApi,
} from './product-content.server';

describe('product-content.server', () => {
    describe('getReturnsAndWarranty', () => {
        it('returns returns & warranty data with title, description, and policy sections', async () => {
            const data = await getReturnsAndWarranty('product-123');
            expect(data.title).toBeTruthy();
            expect(data.description).toBeTruthy();
            expect(data.returnsPolicy.heading).toBeTruthy();
            expect(data.warranty.heading).toBeTruthy();
            expect(data.exchanges.heading).toBeTruthy();
            expect(data.needHelp?.email).toBeTruthy();
        });

        it('returns the same fixture regardless of productId', async () => {
            const a = await getReturnsAndWarranty('product-1');
            const b = await getReturnsAndWarranty('product-2');
            expect(a).toEqual(b);
        });
    });

    describe('section content', () => {
        it.each([
            ['getIngredientsData', getIngredientsData],
            ['getUsageInstructions', getUsageInstructions],
            ['getCareInstructions', getCareInstructions],
            ['getTechSpecs', getTechSpecs],
        ] as const)('%s returns html and contentType', async (_, fn) => {
            const data = await fn('product-123');
            expect(data.html).toBeTruthy();
            expect(data.contentType).toBeTruthy();
        });
    });

    describe('pdpSectionApi', () => {
        it('exposes the four PDP section getters keyed by api method name', () => {
            expect(Object.keys(pdpSectionApi).sort()).toEqual([
                'getCareInstructions',
                'getIngredientsData',
                'getTechSpecs',
                'getUsageInstructions',
            ]);
        });
    });
});
