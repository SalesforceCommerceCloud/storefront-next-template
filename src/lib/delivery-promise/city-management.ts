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
import cityManagementJson from '../../../data/simplified_city_management.json';
import type { CityConfig, CityManagementData, InventoryEntry } from './types';

/** Read-only fixture; it is never written at runtime. */
export const cityManagement = cityManagementJson as unknown as CityManagementData;

const inventoryIndex = new Map<string, InventoryEntry>();
for (const entry of cityManagement.inventory) {
    inventoryIndex.set(entry.productId, entry);
    for (const variantId of entry.variantIds ?? []) inventoryIndex.set(variantId, entry);
}

const hubCity = new Map<string, CityConfig>(cityManagement.cities.map((city) => [city.hub.id, city]));

export function getCityById(cityId: string): CityConfig | undefined {
    return cityManagement.cities.find((city) => city.id === cityId);
}

export function getCityByHubId(hubId: string): CityConfig | undefined {
    return hubCity.get(hubId);
}

export function getInventoryEntry(productId: string | null | undefined): InventoryEntry | undefined {
    return productId ? inventoryIndex.get(productId) : undefined;
}

export function getHubStock(productId: string | null | undefined, hubId: string): number {
    return getInventoryEntry(productId)?.stock[hubId] ?? 0;
}

/** City for an id; unknown or missing ids fall back to the default city. */
export function resolveCity(cityId: string | null | undefined): CityConfig {
    return (cityId ? getCityById(cityId) : undefined) ?? (getCityById(cityManagement.defaultCityId) as CityConfig);
}

/** City for a shopper postcode: the longest matching prefix wins, otherwise the default city. */
export function resolveCityByPostcode(postcode: string | null | undefined): CityConfig {
    const normalized = (postcode ?? '').replace(/\s+/g, '');
    let best: { city: CityConfig; length: number } | undefined;
    if (normalized) {
        for (const city of cityManagement.cities) {
            for (const prefix of city.postalCodePrefixes ?? []) {
                if (normalized.startsWith(prefix) && (!best || prefix.length > best.length)) {
                    best = { city, length: prefix.length };
                }
            }
        }
    }
    return best?.city ?? (getCityById(cityManagement.defaultCityId) as CityConfig);
}

/** Road distance between two cities; the same city uses that city's local distance. */
export function getDistanceKm(fromCityId: string, toCityId: string): number {
    if (fromCityId === toCityId) return getCityById(fromCityId)?.sameCityDistanceKm ?? 0;
    const route = cityManagement.routes.find(
        (r) =>
            (r.fromCityId === fromCityId && r.toCityId === toCityId) ||
            (r.fromCityId === toCityId && r.toCityId === fromCityId)
    );
    return route?.distanceKm ?? Number.POSITIVE_INFINITY;
}

/** Transit days for a distance: the first band that covers it, the longest band beyond the last. */
export function getTransitDays(distanceKm: number): number {
    const bands = [...cityManagement.leadTimeBands].sort((a, b) => a.maxKm - b.maxKm);
    const band = bands.find((b) => distanceKm <= b.maxKm) ?? bands[bands.length - 1];
    return band?.leadTimeDays ?? 0;
}
