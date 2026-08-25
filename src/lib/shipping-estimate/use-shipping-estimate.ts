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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { normalizeCountryCode } from './country-code';
import type { ShippingDestination } from './types';

/**
 * Response shape returned by `/resource/shipping-estimate`. Generic over the
 * estimate payload so this hook stays decoupled from the shipping-delivery
 * extension's `ShippingEstimate` type — callers pin `TEstimate` at their use
 * site. Parsed requests echo the `productId` and `zipcode`, so callers can gate
 * rendering on request/response identity (see `matchAgainst`). Malformed and
 * cross-origin failures remain opaque.
 */
export type ShippingEstimateResponse<TEstimate> =
    | { success: true; productId: string; zipcode: string; countryCode: string; estimate: TEstimate }
    | { success: false; empty: true; productId: string; zipcode: string; countryCode: string }
    | {
          success: false;
          empty?: false;
          productId?: string;
          zipcode?: string;
          countryCode?: string;
          fallbackDeliveryDescription?: string;
      };

export interface UseShippingEstimateOptions {
    productId: string;
    /** When set, the hook fetches this ZIP on mount and after a product change. */
    initialDestination?: ShippingDestination | null;
    /** Whether automatic ZIP lookups may run. Explicit `load()` calls are unaffected. */
    enabled?: boolean;
    /**
     * Value the response's echoed `zipcode` must equal for an estimate to surface.
     * Typical use: pass the current controlled input value so editing the field hides stale results.
     * When omitted, the hook matches against the last zipcode passed to `load()` (or the initial destination).
     */
    matchAgainst?: string;
}

export interface UseShippingEstimateResult<TEstimate> {
    isLoading: boolean;
    /** Only non-null when a successful response's zipcode matches the match key. */
    estimate: TEstimate | null;
    /** True when the lookup for the current match key failed without exposing failure details to the client. */
    hasError: boolean;
    /** Merchant-authored delivery description for an unavailable estimate, when configured. */
    fallbackDeliveryDescription: string | null;
    /** Zipcode from the currently matched successful or neutral response. */
    matchedZipcode: string | null;
    /** True while an automatic ZIP lookup awaits a response for the current product. */
    autoFetchInFlight: boolean;
    load: (zipcode: string, countryCode?: string) => void;
}

/**
 * Shared hook for driving `/resource/shipping-estimate`. Encapsulates the
 * `useFetcher` + response-matching pattern for the PDP delivery estimator.
 *
 * Generic over `TEstimate` so callers wire in their own estimate shape without
 * this hook (which lives in `src/lib/`) depending on any specific extension.
 */
export function useShippingEstimate<TEstimate>({
    productId,
    initialDestination,
    enabled = true,
    matchAgainst,
}: UseShippingEstimateOptions): UseShippingEstimateResult<TEstimate> {
    const fetcher = useFetcher<ShippingEstimateResponse<TEstimate>>();
    const fetcherLoad = fetcher.load;
    const [requestedDestination, setRequestedDestination] = useState<ShippingDestination | null>(
        initialDestination ?? null
    );
    const autoFetchProductIdRef = useRef<string | null>(null);

    const fetchEstimate = useCallback(
        (zipcode: string, countryCode: string | undefined, persistDestination: boolean) => {
            const countryQuery = countryCode ? `&countryCode=${encodeURIComponent(countryCode)}` : '';
            const persistenceQuery = persistDestination ? '&persistDestination=true' : '';
            void fetcherLoad(
                `/resource/shipping-estimate?productId=${encodeURIComponent(productId)}&zipcode=${encodeURIComponent(zipcode)}${countryQuery}${persistenceQuery}`
            );
        },
        [fetcherLoad, productId]
    );

    const load = useCallback(
        (zipcode: string, countryCode?: string) => {
            const normalizedCountryCode = normalizeCountryCode(countryCode);
            // Mark this product before an explicit request can allow the automatic effect to run.
            autoFetchProductIdRef.current = productId;
            if (
                requestedDestination?.postalCode === zipcode &&
                requestedDestination.countryCode === normalizedCountryCode
            ) {
                fetchEstimate(zipcode, normalizedCountryCode, true);
                return;
            }
            setRequestedDestination({
                postalCode: zipcode,
                ...(normalizedCountryCode ? { countryCode: normalizedCountryCode } : {}),
            });
            fetchEstimate(zipcode, normalizedCountryCode, true);
        },
        [fetchEstimate, productId, requestedDestination]
    );

    useEffect(() => {
        const destination = requestedDestination ?? initialDestination;
        if (enabled && destination?.postalCode && autoFetchProductIdRef.current !== productId) {
            autoFetchProductIdRef.current = productId;
            fetchEstimate(destination.postalCode, destination.countryCode, false);
        }
    }, [enabled, fetchEstimate, initialDestination, productId, requestedDestination]);

    const matchKey = matchAgainst ?? requestedDestination?.postalCode ?? '';
    const requestCountry = requestedDestination?.countryCode;
    const productMatchesResponse = fetcher.data?.productId === productId;
    const countryMatchesResponse = !requestCountry || fetcher.data?.countryCode === requestCountry;
    const matched =
        productMatchesResponse && countryMatchesResponse && fetcher.data?.success && fetcher.data.zipcode === matchKey
            ? fetcher.data
            : null;
    const neutral =
        productMatchesResponse &&
        countryMatchesResponse &&
        fetcher.data?.success === false &&
        fetcher.data.empty === true &&
        fetcher.data.zipcode === matchKey
            ? fetcher.data
            : null;
    const failed =
        productMatchesResponse &&
        countryMatchesResponse &&
        fetcher.data?.success === false &&
        fetcher.data.empty !== true &&
        fetcher.data.zipcode === matchKey
            ? fetcher.data
            : null;

    return useMemo(
        () => ({
            isLoading: fetcher.state === 'loading',
            estimate: matched?.estimate ?? null,
            hasError: Boolean(failed),
            fallbackDeliveryDescription: failed?.fallbackDeliveryDescription ?? null,
            matchedZipcode: matched?.zipcode ?? neutral?.zipcode ?? null,
            autoFetchInFlight:
                enabled &&
                Boolean(requestedDestination?.postalCode ?? initialDestination?.postalCode) &&
                (fetcher.state !== 'idle' || !(matched || neutral || failed)),
            load,
        }),
        [
            fetcher.state,
            matched,
            neutral,
            failed,
            enabled,
            initialDestination?.postalCode,
            requestedDestination?.postalCode,
            load,
        ]
    );
}
