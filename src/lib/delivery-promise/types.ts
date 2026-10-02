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

/** One city and the hub that ships from it (`simplified_city_management.json`). */
export interface CityConfig {
    id: string;
    name: string;
    postalCode?: string;
    /** Shopper postcodes starting with one of these belong to this city. */
    postalCodePrefixes?: string[];
    hub: { id: string; name: string; trackingPrefix: string; handlingDays?: number };
    sameCityDistanceKm: number;
}

export interface CityRoute {
    fromCityId: string;
    toCityId: string;
    distanceKm: number;
}

export interface LeadTimeBand {
    maxKm: number;
    leadTimeDays: number;
}

export interface InventoryEntry {
    productId: string;
    productName?: string;
    brand?: string;
    category?: string;
    variantIds?: string[];
    scenario?: string;
    /** Units on hand per hub id. */
    stock: Record<string, number>;
}

export interface CityManagementData {
    defaultCityId: string;
    fallbackHubId: string;
    cities: CityConfig[];
    routes: CityRoute[];
    leadTimeBands: LeadTimeBand[];
    inventory: InventoryEntry[];
}

export interface DeliveryPromiseInput {
    /** City the shopper selected. Missing or unknown falls back to the default city. Takes precedence over `postcode`. */
    cityId?: string | null;
    /** Legacy: shopper postcode, resolved to a city only when `cityId` is not given. */
    postcode?: string | null;
    /** Master product id or variant id. */
    productId: string;
    quantity: number;
    /** Injected for tests; defaults to now. */
    today?: Date;
}

export interface DeliveryPromise {
    /** Hub id that fulfils the item (also the delivery's location id). */
    locationId: string;
    cityId: string;
    city: string;
    /** Hub handling/prep days (0 unless the hub sets handlingDays). */
    leadTimeDays: number;
    /** Days on the road from the hub city to the shopper city. */
    transitDays: number;
    distanceKm: number;
    /** `YYYY-MM-DD`: today + leadTimeDays + transitDays. */
    deliveryDate: string;
    /** `false` when no hub has enough stock and the fallback hub is used. */
    inStock: boolean;
    /** Most units any single hub holds for the product (0 when unknown); used for "only X available". */
    maxAvailableUnits: number;
}

/** One hub's availability for a product, seen from the shopper's city (in or out of stock). */
export interface HubAvailability {
    locationId: string;
    cityId: string;
    city: string;
    stockLevel: number;
    /** `true` when the hub holds at least the requested quantity. */
    canFulfill: boolean;
    distanceKm: number;
    leadTimeDays: number;
    transitDays: number;
    /** `YYYY-MM-DD` the hub could deliver; meaningful only when `canFulfill`. */
    deliveryDate: string;
}

export interface DeliveryLineInput {
    productId: string;
    quantity: number;
}

export interface Delivery<T extends DeliveryLineInput = DeliveryLineInput> {
    /** Stable within one `buildDeliveries` call: `delivery-1`, `delivery-2`, ... */
    id: string;
    locationId: string;
    cityId: string;
    city: string;
    leadTimeDays: number;
    transitDays: number;
    distanceKm: number;
    deliveryDate: string;
    inStock: boolean;
    /** See `DeliveryPromise.maxAvailableUnits`. */
    maxAvailableUnits: number;
    items: T[];
    trackingNumber?: string;
}
