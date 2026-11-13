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
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

import { useStoreLocatorList, type SearchStoresResult } from './use-store-locator-list';
import { resourceRoutes } from '@/route-paths';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig } from '@/test-utils/config';
import type { StoreChangeResult } from '@/extensions/store-locator/lib/store-selection.server';
import type { ShopperStores } from '@/scapi';

const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/components/toast', () => ({ useToast: () => ({ addToast }) }));

// Mock react-router useFetcher (called twice: once for store search, once for set-selected-store action)
const mockSearchFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: undefined as SearchStoresResult | undefined,
    load: vi.fn(),
    submit: vi.fn(),
};

const mockStoreFetcher = {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    data: undefined as StoreChangeResult | undefined,
    load: vi.fn(),
    submit: vi.fn(),
};

let fetcherCallCount = 0;
vi.mock('react-router', () => ({
    href: (path: string) => path,
    useFetcher: () => {
        fetcherCallCount++;
        // First call is the search fetcher, second is the store action fetcher
        return fetcherCallCount % 2 === 1 ? mockSearchFetcher : mockStoreFetcher;
    },
    createContext: vi.fn(),
}));

// Mock React to avoid createContext issues
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
        createContext: actual.createContext,
    };
});

// Mock store state used by the hook
const mockStore = {
    mode: 'input' as 'input' | 'device',
    searchParams: undefined as { countryCode: string; postalCode: string } | undefined,
    deviceCoordinates: { latitude: undefined as number | undefined, longitude: undefined as number | undefined },
    config: {
        radius: 25,
        radiusUnit: 'mi',
        limit: 50,
        supportedCountries: [{ countryCode: 'US', countryName: 'United States' }],
    },
    selectedStoreInfo: null as { id: string; name: string; inventoryId?: string } | null,
    setSelectedStoreInfo: vi.fn(),
    geoError: false,
    shouldSearch: false,
    setShouldSearch: vi.fn(),
};
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
    useStoreLocator: (selector: any) => selector(mockStore),
}));

