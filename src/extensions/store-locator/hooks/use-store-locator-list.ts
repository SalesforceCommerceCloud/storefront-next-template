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
import { useToast } from '@/components/toast';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';
import type { action as selectStoreAction } from '@/extensions/store-locator/routes/action.set-selected-store';
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
    const storeFetcher = useFetcher<typeof selectStoreAction>();
    const nativeEnabled = isNativeStoreSelectionEnabled(useConfig().features.shopperContext);
    const selectionPending = useRef(false);
    const isSelecting = nativeEnabled && storeFetcher.state !== 'idle';
    const { addToast } = useToast();
    const { t } = useTranslation('extStoreLocator');
    const lastSelectionError = useRef<unknown>(null);
    const lastSelectionSuccess = useRef<unknown>(null);
    useEffect(() => {
        if (!nativeEnabled || storeFetcher.state !== 'idle' || storeFetcher.data?.success !== false) return;
        if (lastSelectionError.current === storeFetcher.data) return;
        lastSelectionError.current = storeFetcher.data;
        addToast(
            t(
                storeFetcher.data.code === 'STORE_CHANGE_CONFIRMATION_REQUIRED'
                    ? 'storeLocator.list.storeChangeUnavailable'
                    : 'storeLocator.list.fetchError'
            ),
            'error'
        );
    }, [nativeEnabled, storeFetcher.state, storeFetcher.data, addToast, t]);
    useEffect(() => {
        if (
            nativeEnabled &&
            storeFetcher.state === 'idle' &&
            storeFetcher.data?.success &&
            'selectedStoreInfo' in storeFetcher.data &&
            lastSelectionSuccess.current !== storeFetcher.data
        ) {
            lastSelectionSuccess.current = storeFetcher.data;
            setSelectedStoreInfoRaw(storeFetcher.data.selectedStoreInfo);
        }
    }, [nativeEnabled, storeFetcher.state, storeFetcher.data, setSelectedStoreInfoRaw]);
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
    // Selection failures are nonblocking toast feedback; search results remain retryable.
    const hasError = fetcher.data?.success === false;
    const showCount = page * 10;
    const storesPaginated = stores.slice(0, showCount);

    // Only show loading skeleton for intentional searches, not revalidation-triggered reloads
    const isLoading = fetcher.state === 'loading' && isSearchingRef.current;

    // Wrapper function that updates store selection via server action.
    // Native selection publishes only after success; legacy selection stays optimistic.
    // Middleware persists the cookie and React Router revalidates after the action.
    const setSelectedStoreInfo = useCallback(
        (info: SelectedStoreInfo | null) => {
            if (nativeEnabled && (selectionPending.current || storeFetcher.state !== 'idle')) return;
            // Optimistic client state update
            if (!nativeEnabled) setSelectedStoreInfoRaw(info);

            // Submit to server action for cookie persistence
            const formData = new FormData();
            formData.set('storeInfo', info ? JSON.stringify(info) : '');
            if (!nativeEnabled) {
                void storeFetcher.submit(formData, { method: 'POST', action: resourceRoutes.setSelectedStore });
                return;
            }
            selectionPending.current = true;
            void (async () => {
                try {
                    await storeFetcher.submit(formData, { method: 'POST', action: resourceRoutes.setSelectedStore });
                } catch {
                    addToast(t('storeLocator.list.fetchError'), 'error');
                } finally {
                    selectionPending.current = false;
                }
            })();
        },
        [nativeEnabled, setSelectedStoreInfoRaw, storeFetcher, addToast, t]
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
        isSelecting,
        selectionResult: storeFetcher.data,
        stores,
        storesPaginated,
        setPage,
    } as const;
}
