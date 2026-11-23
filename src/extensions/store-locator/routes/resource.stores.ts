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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import type { Route } from './+types/resource.stores';
import type { ShopperStores } from '@/scapi';
import { createApiClients } from '@/lib/api-clients.server';
import { getLogger } from '@/lib/logger.server';
import type { StoreSearchResult } from '@/extensions/store-locator/stores/store-locator-store';
import { isFulfillmentMode } from '@/extensions/store-locator/lib/store-entry';
import { searchStoresByCity } from '@/extensions/store-locator/lib/store-entry-services.server';
import { StoreSelectionError } from '@/extensions/store-locator/lib/store-selection-error';

export type SearchStoresResult = StoreSearchResult;

/** Read-only postcode/city/coordinate discovery. Provider failures never become no results. */
export async function loader({
    request,
    context,
}: Route.LoaderArgs): Promise<ReturnType<typeof data<SearchStoresResult>>> {
    const respond = (result: SearchStoresResult, status = 200) =>
        data(result, { status, headers: { 'Cache-Control': 'private, no-store' } });
    try {
        const params = new URL(request.url).searchParams;
        const mode = params.get('mode') ?? 'input';
        const countryCode = params.get('countryCode')?.trim();
        const postalCode = params.get('postalCode')?.trim();
        const city = params.get('city')?.trim();
        const distanceUnit = params.get('distanceUnit') ?? 'km';
        const maxDistance = Number(params.get('maxDistance') ?? 100);
        const limit = Number(params.get('limit') ?? 200);
        const latitude = params.has('latitude') ? Number(params.get('latitude')) : undefined;
        const longitude = params.has('longitude') ? Number(params.get('longitude')) : undefined;
        const entry = getConfig(context).features.storeEntry;
        const fulfillmentMode = params.get('fulfillmentMode');
        if (
            !['input', 'device'].includes(mode) ||
            !['mi', 'km'].includes(distanceUnit) ||
            !Number.isFinite(maxDistance) ||
            maxDistance <= 0 ||
            maxDistance > 1000 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 200 ||
            (mode === 'input' &&
                (!countryCode || !/^[A-Z]{2}$/.test(countryCode) || (!postalCode && !city) || (postalCode && city))) ||
            (postalCode && postalCode.length > 40) ||
            (city && city.length > 100) ||
            (mode === 'device' && (city || postalCode)) ||
            (mode === 'device' &&
                (!params.get('latitude')?.trim() ||
                    !params.get('longitude')?.trim() ||
                    latitude === undefined ||
                    longitude === undefined ||
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude) ||
                    Math.abs(latitude) > 90 ||
                    Math.abs(longitude) > 180)) ||
            (entry?.enabled &&
                (!isFulfillmentMode(fulfillmentMode) || !entry.fulfillmentModes.includes(fulfillmentMode)))
        )
            return respond({ success: false, error: 'INVALID_STORE_SEARCH' }, 400);

        let stores: ShopperStores.schemas['StoreResult'];
        if (city) {
            if (!entry?.enabled || !entry.citySearchEnabled)
                return respond({ success: false, error: 'CITY_SEARCH_DISABLED' }, 400);
            stores = await searchStoresByCity(context, {
                countryCode: countryCode ?? '',
                city,
                maxDistance,
                distanceUnit: distanceUnit as 'mi' | 'km',
                limit,
            });
            if (!stores || !Array.isArray(stores.data) || stores.data.length > limit) {
                throw new StoreSelectionError('CITY_LOOKUP_UNAVAILABLE', 503);
            }
        } else {
            const query: Omit<ShopperStores.operations['searchStores']['parameters']['query'], 'siteId'> = {
                ...(mode === 'device' ? { latitude, longitude } : { countryCode, postalCode }),
                maxDistance,
                distanceUnit: distanceUnit as 'mi' | 'km',
                limit,
            };
            ({ data: stores } = await createApiClients(context).shopperStores.searchStores({ params: { query } }));
        }
        if (!entry?.enabled) return respond({ success: true, stores });
        const candidates = stores.data ?? [];
        const eligibility: NonNullable<SearchStoresResult['eligibility']> = {};
        // Match BOPIS: discovered stores with inventory mappings support the configured modes.
        // Product/quantity availability is validated by the existing stock and basket paths.
        for (const store of candidates) {
            eligibility[store.id] = {
                eligible: Boolean(store.inventoryId) && isFulfillmentMode(fulfillmentMode),
            };
        }
        return respond({ success: true, stores, eligibility, fulfillmentMode: fulfillmentMode ?? undefined });
    } catch (error) {
        const code = error instanceof StoreSelectionError ? error.code : 'STORE_SEARCH_UNAVAILABLE';
        getLogger(context).error('StoreSearch: search failed', { code });
        return respond({ success: false, error: code }, 503);
    }
}
