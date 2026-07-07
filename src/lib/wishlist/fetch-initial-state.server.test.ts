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
import { NormalizedApiError } from '@/lib/api/normalized-api-error';
import { getAuth } from '@/middlewares/auth.server';
import { getOrCreateWishlist, getWishlist } from '@/lib/api/wishlist.server';
import { fetchWishlistInitialState } from './fetch-initial-state.server';

vi.mock('@/middlewares/auth.server', () => ({ getAuth: vi.fn() }));
vi.mock('@/lib/api/wishlist.server', () => ({ getWishlist: vi.fn(), getOrCreateWishlist: vi.fn() }));

describe('fetchWishlistInitialState', () => {
    const mockContext = {} as never;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns empty state when session has no customerId without calling SCAPI', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'guest',
            customerId: undefined,
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(result).toEqual({ customerId: null, productIds: new Set() });
        expect(getWishlist).not.toHaveBeenCalled();
    });

    test('returns empty state when access token has expired', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            customerId: 'cust-1',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() - 1_000,
        } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(result.customerId).toBeNull();
        expect(getWishlist).not.toHaveBeenCalled();
    });

    test('reads (never creates) the wishlist — does not call getOrCreateWishlist', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'guest',
            customerId: 'guest-cust-1',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);
        vi.mocked(getWishlist).mockResolvedValue({
            wishlist: { id: 'list-guest-1' },
            items: [{ id: 'item-1', productId: 'sku-1' }],
            id: 'list-guest-1',
        } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(getWishlist).toHaveBeenCalledWith(mockContext, 'guest-cust-1');
        expect(getOrCreateWishlist).not.toHaveBeenCalled();
        expect(result.customerId).toBe('guest-cust-1');
        expect(Array.from(result.productIds)).toEqual(['sku-1']);
    });

    test('returns an empty product set when the shopper has no wishlist yet (no create)', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'guest',
            customerId: 'guest-cust-2',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);
        vi.mocked(getWishlist).mockResolvedValue({ wishlist: null, items: [], id: null } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(getOrCreateWishlist).not.toHaveBeenCalled();
        expect(result.customerId).toBe('guest-cust-2');
        expect(result.productIds.size).toBe(0);
    });

    test('returns full state for registered user with wishlist items', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            customerId: 'cust-1',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);
        vi.mocked(getWishlist).mockResolvedValue({
            wishlist: { id: 'list-1' },
            items: [
                { id: 'item-1', productId: 'sku-1' },
                { id: 'item-2', productId: 'sku-2' },
                { id: 'item-3', productId: '' }, // Filtered.
                { id: 'item-4' }, // Missing productId — filtered.
            ],
            id: 'list-1',
        } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(result.customerId).toBe('cust-1');
        expect(Array.from(result.productIds)).toEqual(['sku-1', 'sku-2']);
    });

    test('returns empty items when wishlist exists but has no items', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            customerId: 'cust-1',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);
        vi.mocked(getWishlist).mockResolvedValue({
            wishlist: { id: 'list-1' },
            items: [],
            id: 'list-1',
        } as never);

        const result = await fetchWishlistInitialState(mockContext);

        expect(result.customerId).toBe('cust-1');
        expect(result.productIds.size).toBe(0);
    });

    test('propagates NormalizedApiError when getWishlist rejects', async () => {
        vi.mocked(getAuth).mockReturnValue({
            userType: 'registered',
            customerId: 'cust-1',
            accessToken: 'tok',
            accessTokenExpiry: Date.now() + 60_000,
        } as never);
        const apiErr = new NormalizedApiError(new TypeError('Network failure'));
        vi.mocked(getWishlist).mockRejectedValue(apiErr);

        await expect(fetchWishlistInitialState(mockContext)).rejects.toBe(apiErr);
    });
});
