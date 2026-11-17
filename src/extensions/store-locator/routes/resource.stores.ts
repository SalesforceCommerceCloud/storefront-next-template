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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { data } from 'react-router';
import type { Route } from './+types/resource.stores';
import type { ShopperStores } from '@/scapi';
import { extractResponseError } from '@/lib/utils';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import type { StoreSearchResult } from '@/extensions/store-locator/stores/store-locator-store';

/**
 * Result of searchStores API
 * @property success - Whether the search was successful
 * @property stores - Result of searchStores API
 * @property error - Error message if the search was not successful
 */
export type SearchStoresResult = StoreSearchResult;

/**
 * Server-side loader to search for stores.
 * Handles store search requests with support for both location-based (device GPS)
 * and address-based (postal code) search modes.
 *
 * @param args - Loader function arguments containing request and context
 * @returns JSON response with store search results or error
 *
 * @example
 * // Location-based search (device mode)
 * GET /resource/stores?mode=device&latitude=37.7749&longitude=-122.4194&maxDistance=50&distanceUnit=km
 *
 * // Address-based search (input mode)
 * GET /resource/stores?mode=input&countryCode=US&postalCode=94102&maxDistance=50&distanceUnit=mi
 */
// Resource route for store search API
export async function loader({
    request,
    context,
}: Route.LoaderArgs): Promise<ReturnType<typeof data<SearchStoresResult>>> {
    const logger = getLogger(context);
    logger.debug('StoreSearch: loader starting');
    try {
        const url = new URL(request.url);
        const mode = url.searchParams.get('mode') ?? 'input';
        const countryCode = url.searchParams.get('countryCode') ?? undefined;
        const postalCode = url.searchParams.get('postalCode') ?? undefined;
        const latitude = url.searchParams.get('latitude');
        const longitude = url.searchParams.get('longitude');
        const maxDistance = url.searchParams.get('maxDistance');
        const distanceUnit = url.searchParams.get('distanceUnit') ?? 'km';
        const limit = url.searchParams.get('limit');

        const clients = createApiClients(context);

        const queryParams: Omit<ShopperStores.operations['searchStores']['parameters']['query'], 'siteId'> =
            mode === 'device'
                ? {
                      latitude: latitude ? Number(latitude) : undefined,
                      longitude: longitude ? Number(longitude) : undefined,
                      maxDistance: maxDistance ? Number(maxDistance) : undefined,
                      distanceUnit: distanceUnit as 'mi' | 'km',
                      limit: limit ? Number(limit) : undefined,
                  }
                : {
                      countryCode,
                      postalCode,
                      maxDistance: maxDistance ? Number(maxDistance) : undefined,
                      distanceUnit: distanceUnit as 'mi' | 'km',
                      limit: limit ? Number(limit) : undefined,
                  };

        const { data: stores } = await clients.shopperStores.searchStores({
            params: {
                query: queryParams,
            },
        });

        return data({
            success: true,
            stores,
        });
    } catch (error) {
        logger.error('StoreSearch: search failed', { error });
        const { responseMessage, status_code } = await extractResponseError(error as Error);
        return data(
            {
                success: false,
                error: responseMessage,
            },
            { status: Number(status_code) }
        );
    }
}
