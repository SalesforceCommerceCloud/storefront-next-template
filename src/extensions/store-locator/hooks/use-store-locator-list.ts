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
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useFetcher } from 'react-router';
import { resourceRoutes } from '@/route-paths';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
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
    const mode = useStoreLocator((s) => s.mode);
    const searchParams = useStoreLocator((s) => s.searchParams);
    const deviceCoordinates = useStoreLocator((s) => s.deviceCoordinates);
    const config = useStoreLocator((s) => s.config);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const setSelectedStoreInfoRaw = useStoreLocator((s) => s.setSelectedStoreInfo);
    const geoError = useStoreLocator((s) => s.geoError);
    const shouldSearch = useStoreLocator((s) => s.shouldSearch);
    const setShouldSearch = useStoreLocator((s) => s.setShouldSearch);

    const fetcher = useFetcher<typeof searchStoresLoader>();
    const storeFetcher = useFetcher();
    const [page, setPage] = useState<number>(1);
    const [hasSearched, setHasSearched] = useState<boolean>(false);
    // Track intentional search loads to distinguish from revalidation-triggered loads
    const isSearchingRef = useRef(false);

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
    ]);

    // Clear the intentional search flag once the fetcher settles
    if (fetcher.state === 'idle' && isSearchingRef.current) {
        isSearchingRef.current = false;
    }

    const stores = useMemo(() => fetcher.data?.stores?.data ?? [], [fetcher.data]);
    const hasError = useMemo(() => fetcher.data?.success === false, [fetcher.data]);
    const showCount = page * 10;
    const storesPaginated = stores.slice(0, showCount);

    // Only show loading skeleton for intentional searches, not revalidation-triggered reloads
    const isLoading = fetcher.state === 'loading' && isSearchingRef.current;

    // Wrapper function that updates store selection via server action.
    // Optimistically updates client state, then submits to server action which
    // sets the cookie via middleware Set-Cookie. React Router auto-revalidates after action.
    const setSelectedStoreInfo = useCallback(
        (info: SelectedStoreInfo | null) => {
            // Optimistic client state update
            setSelectedStoreInfoRaw(info);

            // Submit to server action for cookie persistence
            const formData = new FormData();
            formData.set('storeInfo', info ? JSON.stringify(info) : '');
            void storeFetcher.submit(formData, { method: 'POST', action: resourceRoutes.setSelectedStore });
        },
        [setSelectedStoreInfoRaw, storeFetcher]
    );

    return {
        // store state
        mode,
        searchParams,
        config,
        selectedStoreInfo,
        setSelectedStoreInfo,
        geoError,
        // fetch state
        hasSearched,
        hasError,
        isLoading,
        stores,
        storesPaginated,
        setPage,
    } as const;
}