describe('useStoreLocatorList', () => {
    beforeEach(() => {
        fetcherCallCount = 0;
        addToast.mockClear();
        mockSearchFetcher.state = 'idle';
        mockSearchFetcher.data = undefined;
        mockSearchFetcher.load.mockClear();
        mockSearchFetcher.submit.mockClear();
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = undefined;
        mockStoreFetcher.load.mockClear();
        mockStoreFetcher.submit.mockClear();
        mockStore.mode = 'input';
        mockStore.searchParams = undefined;
        mockStore.deviceCoordinates = { latitude: undefined, longitude: undefined };
        mockStore.shouldSearch = false;
        mockStore.setShouldSearch.mockClear();
        mockStore.selectedStoreInfo = null;
        mockStore.setSelectedStoreInfo.mockClear();
    });

    test('keeps choices and selection retries usable after a failed selection and a new search', async () => {
        const nativeConfig = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AllProvidersWrapper config={nativeConfig}>{children}</AllProvidersWrapper>
        );
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper });
        await act(async () => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            await Promise.resolve();
        });
        mockStoreFetcher.data = {
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            current: { id: 'A' },
            candidate: { id: 'B' },
        };
        rerender();
        expect(result.current.hasError).toBe(false);
        expect(addToast).toHaveBeenCalledOnce();
        expect(addToast).toHaveBeenCalledWith(expect.stringContaining('current store'), 'error');
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '02139' };
        rerender();
        mockSearchFetcher.data = {
            success: true,
            stores: { data: [{ id: 'B', inventoryId: 'inventory-b' }], limit: 1, total: 1 },
        };
        rerender();
        expect(result.current.stores).toHaveLength(1);
        expect(result.current.hasError).toBe(false);
        expect(addToast).toHaveBeenCalledOnce();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        await act(async () => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            await Promise.resolve();
        });
        expect(mockStoreFetcher.submit).toHaveBeenCalledTimes(2);
        mockStoreFetcher.data = {
            success: true,
            selectedStoreInfo: { id: 'B', inventoryId: 'inventory-b' },
            shoppingContext: null,
        };
        rerender();
        expect(mockStore.setSelectedStoreInfo).toHaveBeenCalledWith(mockStoreFetcher.data.selectedStoreInfo);
        mockSearchFetcher.data = { success: false } as SearchStoresResult;
        rerender();
        expect(result.current.hasError).toBe(true);
    });

    test('does not reapply a prior success when a later submission returns no new data', () => {
        const config = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AllProvidersWrapper config={config}>{children}</AllProvidersWrapper>
        );
        mockStoreFetcher.data = { success: true, selectedStoreInfo: { id: 'A' }, shoppingContext: null };
        const { rerender } = renderHook(() => useStoreLocatorList(), { wrapper });
        expect(mockStore.setSelectedStoreInfo).toHaveBeenCalledOnce();
        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStoreFetcher.state = 'idle';
        rerender();
        expect(mockStore.setSelectedStoreInfo).toHaveBeenCalledOnce();
    });

    test('blocks duplicate native submissions until settlement and exposes pending state', async () => {
        mockStore.selectedStoreInfo = { id: 'A', name: 'Store A', inventoryId: 'inventory-a' };
        const config = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AllProvidersWrapper config={config}>{children}</AllProvidersWrapper>
        );
        let settle!: () => void;
        const submission = new Promise<void>((resolve) => {
            settle = resolve;
        });
        mockStoreFetcher.submit.mockReturnValueOnce(submission);
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper });
        act(() => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            result.current.setSelectedStoreInfo({ id: 'A', inventoryId: 'inventory-a' });
            result.current.setSelectedStoreInfo(null);
        });
        expect(mockStoreFetcher.submit).toHaveBeenCalledOnce();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        mockStoreFetcher.state = 'submitting';
        rerender();
        expect(result.current.isSelecting).toBe(true);
        mockStoreFetcher.state = 'loading';
        rerender();
        expect(result.current.isSelecting).toBe(true);
        await act(async () => {
            settle();
            await submission;
        });
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = {
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            current: null,
            candidate: null,
        };
        rerender();
        expect(result.current.isSelecting).toBe(false);
        expect(result.current.selectedStoreInfo?.id).toBe('A');
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        await act(async () => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            await Promise.resolve();
        });
        expect(mockStoreFetcher.submit).toHaveBeenCalledTimes(2);
    });

    test.each(['rejected', 'synchronous'])('allows native retry after a %s submission failure', async (failure) => {
        const config = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AllProvidersWrapper config={config}>{children}</AllProvidersWrapper>
        );
        if (failure === 'rejected') mockStoreFetcher.submit.mockRejectedValueOnce(new Error('network'));
        else
            mockStoreFetcher.submit.mockImplementationOnce(() => {
                throw new Error('submit');
            });
        const { result } = renderHook(() => useStoreLocatorList(), { wrapper });
        await act(async () => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            await Promise.resolve();
        });
        expect(addToast).toHaveBeenCalledOnce();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        await act(async () => {
            result.current.setSelectedStoreInfo({ id: 'B', inventoryId: 'inventory-b' });
            await Promise.resolve();
        });
        expect(mockStoreFetcher.submit).toHaveBeenCalledTimes(2);
    });

    test('triggers search when shouldSearch and input params present', () => {
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
        renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        expect(mockSearchFetcher.load).toHaveBeenCalled();
        expect(mockStore.setShouldSearch).toHaveBeenCalledWith(false);
    });

    test('triggers search for device mode when coordinates present', () => {
        mockStore.mode = 'device';
        mockStore.shouldSearch = true;
        mockStore.deviceCoordinates = { latitude: 1, longitude: 2 };
        renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        expect(mockSearchFetcher.load).toHaveBeenCalled();
        expect(mockStore.setShouldSearch).toHaveBeenCalledWith(false);
    });

    test('exposes stores from fetcher data and supports pagination', async () => {
        // initial render — no data yet
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        expect(result.current.stores).toEqual([]);

        // provide data from fetcher
        mockSearchFetcher.data = {
            success: true,
            stores: {
                data: new Array(15)
                    .fill(null)
                    .map((_, i) => ({ id: String(i) })) as unknown as ShopperStores.schemas['Store'][],
                limit: 15,
                total: 15,
            },
        };
        rerender();
        expect(result.current.stores.length).toBe(15);
        expect(result.current.storesPaginated.length).toBe(10);

        act(() => {
            result.current.setPage((p) => p + 1);
        });

        await waitFor(() => {
            expect(result.current.storesPaginated.length).toBe(15);
        });
    });

    test('submits to server action when store changes', () => {
        const { result } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        // Initially no submission
        expect(mockStoreFetcher.submit).not.toHaveBeenCalled();

        // Set a store
        act(() => {
            result.current.setSelectedStoreInfo({
                id: 'store1',
                name: 'Store 1',
                inventoryId: 'inv1',
            });
        });

        // Should submit to server action for cookie persistence
        expect(mockStoreFetcher.submit).toHaveBeenCalledTimes(1);
        expect(mockStore.setSelectedStoreInfo).toHaveBeenCalledWith({
            id: 'store1',
            name: 'Store 1',
            inventoryId: 'inv1',
        });

        // Verify the form data and action
        const [formData, options] = mockStoreFetcher.submit.mock.calls[0];
        expect(formData.get('storeInfo')).toBe(JSON.stringify({ id: 'store1', name: 'Store 1', inventoryId: 'inv1' }));
        expect(options).toEqual({ method: 'POST', action: resourceRoutes.setSelectedStore });
    });

    test('submits empty storeInfo when clearing store', () => {
        mockStore.selectedStoreInfo = {
            id: 'store1',
            name: 'Store 1',
            inventoryId: 'inv1',
        };

        const { result } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        // Clear the store
        act(() => {
            result.current.setSelectedStoreInfo(null);
        });

        // Should submit with empty storeInfo to clear cookie
        expect(mockStoreFetcher.submit).toHaveBeenCalledTimes(1);
        const [formData] = mockStoreFetcher.submit.mock.calls[0];
        expect(formData.get('storeInfo')).toBe('');
    });
    test('native selection waits for success and never publishes a failed candidate', () => {
        const nativeConfig = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AllProvidersWrapper config={nativeConfig}>{children}</AllProvidersWrapper>
        );
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper });
        act(() => result.current.setSelectedStoreInfo({ id: 'A', inventoryId: 'inventory-a' }));
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        mockStoreFetcher.data = {
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            current: null,
            candidate: { id: 'A' },
        };
        rerender();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        expect(result.current.hasError).toBe(false);
        expect(addToast).toHaveBeenCalledOnce();
        mockStoreFetcher.data = {
            success: true,
            selectedStoreInfo: { id: 'A', name: 'Validated A', inventoryId: 'inventory-a' },
            shoppingContext: null,
        };
        rerender();
        expect(mockStore.setSelectedStoreInfo).toHaveBeenCalledWith(mockStoreFetcher.data.selectedStoreInfo);
    });
});
