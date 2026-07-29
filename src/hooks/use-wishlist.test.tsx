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

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ShopperSearch } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import { resourceRoutes } from '@/route-paths';
import { useWishlist } from './use-wishlist';

// Mock dependencies
const mockAddToast = vi.fn();
const mockTrackWishlistItemAdded = vi.fn();
const mockTrackWishlistItemRemoved = vi.fn();

const mockAddFetcher = {
    data: null as any,
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    submit: vi.fn(),
};
const mockRemoveFetcher = {
    data: null as any,
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    submit: vi.fn(),
};

let fetcherCallCount = 0;

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        trackWishlistItemAdded: mockTrackWishlistItemAdded,
        trackWishlistItemRemoved: mockTrackWishlistItemRemoved,
    }),
}));

const mockProduct: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: 'product-1',
    productName: 'Test Product',
    price: 99.99,
    currency: 'USD',
};

const mockVariant: ShopperSearch.schemas['ProductSearchHit'] = {
    productId: 'variant-1',
    productName: 'Test Variant',
    price: 99.99,
    currency: 'USD',
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: children,
            },
        ],
        {
            initialEntries: ['/'],
        }
    );

    return <RouterProvider router={router} />;
};

/**
 * Helper that configures mockAddFetcher.submit to synchronously set a response payload.
 *
 * Because useWishlist handles fetcher responses via useEffect (not via await-after-submit),
 * the data must be present on mockAddFetcher.data before the re-render caused by the
 * optimistic setWishlistItems call. Making the mock set data synchronously achieves this:
 *   1. submit() is called → mock sets mockAddFetcher.data
 *   2. setWishlistItems() triggers a re-render
 *   3. useEffect sees the new addFetcher.data value and fires
 */
const setAddFetcherResponse = (response: {
    success: boolean;
    error?: { code: string; message: string };
    alreadyInWishlist?: boolean;
}) => {
    mockAddFetcher.submit.mockImplementation(() => {
        mockAddFetcher.data = response;
    });
};

const setRemoveFetcherResponse = (response: { success: boolean; error?: { code: string; message: string } }) => {
    mockRemoveFetcher.submit.mockImplementation(() => {
        mockRemoveFetcher.data = response;
    });
};

