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
import type { RouterContextProvider } from 'react-router';
import type { ShopperStores } from '@/scapi';
import { StoreSelectionError } from '@/extensions/store-locator/lib/store-selection-error';

type Context = Readonly<RouterContextProvider>;

export type CityStoreSearchQuery = {
    countryCode: string;
    city: string;
    maxDistance: number;
    distanceUnit: 'mi' | 'km';
    limit: number;
};

/**
 * Merchant-owned server extension point; no city-search algorithm ships by default.
 * Implement with an indexed store search or geocoding followed by Shopper Stores.
 * Search the complete source before applying the limit; never filter a truncated locator response.
 * Return `data: []` for no matches and throw on provider failure. Only populate distance when known.
 * Enable `features.storeEntry.citySearchEnabled` after implementing and validating the provider.
 */
export function searchStoresByCity(
    _context: Context,
    _query: CityStoreSearchQuery
): Promise<ShopperStores.schemas['StoreResult']> {
    return Promise.reject(new StoreSelectionError('CITY_LOOKUP_NOT_CONFIGURED', 503));
}
