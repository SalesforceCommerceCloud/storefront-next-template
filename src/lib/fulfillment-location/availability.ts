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
import {
    cityManagement,
    getDistanceKm,
    getInventoryEntry,
    getTransitDays,
    resolveCityByPostcode,
    type CityConfig,
    type InventoryEntry,
} from '@/lib/delivery-promise';
import type { CartFulfillment, LocationAvailability, ProductAvailability } from './types';

/**
 * Availability is derived from `data/simplified_city_management.json` (hub stock + city-to-city distance +
 * lead time bands), so PLP / PDP / cart show the same numbers the delivery promise uses. Distance and lead
 * time are measured from the shopper's city; without a postcode that is the default city.
 */
function toLocation(city: CityConfig, entry: InventoryEntry, shopperCity: CityConfig): LocationAvailability {
    const stockLevel = entry.stock[city.hub.id] ?? 0;
    const distance = getDistanceKm(city.id, shopperCity.id);
    return {
        fulfillmentLocationId: city.hub.id,
        city: city.name,
        postalCode: city.postalCode ?? '',
        stockLevel,
        distance,
        distanceUnit: 'KM',
        leadTime: stockLevel > 0 ? getTransitDays(distance) + (city.hub.handlingDays ?? 0) : null,
        leadTimeUnit: 'DAYS',
    };
}

function toProduct(entry: InventoryEntry, postcode?: string | null): ProductAvailability {
    const shopperCity = resolveCityByPostcode(postcode);
    return {
        productId: entry.productId,
        productName: entry.productName ?? entry.productId,
        sku: entry.productId,
        brand: entry.brand,
        category: entry.category ?? null,
        variantIds: entry.variantIds ?? [],
        availability: cityManagement.cities
            .filter((city) => (entry.stock[city.hub.id] ?? 0) > 0)
            .map((city) => toLocation(city, entry, shopperCity)),
    };
}

export function getProductAvailability(
    productId: string | null | undefined,
    postcode?: string | null
): ProductAvailability | undefined {
    const entry = getInventoryEntry(productId);
    return entry ? toProduct(entry, postcode) : undefined;
}

/** Master product id for a master or variant id; `undefined` when the product has no fulfillment data. */
export function getMasterProductId(productId: string | null | undefined): string | undefined {
    return getInventoryEntry(productId)?.productId;
}

export function isLocationInStock(location: LocationAvailability): boolean {
    return location.stockLevel > 0;
}

/**
 * Orders locations best-first: in-stock before out-of-stock, then shortest lead time, then closest.
 * Does not mutate the input.
 */
export function sortLocationsByPreference(locations: readonly LocationAvailability[]): LocationAvailability[] {
    return [...locations].sort((a, b) => {
        const stockDiff = Number(isLocationInStock(b)) - Number(isLocationInStock(a));
        if (stockDiff !== 0) return stockDiff;
        const leadDiff = (a.leadTime ?? Number.POSITIVE_INFINITY) - (b.leadTime ?? Number.POSITIVE_INFINITY);
        if (leadDiff !== 0) return leadDiff;
        return a.distance - b.distance;
    });
}

/** All locations for a product, best first. Empty when the product has no fulfillment data. */
export function getLocationAvailability(productId: string | null | undefined): LocationAvailability[] {
    const product = getProductAvailability(productId);
    return product ? sortLocationsByPreference(product.availability) : [];
}

export function getDefaultLocation(productId: string | null | undefined): LocationAvailability | undefined {
    return getLocationAvailability(productId)[0];
}

export function toCartFulfillment(location: LocationAvailability): CartFulfillment {
    return {
        locationId: location.fulfillmentLocationId,
        city: location.city,
        postalCode: location.postalCode,
        stockLevel: location.stockLevel,
        distance: location.distance,
        distanceUnit: location.distanceUnit,
        leadTime: location.leadTime,
        leadTimeUnit: location.leadTimeUnit,
    };
}
