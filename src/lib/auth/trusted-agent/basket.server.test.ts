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
import { describe, expect, it, vi } from 'vitest';
import { RouterContextProvider } from 'react-router';
import { resolveRegisteredBasket } from './basket.server';

const getCustomerBaskets = vi.fn();
const getBasket = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperCustomers: { getCustomerBaskets }, shopperBasketsV2: { getBasket } }),
}));

describe('resolveRegisteredBasket', () => {
    it('returns the most recently modified basket', async () => {
        getCustomerBaskets.mockResolvedValue({
            data: {
                baskets: [
                    { basketId: 'old', lastModified: '2026-01-01T00:00:00Z' },
                    { basketId: 'new', lastModified: '2026-02-01T00:00:00Z' },
                ],
            },
        });
        getBasket.mockResolvedValue({ data: { basketId: 'new' } });
        await expect(resolveRegisteredBasket(new RouterContextProvider(), 'customer-1')).resolves.toEqual({
            basketId: 'new',
        });
    });

    it('treats a 403 from the customer API as no basket', async () => {
        getCustomerBaskets.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
        await expect(resolveRegisteredBasket(new RouterContextProvider(), 'customer-1')).resolves.toBeUndefined();
    });

    it('rethrows other failures', async () => {
        const failure = Object.assign(new Error('boom'), { status: 500 });
        getCustomerBaskets.mockRejectedValue(failure);
        await expect(resolveRegisteredBasket(new RouterContextProvider(), 'customer-1')).rejects.toBe(failure);
    });
});
