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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { FetcherWithComponents } from 'react-router';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { useChangePickupStore } from './use-change-pickup-store';
import { resourceRoutes } from '@/route-paths';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Mock useFetcher from react-router
const mockSubmit = vi.fn();
const mockFetcher = {
    state: 'idle' as const,
    data: undefined as { success: boolean; basket?: unknown; error?: { code: string; message: string } } | undefined,
    submit: mockSubmit,
    load: vi.fn(),
    Form: vi.fn() as any,
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    formTarget: undefined,
    type: 'init' as const,
    json: undefined,
    text: undefined,
    reset: vi.fn(),
} as unknown as FetcherWithComponents<{
    success: boolean;
    basket?: unknown;
    error?: { code: string; message: string };
}>;

// Mock useToast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: vi.fn(() => ({ addToast: mockAddToast })),
}));

describe('useChangePickupStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcher.state = 'idle';
        mockFetcher.data = undefined;
        mockSubmit.mockResolvedValue(undefined);
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Hook initialization', () => {
        it('returns changeStore function', () => {
            const { result } = renderHook(() => useChangePickupStore());

            expect(result.current).toHaveProperty('changeStore');
            expect(typeof result.current.changeStore).toBe('function');
        });
    });

    describe('changeStore function', () => {
        it('calls fetcher.submit with correct FormData when store has all required fields', async () => {
            const { result } = renderHook(() => useChangePickupStore());

            const store: SelectedStoreInfo = {
                id: 'store-001',
                inventoryId: 'inventory-001',
                name: 'Test Store',
            };

            await act(async () => {
                await result.current.changeStore(store);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData, options] = mockSubmit.mock.calls[0];

            expect(formData).toBeInstanceOf(FormData);
            expect(formData.get('storeId')).toBe('store-001');
            expect(formData.get('inventoryId')).toBe('inventory-001');
            expect(formData.get('storeName')).toBe('Test Store');

            expect(options).toEqual({
                method: 'PATCH',
                action: resourceRoutes.cartPickupStoreUpdate,
            });
        });

        it('calls fetcher.submit with FormData when store name is missing', async () => {
            const { result } = renderHook(() => useChangePickupStore());

            const store: SelectedStoreInfo = {
                id: 'store-001',
                inventoryId: 'inventory-001',
            };

            await act(async () => {
                await result.current.changeStore(store);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);
            const [formData] = mockSubmit.mock.calls[0];

            expect(formData).toBeInstanceOf(FormData);
            expect(formData.get('storeId')).toBe('store-001');
            expect(formData.get('inventoryId')).toBe('inventory-001');
            expect(formData.get('storeName')).toBeNull();
        });

        it('shows error toast when store id is missing', async () => {
            const { result } = renderHook(() => useChangePickupStore());

            const store = {
                inventoryId: 'inventory-001',
                name: 'Test Store',
            } as SelectedStoreInfo;

            await act(async () => {
                await result.current.changeStore(store);
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(
                t('extBopis:cart.pickupStoreInfo.missingStoreIdOrInventoryIdError'),
                'error'
            );
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        it('shows error toast when inventory id is missing', async () => {
            const { result } = renderHook(() => useChangePickupStore());

            const store = {
                id: 'store-001',
                name: 'Test Store',
            } as SelectedStoreInfo;

            await act(async () => {
                await result.current.changeStore(store);
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(
                t('extBopis:cart.pickupStoreInfo.missingStoreIdOrInventoryIdError'),
                'error'
            );
            expect(mockSubmit).not.toHaveBeenCalled();
        });

        it('shows error toast when both id and inventoryId are missing', async () => {
            const { result } = renderHook(() => useChangePickupStore());

            const store = {
                name: 'Test Store',
            } as SelectedStoreInfo;

            await act(async () => {
                await result.current.changeStore(store);
            });

            const { t } = getTranslation();
            expect(mockAddToast).toHaveBeenCalledWith(
                t('extBopis:cart.pickupStoreInfo.missingStoreIdOrInventoryIdError'),
                'error'
            );
            expect(mockSubmit).not.toHaveBeenCalled();
        });
    });

    describe('Toast notifications on response', () => {
        it('shows success toast when fetcher state is loading and data.success is true', async () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            // Simulate loading state with success response
            mockFetcher.state = 'loading';
            mockFetcher.data = { success: true, basket: {} };

            rerender();

            await waitFor(() => {
                const { t } = getTranslation();
                expect(mockAddToast).toHaveBeenCalledWith(t('extBopis:cart.pickupStoreInfo.storeChanged'), 'success');
            });
        });

        it('shows error toast when fetcher state is loading and data.success is false', async () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            // Simulate loading state with error response
            mockFetcher.state = 'loading';
            mockFetcher.data = { success: false };

            rerender();

            await waitFor(() => {
                const { t } = getTranslation();
                expect(mockAddToast).toHaveBeenCalledWith(t('extBopis:cart.pickupStoreInfo.changeStoreError'), 'error');
            });
        });

        it('shows error toast with custom error message when data.error exists', async () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            mockFetcher.state = 'loading';
            mockFetcher.data = { success: false, error: { code: 'OPERATION_FAILED', message: 'Custom error message' } };

            rerender();

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith('Custom error message', 'error');
            });
        });

        it('shows error toast with default message when data.success is false but no error message', async () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            mockFetcher.state = 'loading';
            mockFetcher.data = { success: false };

            rerender();

            await waitFor(() => {
                const { t } = getTranslation();
                expect(mockAddToast).toHaveBeenCalledWith(t('extBopis:cart.pickupStoreInfo.changeStoreError'), 'error');
            });
        });

        it('does not show toast when fetcher state is not loading', () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            mockFetcher.state = 'idle';
            mockFetcher.data = { success: true, basket: {} };

            rerender();

            expect(mockAddToast).not.toHaveBeenCalled();
        });

        it('does not show toast when fetcher data is undefined', () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            mockFetcher.state = 'loading';
            mockFetcher.data = undefined;

            rerender();

            expect(mockAddToast).not.toHaveBeenCalled();
        });

        it('does not show toast when fetcher state is submitting', () => {
            const { rerender } = renderHook(() => useChangePickupStore());

            mockFetcher.state = 'submitting';
            mockFetcher.data = { success: true, basket: {} };

            rerender();

            expect(mockAddToast).not.toHaveBeenCalled();
        });
    });

    describe('Integration scenarios', () => {
        it('handles complete flow: change store -> loading -> success', async () => {
            const { result, rerender } = renderHook(() => useChangePickupStore());

            const store: SelectedStoreInfo = {
                id: 'store-001',
                inventoryId: 'inventory-001',
                name: 'Test Store',
            };

            // Step 1: Call changeStore
            await act(async () => {
                await result.current.changeStore(store);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);

            // Step 2: Simulate loading state with success
            mockFetcher.state = 'loading';
            mockFetcher.data = { success: true, basket: {} };
            rerender();

            await waitFor(() => {
                const { t } = getTranslation();
                expect(mockAddToast).toHaveBeenCalledWith(t('extBopis:cart.pickupStoreInfo.storeChanged'), 'success');
            });
        });

        it('handles complete flow: change store -> loading -> error', async () => {
            const { result, rerender } = renderHook(() => useChangePickupStore());

            const store: SelectedStoreInfo = {
                id: 'store-001',
                inventoryId: 'inventory-001',
                name: 'Test Store',
            };

            // Step 1: Call changeStore
            await act(async () => {
                await result.current.changeStore(store);
            });

            expect(mockSubmit).toHaveBeenCalledTimes(1);

            // Step 2: Simulate loading state with error
            mockFetcher.state = 'loading';
            mockFetcher.data = {
                success: false,
                error: { code: 'OPERATION_FAILED', message: 'Items out of stock at Test Store' },
            };
            rerender();

            await waitFor(() => {
                expect(mockAddToast).toHaveBeenCalledWith('Items out of stock at Test Store', 'error');
            });
        });
    });
});
