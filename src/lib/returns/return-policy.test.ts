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
import { cityManagement } from '@/lib/delivery-promise';
import { RETURN_POLICY } from './eligibility';

/**
 * Cross-checks the policy against the demo inventory file that ships with the repo. It cannot see the sandbox, so it
 * proves only that the SKUs we reference exist in `data/simplified_city_management.json`; confirming the same ids on
 * the sandbox and the Dressup live site is a manual step.
 */
const variantIds = new Set(cityManagement.inventory.flatMap((entry) => entry.variantIds ?? []));
const variantsByProduct = (sku: string): string[] => {
    const entry = cityManagement.inventory.find((candidate) => candidate.variantIds?.includes(sku));
    return entry?.variantIds ?? [];
};

describe('return policy data', () => {
    it.each(RETURN_POLICY.nonReturnableSkus)('non-returnable SKU %s exists in the demo inventory', (sku) => {
        expect(variantIds.has(sku)).toBe(true);
    });

    it.each(RETURN_POLICY.exchangeOnlySkus)('exchange-only SKU %s exists in the demo inventory', (sku) => {
        expect(variantIds.has(sku)).toBe(true);
    });

    it.each(RETURN_POLICY.exchangeOnlySkus)('exchange-only SKU %s has another variant to exchange into', (sku) => {
        expect(variantsByProduct(sku).filter((variant) => variant !== sku).length).toBeGreaterThan(0);
    });

    it('uses a positive whole-number return window', () => {
        expect(Number.isInteger(RETURN_POLICY.defaultWindowDays)).toBe(true);
        expect(RETURN_POLICY.defaultWindowDays).toBeGreaterThan(0);
    });
});
