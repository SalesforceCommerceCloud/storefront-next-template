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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LoaderFunctionArgs } from 'react-router';
import { getAuth } from '@/middlewares/auth.server';
import { getOrCreateWishlist, getWishlist } from '@/lib/api/wishlist.server';
import { loader } from './action.wishlist-state';

vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api/wishlist.server', () => ({ getWishlist: vi.fn(), getOrCreateWishlist: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
    })),
}));

describe('/action/wishlist-state loader', () => {
    const mockContext = {} as never;
    const makeArgs = (method = 'GET'): LoaderFunctionArgs =>
        ({
            request: new Request('http://localhost/action/wishlist-state', { method }),
            context: mockContext,
            params: {},
        }) as never;

    /** Unwrap either a plain object return or a `data()`/`Response` return to its JSON payload. */
    const readJson = async (result: unknown): Promise<{ productIds: string[] }> => {
        if (result instanceof Response) return (await result.json()) as { productIds: string[] };
        if (result && typeof result === 'object' && 'data' in result) {
            return (result as { data: { productIds: string[] } }).data;
        }
        return result as { productIds: string[] };
    };

    /** Reads the `Cache-Control` header off either a `Response` or a `data()` return's init. */
    const cacheControl = (result: unknown): string | null | undefined => {
        if (result instanceof Response) return result.headers.get('Cache-Control');
        const headers = (result as { init?: { headers?: Record<string, string> } }).init?.headers;
        return headers?.['Cache-Control'];
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns the session product IDs for a valid session', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-cust-1', userType: 'guest' } as never);
        vi.mocked(getWishlist).mockResolvedValue({
            wishlist: { id: 'list-1' },
            items: [
                { id: 'i1', productId: 'sku-1' },
                { id: 'i2', productId: 'sku-2' },
                { id: 'i3', productId: '' }, // filtered
                { id: 'i4' }, // missing productId — filtered
            ],
            id: 'list-1',
        } as never);

        const result = await loader(makeArgs());
        const json = await readJson(result);

        expect(getWishlist).toHaveBeenCalledWith(mockContext, 'guest-cust-1');
        expect(getOrCreateWishlist).not.toHaveBeenCalled(); // read-only, never provisions
        expect(json.productIds).toEqual(['sku-1', 'sku-2']);
        // Per-shopper body from a shared, query-less URL — must never be cached.
        expect(cacheControl(result)).toBe('no-store');
    });

    test('returns an empty list when the shopper has no wishlist', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-cust-2', userType: 'guest' } as never);
        vi.mocked(getWishlist).mockResolvedValue({ wishlist: null, items: [], id: null } as never);

        const json = await readJson(await loader(makeArgs()));

        expect(getOrCreateWishlist).not.toHaveBeenCalled();
        expect(json.productIds).toEqual([]);
    });

    test('returns an empty list without calling SCAPI when the session has no customerId', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: null, userType: 'guest' } as never);

        const result = await loader(makeArgs());
        const json = await readJson(result);

        expect(getWishlist).not.toHaveBeenCalled();
        expect(json.productIds).toEqual([]);
        expect(cacheControl(result)).toBe('no-store');
    });

    test('rejects non-GET requests with 405', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-cust-1', userType: 'guest' } as never);

        const result = await loader(makeArgs('POST'));

        const status =
            result instanceof Response ? result.status : (result as { init?: { status?: number } }).init?.status;
        expect(status).toBe(405);
        expect(getWishlist).not.toHaveBeenCalled();
        expect(cacheControl(result)).toBe('no-store');
    });

    test('returns an empty list (never throws) when getWishlist rejects', async () => {
        vi.mocked(getAuth).mockReturnValue({ customerId: 'guest-cust-1', userType: 'guest' } as never);
        vi.mocked(getWishlist).mockRejectedValue(new Error('SCAPI down'));

        const result = await loader(makeArgs());
        const json = await readJson(result);

        // Hydration is best-effort; a failed read must not break the browse experience.
        expect(json.productIds).toEqual([]);
        expect(cacheControl(result)).toBe('no-store');
    });
});
