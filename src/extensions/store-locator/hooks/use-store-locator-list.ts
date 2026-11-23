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
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
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
    const entry = useConfig().features?.storeEntry;
    const { i18n } = useTranslation('extStoreLocator');
    const fulfillmentMode = useStoreLocator((s) => s.fulfillmentMode);
    const locatorConfig = useStoreLocator((s) => s.config);
    const config = useMemo(() => {
        if (!entry?.enabled) return locatorConfig;
        const names = new Intl.DisplayNames([i18n.language], { type: 'region' });
        return {
            ...locatorConfig,
            ...(entry.distanceUnit ? { radiusUnit: entry.distanceUnit } : {}),
            ...(entry.countries
                ? {
                      supportedCountries: entry.countries.map((countryCode) => ({
                          countryCode,
                          countryName: names.of(countryCode) ?? countryCode,
                      })),
                  }
                : {}),
        };
    }, [entry, locatorConfig, i18n.language]);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const { select: setSelectedStoreInfo, retry: retrySelection } = useStoreSelection();
    const selectionPending = useStoreLocator((s) => s.selectionPending);
    const selectionBlocked = useStoreLocator((s) => s.selectionPending || s.selectionError === 'outcome_unknown');
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
    // Own the full intentional request, including the idle frames before dispatch and result publication.
    const [isSearching, setIsSearching] = useState(false);
    const pendingSearchRef = useRef<{
        mode: 'input' | 'device';
        fulfillmentMode: typeof fulfillmentMode;
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
        setIsSearching(false);
        setAcceptedSearch(null);
        lastHandledSearchResultRef.current = fetcher.data;
        setHasSearched(false);
        setPage(1);
    }, [generation, fetcher.data]);

    useEffect(() => {
        if (!shouldSearch || (entry?.enabled && !fulfillmentMode)) return;

        const params = new URLSearchParams();
        params.set('mode', mode);
        if (entry?.enabled && fulfillmentMode) params.set('fulfillmentMode', fulfillmentMode);
        params.set('maxDistance', String(config.radius));
        params.set('distanceUnit', config.radiusUnit);
        params.set('limit', String(config.limit));
        let canFetch = false;

        if (mode === 'input') {
            const hasCountry = Boolean(searchParams?.countryCode);
            const hasPostal = Boolean(searchParams?.postalCode);
            if (hasCountry && hasPostal && searchParams) {
                params.set('countryCode', searchParams.countryCode);
                params.set(searchParams.searchType === 'city' ? 'city' : 'postalCode', searchParams.postalCode);
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
                fulfillmentMode,
                searchParams: searchParams ? { ...searchParams } : null,
            };
            clearStoreLocatorSearchMemory(site.id);
            setHasSearched(true);
            setIsSearching(true);
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
        fulfillmentMode,
        entry?.enabled,
        searchParams?.searchType,
    ]);

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

        setIsSearching(false);

        if (
            entry?.enabled &&
            (pendingSearch.fulfillmentMode !== fulfillmentMode ||
                (fetcher.data.success && fetcher.data.fulfillmentMode !== fulfillmentMode))
        )
            return;
        // Middleware/provider failures may omit the response mode; attribute them to the owning search.
        const accepted = entry?.enabled
            ? { ...fetcher.data, fulfillmentMode: pendingSearch.fulfillmentMode ?? undefined }
            : fetcher.data;
        setSearchResult(accepted);
        setAcceptedSearch({ generation, data: accepted });
        if (fetcher.data.success) {
            setStoreLocatorSearchMemory(site.id, {
                mode: pendingSearch.mode,
                searchParams: pendingSearch.searchParams,
                searchResult: fetcher.data,
            });
        }
    }, [fetcher.data, fetcher.state, setSearchResult, site.id, generation, entry?.enabled, fulfillmentMode]);

    const fallback = acceptedSearch?.generation === generation ? acceptedSearch.data : undefined;
    const result = searchResult ?? fallback;
    const matchingResult = !entry?.enabled || result?.fulfillmentMode === fulfillmentMode ? result : undefined;
    const stores = useMemo(() => matchingResult?.stores?.data ?? [], [matchingResult]);
    const hasError = matchingResult?.success === false;
    const showCount = page * 10;
    const storesPaginated = stores.slice(0, showCount);

    // The store queues a request before the effect/fetcher starts; do not expose an empty result in that frame.
    const hasSearchInput =
        mode === 'input'
            ? Boolean(searchParams?.countryCode && searchParams?.postalCode)
            : typeof deviceCoordinates.latitude === 'number' && typeof deviceCoordinates.longitude === 'number';
    const searchQueued = shouldSearch && hasSearchInput && (!entry?.enabled || Boolean(fulfillmentMode));
    // Background revalidation does not replace already-visible results with a loading skeleton.
    const isLoading = isSearching || searchQueued;

    return {
        // store state
        mode,
        fulfillmentMode,
        searchParams,
        config,
        selectedStoreInfo,
        chooserStoreInfo,
        selectionPending,
        selectionBlocked,
        selectionError,
        retrySelection,
        setSelectedStoreInfo: (info: Parameters<typeof setSelectedStoreInfo>[0]) =>
            setSelectedStoreInfo(
                info && entry?.enabled ? { ...info, fulfillmentMode: fulfillmentMode ?? undefined } : info
            ),
        geoError,
        // fetch state
        hasSearched: hasSearched || searchResult !== null,
        hasError,
        isLoading,
        eligibility: matchingResult?.eligibility,
        searchError: matchingResult?.error,
        retrySearch: () => setShouldSearch(true),
        stores,
        storesPaginated,
        setPage,
    } as const;
}
