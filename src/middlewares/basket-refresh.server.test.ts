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
import { RouterContextProvider } from 'react-router';
import { basketMetadataContext, basketResourceContext, refreshBasket } from '@/middlewares/basket.server';
import { createApiClients } from '@/lib/api-clients.server';
import { ApiError } from '@/scapi';

vi.mock('@/lib/api-clients.server', () => ({ createApiClients: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ getLogger: () => ({ debug: vi.fn(), error: vi.fn() }) }));
const read = vi.fn();
const serialize = vi.fn(() => Promise.resolve('__sfdc_basket=encoded; Path=/'));
const initial = { basketId: 'b1', totalItemCount: 1, uniqueProductCount: 1, lastModified: '2026-11-26T10:00:00Z' };
function context(snapshot: typeof initial | null = initial) {
    const ctx = new RouterContextProvider();
    ctx.set(basketResourceContext, { snapshot, current: null, hydrated: false });
    ctx.set(basketMetadataContext, {
        currency: 'GBP',
        basketMarkedForDeletion: false,
        calculateSnapshot: () => ({ customCount: 42 }),
        serializeSnapshot: serialize,
    });
    return ctx;
}
describe('background basket refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createApiClients).mockReturnValue({ shopperBasketsV2: { getBasket: read } } as never);
    });
    it('reads a newer revision and returns the custom snapshot and cookie without hydrating middleware state', async () => {
        const basket = { basketId: 'b1', lastModified: '2026-11-26T11:00:00Z', productItems: [{ quantity: 2 }] };
        read.mockResolvedValue({ data: basket });
        const ctx = context();
        const result = await refreshBasket(ctx);
        expect(read).toHaveBeenCalledExactlyOnceWith({
            params: { path: { basketId: 'b1' }, query: { expand: ['approaching_discounts'] } },
        });
        expect(result).toMatchObject({
            success: true,
            basketId: 'b1',
            basket,
            snapshot: { totalItemCount: 2, customCount: 42 },
            cookie: '__sfdc_basket=encoded; Path=/',
        });
        expect(ctx.get(basketResourceContext)?.current).toBeNull();
        expect(ctx.get(basketMetadataContext)?.skipSnapshotCookie).toBe(true);
    });
    it('checks an existing zero-count basket', async () => {
        read.mockResolvedValue({ data: { basketId: 'b1', productItems: [{ quantity: 2 }] } });
        expect(await refreshBasket(context({ ...initial, totalItemCount: 0, uniqueProductCount: 0 }))).toMatchObject({
            success: true,
            snapshot: { totalItemCount: 2 },
        });
    });
    it('does not create or fetch a basket without an identity', async () => {
        expect(await refreshBasket(context(null))).toMatchObject({ success: true, basketId: null, cookie: null });
        expect(createApiClients).not.toHaveBeenCalled();
    });
    it.each([404, 410])('returns a clear only for confirmed absence (%i)', async (status) => {
        read.mockRejectedValue(
            new ApiError({
                status,
                statusText: 'missing',
                headers: new Headers(),
                body: { type: '', title: '', detail: '' },
                rawBody: '{}',
                method: 'GET',
                url: 'https://example.com',
            })
        );
        expect(await refreshBasket(context())).toMatchObject({
            success: true,
            basketId: 'b1',
            basket: null,
            snapshot: null,
        });
        expect(serialize).toHaveBeenCalledWith(null, undefined);
    });
    it.each([400, 401, 403, 429, 500])('retains the basket on an uncertain failure (%i)', async (status) => {
        read.mockRejectedValue(
            new ApiError({
                status,
                statusText: 'failure',
                headers: new Headers(),
                body: { type: '', title: '', detail: '' },
                rawBody: '{}',
                method: 'GET',
                url: 'https://example.com',
            })
        );
        expect(await refreshBasket(context())).toEqual({ success: false });
        expect(serialize).not.toHaveBeenCalled();
    });
});
