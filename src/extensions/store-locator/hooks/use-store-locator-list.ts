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
import { useEffect, useMemo, useState, useRef } from 'react';
import { useFetcher } from 'react-router';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { resourceRoutes } from '@/route-paths';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useStoreSelection } from '@/extensions/store-locator/providers/selection';
import {
    clearStoreLocatorSearchMemory,
    setStoreLocatorSearchMemory,
} from '@/extensions/store-locator/stores/store-locator-search-memory';
import type {
    loader as searchStoresLoader,
    SearchStoresResult,
} from '@/extensions/store-locator/routes/resource.stores';

export type { SearchStoresResult };

/**
 * Hook to fetch and manage store locator list.
 * Triggers searchStores API when shouldSearch is true.
 *
 * @returns Read-only view of state and actions, including pagination helper
 *
 * @example
 * const { storesPaginated, setPage } = useStoreLocatorList();
 * // render list and call setPage((p)=>p+1) for Load More
 */
export function useStoreLocatorList() {
    const { site } = useSite();
    const generation = useStoreLocator((s) => s.generation);
    const mode = useStoreLocator((s) => s.mode);
    const searchParams = useStoreLocator((s) => s.searchParams);
    const deviceCoordinates = useStoreLocator((s) => s.deviceCoordinates);
    const config = useStoreLocator((s) => s.config);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const { select: setSelectedStoreInfo, retry: retrySelection } = useStoreSelection();
    const selectionPending = useStoreLocator((s) => s.selectionPending);
    const selectionError = useStoreLocator((s) => s.selectionError);
    const chooserStoreInfo = useStoreLocator((s) => (s.isOpen ? s.chooserStoreInfo : s.selectedStoreInfo));
    const geoError = useStoreLocator((s) => s.geoError);
    const shouldSearch = useStoreLocator((s) => s.shouldSearch);
    const setShouldSearch = useStoreLocator((s) => s.setShouldSearch);
    const searchResult = useStoreLocator((s) => s.searchResult);
    const setSearchResult = useStoreLocator((s) => s.setSearchResult);

    const fetcher = useFetcher<typeof searchStoresLoader>();
    const [page, setPage] = useState<number>(1);
    const [hasSearched, setHasSearched] = useState<boolean>(false);
    // Track intentional search loads to distinguish from revalidation-triggered loads
    const isSearchingRef = useRef(false);
    const pendingSearchRef = useRef<{
        mode: 'input' | 'device';
        searchParams: typeof searchParams;
    } | null>(null);
    const lastHandledSearchResultRef = useRef<unknown>(undefined);
    const generationRef = useRef(generation);
    const [acceptedSearch, setAcceptedSearch] = useState<{ generation: number; data: typeof fetcher.data } | null>(
        null
    );

    useEffect(() => {
        if (generationRef.current === generation) return;
        generationRef.current = generation;
        pendingSearchRef.current = null;
        isSearchingRef.current = false;
        setAcceptedSearch(null);
        lastHandledSearchResultRef.current = fetcher.data;
        setHasSearched(false);
        setPage(1);
    }, [generation, fetcher.data]);

    useEffect(() => {
        if (!shouldSearch) return;

        const params = new URLSearchParams();
        params.set('mode', mode);
        params.set('maxDistance', String(config.radius));
        params.set('distanceUnit', config.radiusUnit);
        params.set('limit', String(config.limit));
        let canFetch = false;

        if (mode === 'input') {
            const hasCountry = Boolean(searchParams?.countryCode);
            const hasPostal = Boolean(searchParams?.postalCode);
            if (hasCountry && hasPostal && searchParams) {
                params.set('countryCode', searchParams.countryCode);
                params.set('postalCode', searchParams.postalCode);
                canFetch = true;
            }
        } else if (mode === 'device') {
            const hasLat = typeof deviceCoordinates.latitude === 'number';
            const hasLng = typeof deviceCoordinates.longitude === 'number';
            if (hasLat && hasLng) {
                params.set('latitude', String(deviceCoordinates.latitude));
                params.set('longitude', String(deviceCoordinates.longitude));
                canFetch = true;
            }
        }

        if (canFetch) {
            pendingSearchRef.current = {
                mode,
                searchParams: searchParams ? { ...searchParams } : null,
            };
            clearStoreLocatorSearchMemory(site.id);
            setHasSearched(true);
            isSearchingRef.current = true;
            void fetcher.load(`${resourceRoutes.stores}?${params.toString()}`);
            setShouldSearch(false);
        }
        setPage(1);
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [
        shouldSearch,
        mode,
        searchParams?.countryCode,
        searchParams?.postalCode,
        deviceCoordinates.latitude,
        deviceCoordinates.longitude,
        site.id,
    ]);

    // Clear the intentional search flag once the fetcher settles
    if (fetcher.state === 'idle' && isSearchingRef.current) {
        isSearchingRef.current = false;
    }

    useEffect(() => {
        if (fetcher.state !== 'idle' || !fetcher.data || fetcher.data === lastHandledSearchResultRef.current) {
            return;
        }

        lastHandledSearchResultRef.current = fetcher.data;
        const pendingSearch = pendingSearchRef.current;
        pendingSearchRef.current = null;
        if (!pendingSearch) {
            return;
        }

        setSearchResult(fetcher.data);
        setAcceptedSearch({ generation, data: fetcher.data });
        if (fetcher.data.success) {
            setStoreLocatorSearchMemory(site.id, {
                mode: pendingSearch.mode,
                searchParams: pendingSearch.searchParams,
                searchResult: fetcher.data,
            });
        }
    }, [fetcher.data, fetcher.state, setSearchResult, site.id, generation]);

    const fallback = acceptedSearch?.generation === generation ? acceptedSearch.data : undefined;
    const stores = useMemo(() => searchResult?.stores?.data ?? fallback?.stores?.data ?? [], [searchResult, fallback]);
    const hasError = searchResult?.success === false || fallback?.success === false;
    const showCount = page * 10;
    const storesPaginated = stores.slice(0, showCount);

    // Only show loading skeleton for intentional searches, not revalidation-triggered reloads
    const isLoading = fetcher.state === 'loading' && isSearchingRef.current;

    return {
        // store state
        mode,
        searchParams,
        config,
        selectedStoreInfo,
        chooserStoreInfo,
        selectionPending,
        selectionError,
        retrySelection,
        setSelectedStoreInfo,
        geoError,
        // fetch state
        hasSearched: hasSearched || searchResult !== null,
        hasError,
        isLoading,
        stores,
        storesPaginated,
        setPage,
    } as const;
}
