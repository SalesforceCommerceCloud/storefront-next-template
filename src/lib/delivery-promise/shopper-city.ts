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

import { useSyncExternalStore } from 'react';
import { cityManagement, getCityById } from './city-management';

/**
 * The city the shopper says they are in. Every distance, lead time and delivery date is measured from it.
 *
 * Stored in a cookie (not localStorage) so it survives reloads and is shared across tabs. The server and the
 * first client render both use the default city (no hydration mismatch); the stored city is applied right after
 * hydration. Writes only ever happen in the browser, so the module-level listener set is never shared between
 * server requests.
 */
export const SHOPPER_CITY_COOKIE = 'sf_shopper_city';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const listeners = new Set<() => void>();
/** Fallback when cookies are blocked: keeps the selection working for this page session. */
let memoryCityId: string | undefined;

function normalize(cityId: string | null | undefined): string {
    return cityId && getCityById(cityId) ? cityId : cityManagement.defaultCityId;
}

function readCookie(): string | undefined {
    try {
        const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${SHOPPER_CITY_COOKIE}=`));
        return match ? decodeURIComponent(match.slice(SHOPPER_CITY_COOKIE.length + 1)) : undefined;
    } catch {
        return undefined;
    }
}

/** Selected city id (always a known city); the default city when nothing valid is stored. */
export function getShopperCityId(): string {
    if (typeof document === 'undefined') return cityManagement.defaultCityId;
    return normalize(readCookie() ?? memoryCityId);
}

export function setShopperCityId(cityId: string): void {
    const next = normalize(cityId);
    memoryCityId = next;
    try {
        document.cookie = `${SHOPPER_CITY_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    } catch {
        // cookies blocked: the in-memory copy still serves this session
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getServerSnapshot = (): string => cityManagement.defaultCityId;

/** Selected city id; re-renders when the shopper changes it. */
export function useShopperCityId(): string {
    return useSyncExternalStore(subscribe, getShopperCityId, getServerSnapshot);
}