describe('useWishlist', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetcherCallCount = 0;
        mockAddFetcher.data = null;
        mockAddFetcher.state = 'idle';
        mockRemoveFetcher.data = null;
        mockRemoveFetcher.state = 'idle';
        // Use vi.spyOn to mock useFetcher while keeping real router exports.
        // We use spyOn instead of vi.mock because the hook is already imported,
        // and this allows us to control fetcher behavior per-test.
        vi.spyOn(ReactRouter, 'useFetcher').mockImplementation(() => {
            fetcherCallCount++;
            // useWishlist calls useFetcher twice per render: once for addFetcher, once for removeFetcher.
            // We use modulo (% 2) instead of checking specific call counts (e.g., === 1) because:
            // 1. React may re-render the component multiple times (due to state updates, effects, etc.)
            // 2. Each re-render calls useFetcher twice again, so call counts grow: 1,2 -> 3,4 -> 5,6...
            // 3. Modulo ensures odd calls (1st, 3rd, 5th...) always return addFetcher
            //    and even calls (2nd, 4th, 6th...) always return removeFetcher
            // This makes the mock resilient to React's rendering behavior.
            if (fetcherCallCount % 2 === 1) return mockAddFetcher as any;
            return mockRemoveFetcher as any;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should initialize with empty wishlist', () => {
        const { result } = renderHook(() => useWishlist(), { wrapper });

        expect(result.current.wishlist).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });

    test('should check if item is in wishlist', () => {
        const { result } = renderHook(() => useWishlist(), { wrapper });

        expect(result.current.isItemInWishlist(mockProduct)).toBe(false);
    });

    test('should check if variant is in wishlist', () => {
        const { result } = renderHook(() => useWishlist(), { wrapper });

        expect(result.current.isItemInWishlist(mockProduct, mockVariant)).toBe(false);
    });

    test('should add item to wishlist optimistically', () => {
        setAddFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        expect(result.current.isItemInWishlist(mockProduct)).toBe(true);
        expect(mockAddFetcher.submit).toHaveBeenCalledWith(
            { productId: 'product-1' },
            {
                method: 'POST',
                action: resourceRoutes.wishlistAdd,
            }
        );
    });

    test('should remove item from wishlist optimistically', () => {
        setAddFetcherResponse({ success: true });
        setRemoveFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        // First add the item
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        expect(result.current.isItemInWishlist(mockProduct)).toBe(true);

        // Then remove it
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        expect(result.current.isItemInWishlist(mockProduct)).toBe(false);
        expect(mockRemoveFetcher.submit).toHaveBeenCalledWith(
            { productId: 'product-1' },
            {
                method: 'POST',
                action: resourceRoutes.wishlistRemove,
            }
        );
    });

    test('should show success toast on successful add', async () => {
        setAddFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(
                t('product:addedToWishlist', { productName: 'Test Product' }),
                'success'
            );
        });
    });

    test('should show success toast on successful remove', async () => {
        setAddFetcherResponse({ success: true });
        setRemoveFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        // First add the item
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        // Then remove it
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(t('product:removedFromWishlist'), 'success');
        });
    });

    test('should show info toast when product is already in wishlist', async () => {
        setAddFetcherResponse({ success: true, alreadyInWishlist: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(
                t('product:alreadyInWishlist', { productName: 'Test Product' }),
                'info'
            );
        });
    });

    test('should keep optimistic state when product is already in wishlist', async () => {
        // alreadyInWishlist = true means the item IS in the wishlist — optimistic state should be kept
        setAddFetcherResponse({ success: true, alreadyInWishlist: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            expect(result.current.isItemInWishlist(mockProduct)).toBe(true);
        });
    });

    test('should revert optimistic update on add error', async () => {
        setAddFetcherResponse({ success: false, error: { code: 'OPERATION_FAILED', message: 'Failed to add' } });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            expect(result.current.isItemInWishlist(mockProduct)).toBe(false);
            expect(mockAddToast).toHaveBeenCalledWith('Failed to add item to wishlist.', 'error');
        });
    });

    test('should revert optimistic update on remove error', async () => {
        setAddFetcherResponse({ success: true });
        setRemoveFetcherResponse({ success: false, error: { code: 'OPERATION_FAILED', message: 'Failed to remove' } });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        // Add item first
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        expect(result.current.isItemInWishlist(mockProduct)).toBe(true);

        // Attempt remove — server returns error
        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        await waitFor(() => {
            // Reverted back to in-wishlist after server error
            expect(result.current.isItemInWishlist(mockProduct)).toBe(true);
            expect(mockAddToast).toHaveBeenCalledWith('Failed to remove item from wishlist.', 'error');
        });
    });

    test('should handle missing productId gracefully', () => {
        const invalidProduct = {
            productId: undefined,
            productName: 'Invalid Product',
        } as unknown as ShopperSearch.schemas['ProductSearchHit'];

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(invalidProduct);
        });

        expect(mockAddFetcher.submit).not.toHaveBeenCalled();
        expect(mockRemoveFetcher.submit).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith(t('product:failedToAddToWishlist'), 'error');
    });

    test('should use variant productId when provided', () => {
        setAddFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct, mockVariant);
        });

        expect(mockAddFetcher.submit).toHaveBeenCalledWith(
            { productId: 'variant-1' },
            {
                method: 'POST',
                action: resourceRoutes.wishlistAdd,
            }
        );
    });

    test('should indicate loading state when fetcher is not idle', () => {
        mockAddFetcher.state = 'submitting';

        const { result } = renderHook(() => useWishlist(), { wrapper });

        expect(result.current.isLoading).toBe(true);
    });

    test('should return wishlist as array', () => {
        setAddFetcherResponse({ success: true });

        const { result } = renderHook(() => useWishlist(), { wrapper });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        expect(Array.isArray(result.current.wishlist)).toBe(true);
        expect(result.current.wishlist).toContain('product-1');
    });

    test('should use correct product data for sequential add operations', async () => {
        // This test validates two things together:
        //   1. pendingAddRef is cleared after a completed operation
        //   2. hasHandledAddRef resets when addFetcher.state passes through 'submitting'
        // Without both, the second operation could show the first product's name in the toast.

        const anotherProduct: ShopperSearch.schemas['ProductSearchHit'] = {
            productId: 'product-2',
            productName: 'Another Product',
            price: 49.99,
            currency: 'USD',
        };

        const { result, rerender } = renderHook(() => useWishlist(), { wrapper });

        // First add: simulate the submitting → idle state cycle so hasHandledAddRef resets correctly
        mockAddFetcher.submit.mockImplementation(() => {
            mockAddFetcher.state = 'submitting';
            mockAddFetcher.data = null;
        });

        act(() => {
            result.current.toggleWishlist(mockProduct);
        });

        // Simulate server response completing for the first operation
        act(() => {
            mockAddFetcher.state = 'idle';
            mockAddFetcher.data = { success: true };
            rerender();
        });

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(
                t('product:addedToWishlist', { productName: 'Test Product' }),
                'success'
            );
        });

        mockAddToast.mockClear();

        // Second add for a different product
        mockAddFetcher.submit.mockImplementation(() => {
            mockAddFetcher.state = 'submitting';
            mockAddFetcher.data = null;
        });

        act(() => {
            result.current.toggleWishlist(anotherProduct);
        });

        // Simulate server response completing for the second operation
        act(() => {
            mockAddFetcher.state = 'idle';
            mockAddFetcher.data = { success: true };
            rerender();
        });

        await waitFor(() => {
            // Must use the second product's name — pendingRef was cleared after the first
            // operation and then correctly set to anotherProduct before the second submit
            expect(mockAddToast).toHaveBeenCalledWith(
                t('product:addedToWishlist', { productName: 'Another Product' }),
                'success'
            );
            expect(mockAddToast).not.toHaveBeenCalledWith(
                t('product:addedToWishlist', { productName: 'Test Product' }),
                'success'
            );
        });
    });

    test('should not fire effect before any submit (pendingRef is null)', () => {
        // If data is somehow set on the fetcher before any toggleWishlist call,
        // the effect should not process it (pendingRef guards it).
        mockAddFetcher.data = { success: true };

        const { result } = renderHook(() => useWishlist(), { wrapper });

        // No toggleWishlist called — no pending ref set. The empty act flushes any
        // microtasks from the renderHook so we can assert nothing else fires.
        act(() => {});

        expect(result.current.isItemInWishlist(mockProduct)).toBe(false);
        expect(mockAddToast).not.toHaveBeenCalled();
    });
});
