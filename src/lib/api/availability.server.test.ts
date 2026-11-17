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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouterContextProvider } from 'react-router';
import { ApiError, AuthTokenInvalidError } from '@/scapi';
import { fetchAvailabilityByIds } from './availability.server';
import { NormalizedApiError } from './normalized-api-error';

const mocks = vi.hoisted(() => ({ getAvailability: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({ shopperAvailability: { getAvailability: mocks.getAvailability } }),
}));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ error: mocks.error }) }));
const context = {} as Readonly<RouterContextProvider>;
const inventory = { id: 'site', ats: 96, stockLevel: 96, orderable: true };

describe('fetchAvailabilityByIds', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAvailability.mockReset().mockImplementation(({ params }) =>
            Promise.resolve({
                data: { data: params.query.productIds.map((id: string) => ({ id, inventories: [inventory] })) },
            })
        );
    });
    it('deduplicates and trims exact IDs with only the supported productIds query', async () => {
        expect(await fetchAvailabilityByIds(context, [' sku ', '', 'sku', '  '])).toEqual([
            { id: 'sku', inventories: [inventory] },
        ]);
        expect(mocks.getAvailability).toHaveBeenCalledExactlyOnceWith({ params: { query: { productIds: ['sku'] } } });
    });
    it('skips requests for an empty normalized list', async () => {
        expect(await fetchAvailabilityByIds(context, ['', ' '])).toEqual([]);
        expect(mocks.getAvailability).not.toHaveBeenCalled();
    });
    it.each([24, 25])('batches %s IDs at the API limit and merges responses', async (count) => {
        const ids = Array.from({ length: count }, (_, i) => `sku-${i}`);
        const result = await fetchAvailabilityByIds(context, ids);
        expect(result.map(({ id }) => id)).toEqual(ids);
        expect(mocks.getAvailability.mock.calls.map(([args]) => args.params.query.productIds.length)).toEqual(
            count === 24 ? [24] : [24, 1]
        );
    });
    it('retains partial records and handles an absent response body', async () => {
        mocks.getAvailability.mockResolvedValueOnce({ data: { data: [{ id: 'a', inventories: [inventory] }] } });
        expect(await fetchAvailabilityByIds(context, ['a', 'b'])).toEqual([{ id: 'a', inventories: [inventory] }]);
        mocks.getAvailability.mockResolvedValueOnce({});
        expect(await fetchAvailabilityByIds(context, ['a'])).toEqual([]);
    });
    it('logs and normalizes network failures with their original cause', async () => {
        const cause = new Error('network');
        mocks.getAvailability.mockRejectedValueOnce(cause);
        await expect(fetchAvailabilityByIds(context, ['sku'])).rejects.toMatchObject({
            name: 'NormalizedApiError',
            cause,
        });
        expect(mocks.error).toHaveBeenCalledExactlyOnceWith('shopperAvailability.getAvailability failed', {
            productIds: ['sku'],
        });
    });
    it('preserves the auth sentinel cause', async () => {
        const cause = new AuthTokenInvalidError('expired');
        mocks.getAvailability.mockRejectedValueOnce(cause);
        await expect(fetchAvailabilityByIds(context, ['sku'])).rejects.toMatchObject({ cause });
    });
    it('preserves an API status for downstream auth recovery', async () => {
        const cause = new ApiError({
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers(),
            body: { type: 'Unauthorized', title: 'Unauthorized', detail: 'expired' },
            rawBody: '{}',
            url: 'https://example.com/availability',
            method: 'GET',
        });
        mocks.getAvailability.mockRejectedValueOnce(cause);
        await expect(fetchAvailabilityByIds(context, ['sku'])).rejects.toBeInstanceOf(NormalizedApiError);
        mocks.getAvailability.mockRejectedValueOnce(cause);
        await expect(fetchAvailabilityByIds(context, ['sku'])).rejects.toMatchObject({ status: 401, cause });
    });
});
