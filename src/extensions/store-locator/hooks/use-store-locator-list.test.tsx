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
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import type { ShopperStores } from '@/scapi';
import { getStoreLocatorSearchMemoryKey } from '@/extensions/store-locator/stores/store-locator-search-memory';

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
    data: undefined as { success?: boolean } | undefined,
    load: vi.fn(),
    submit: vi.fn(),
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    useFormAction: () => '.',
    useFetcher: () => {
        return mockSearchFetcher;
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
    generation: 0,
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
    close: vi.fn(),
    geoError: false,
    shouldSearch: false,
    setShouldSearch: vi.fn(),
    searchResult: null as SearchStoresResult | null,
    setSearchResult: vi.fn(),
};
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    StoreLocatorStateProvider: ({ children }: { children: React.ReactNode }) => children,
    default: ({ children }: { children: React.ReactNode }) => children,
    useStoreLocator: (selector: any) => selector(mockStore),
}));
const mockSelect = vi.fn();
vi.mock('@/extensions/store-locator/providers/selection', () => ({
    useStoreSelection: () => ({ select: mockSelect, retry: vi.fn() }),
}));

describe('useStoreLocatorList', () => {
    beforeEach(() => {
        mockSelect.mockClear();
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
        mockStore.setSearchResult.mockClear();
        mockStore.setSelectedStoreInfo.mockClear();
        mockStore.close.mockClear();
        mockStore.selectedStoreInfo = null;
        mockStore.searchResult = null;
        mockStore.generation = 0;
    });

    test('triggers search when shouldSearch and input params present', () => {
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
        renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        expect(mockSearchFetcher.load).toHaveBeenCalled();
        expect(mockStore.setShouldSearch).toHaveBeenCalledWith(false);
        expect(sessionStorage.getItem(getStoreLocatorSearchMemoryKey('RefArchGlobal'))).toBeNull();
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
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
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

    test('reuses cached search results after the sheet remounts', () => {
        mockStore.searchResult = {
            success: true,
            stores: { data: [{ id: 'store1' }] } as ShopperStores.schemas['StoreResult'],
        };

        const { result } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        expect(result.current.hasSearched).toBe(true);
        expect(result.current.stores).toEqual([{ id: 'store1' }]);
        expect(mockSearchFetcher.load).not.toHaveBeenCalled();
    });

    test('stores completed searches for the next sheet open', async () => {
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
        const { rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        const searchResult: SearchStoresResult = {
            success: true,
            stores: { data: [{ id: 'store1' }] } as ShopperStores.schemas['StoreResult'],
        };

        mockSearchFetcher.data = searchResult;
        rerender();

        await waitFor(() => expect(mockStore.setSearchResult).toHaveBeenCalledWith(searchResult));
        expect(sessionStorage.getItem(getStoreLocatorSearchMemoryKey('RefArchGlobal'))).toBe(
            JSON.stringify({
                mode: 'input',
                searchParams: { countryCode: 'US', postalCode: '94105' },
                searchResult,
            })
        );
    });

    test('does not persist stale results while a newer search is loading', () => {
        const initialSearchResult: SearchStoresResult = {
            success: true,
            stores: { data: [{ id: 'store-1' }] } as ShopperStores.schemas['StoreResult'],
        };
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
        const { rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        mockSearchFetcher.state = 'loading';
        mockSearchFetcher.data = initialSearchResult;
        mockStore.searchParams = { countryCode: 'US', postalCode: '10001' };
        rerender();

        expect(mockStore.setSearchResult).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(getStoreLocatorSearchMemoryKey('RefArchGlobal'))).toBeNull();
    });

    test('delegates persistence to the mounted coordinator without optimistic selection', () => {
        const { result } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        // Initially no submission
        expect(mockStoreFetcher.submit).not.toHaveBeenCalled();

        // Set a store
        act(() => {
            result.current.setSelectedStoreInfo({
                id: 'store1',
                name: 'Store 1',
                inventoryId: 'inv1',
                postalCode: '94105',
            });
        });

        // Should submit to server action for cookie persistence
        expect(mockSelect).toHaveBeenCalledTimes(1);
        expect(mockSelect).toHaveBeenCalledWith({
            id: 'store1',
            name: 'Store 1',
            inventoryId: 'inv1',
            postalCode: '94105',
        });

        // Verify the form data and action
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        expect(mockStoreFetcher.submit).not.toHaveBeenCalled();
    });

    test('delegates explicit clear to the coordinator', () => {
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
        expect(mockSelect).toHaveBeenCalledWith(null);
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
    });

    test('restores the previous selection when persistence fails', () => {
        const previousStore = {
            id: 'store1',
            name: 'Store 1',
            inventoryId: 'inv1',
        };
        mockStore.selectedStoreInfo = previousStore;
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        act(() => {
            result.current.setSelectedStoreInfo({ id: 'store2', name: 'Store 2' });
        });
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();

        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = { success: false };
        rerender();

        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        expect(result.current.selectedStoreInfo).toEqual(previousStore);
    });

    test('restores the previous selection when the action settles without a result', () => {
        const previousStore = {
            id: 'store1',
            name: 'Store 1',
            inventoryId: 'inv1',
        };
        mockStore.selectedStoreInfo = previousStore;
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        act(() => {
            result.current.setSelectedStoreInfo({ id: 'store2', name: 'Store 2' });
        });

        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStoreFetcher.state = 'idle';
        rerender();

        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        expect(result.current.selectedStoreInfo).toEqual(previousStore);
    });

    test('leaves completion and closure to the coordinator', () => {
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        act(() => {
            result.current.setSelectedStoreInfo({ id: 'store1', name: 'Store 1' });
        });

        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = { success: true };
        rerender();

        expect(mockStore.close).not.toHaveBeenCalled();
    });

    test('does not close the sheet after clearing the selected store', () => {
        mockStore.selectedStoreInfo = { id: 'store1', name: 'Store 1' };
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });

        act(() => {
            result.current.setSelectedStoreInfo(null);
        });

        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = { success: true };
        rerender();

        expect(mockStore.close).not.toHaveBeenCalled();
    });

    test('discards an old identity mutation rollback', () => {
        mockStore.selectedStoreInfo = { id: 'guest-store', name: 'Guest' };
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        act(() => result.current.setSelectedStoreInfo({ id: 'pending', name: 'Pending' }));
        mockStoreFetcher.state = 'submitting';
        rerender();
        mockStore.generation++;
        mockStore.selectedStoreInfo = { id: 'profile', name: 'Profile' };
        rerender();
        mockStore.setSelectedStoreInfo.mockClear();
        mockStoreFetcher.state = 'idle';
        mockStoreFetcher.data = { success: false };
        rerender();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
        expect(result.current.selectedStoreInfo?.id).toBe('profile');
    });

    test('discards old identity search completion and fetcher fallback', () => {
        mockStore.shouldSearch = true;
        mockStore.searchParams = { countryCode: 'US', postalCode: '94105' };
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        mockStore.shouldSearch = false;
        mockSearchFetcher.state = 'loading';
        rerender();
        mockStore.generation++;
        rerender();
        mockSearchFetcher.state = 'idle';
        mockSearchFetcher.data = {
            success: true,
            stores: { data: [{ id: 'old' }] } as ShopperStores.schemas['StoreResult'],
        };
        rerender();
        expect(mockStore.setSearchResult).not.toHaveBeenCalled();
        expect(result.current.stores).toEqual([]);
        expect(result.current.hasSearched).toBe(false);
    });

    test('ignores old fetcher data when remounted after an identity change', () => {
        mockStore.generation = 1;
        mockSearchFetcher.data = {
            success: true,
            stores: { data: [{ id: 'old' }] } as ShopperStores.schemas['StoreResult'],
        };
        const { result } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        expect(result.current.stores).toEqual([]);
    });

    test('does not submit through a callback captured by the previous identity', () => {
        const { result, rerender } = renderHook(() => useStoreLocatorList(), { wrapper: AllProvidersWrapper });
        const staleCallback = result.current.setSelectedStoreInfo;
        mockStore.generation++;
        rerender();
        act(() => staleCallback({ id: 'old', name: 'Old' }));
        expect(mockStoreFetcher.submit).not.toHaveBeenCalled();
        expect(mockStore.setSelectedStoreInfo).not.toHaveBeenCalled();
    });
});
