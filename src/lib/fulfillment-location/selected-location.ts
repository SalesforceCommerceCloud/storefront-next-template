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
import { getLocationAvailability, getMasterProductId, isLocationInStock } from './availability';
import type { LocationAvailability } from './types';

/**
 * The location the shopper picked on the PDP, per master product. Kept in memory only: it is a
 * transient choice that becomes durable once the product is added to the cart.
 */
const selectedByProduct = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

export function setSelectedLocationId(productId: string, locationId: string): void {
    const masterId = getMasterProductId(productId);
    if (!masterId) return;
    selectedByProduct.set(masterId, locationId);
    version += 1;
    listeners.forEach((listener) => listener());
}

/** Selected location for a product; falls back to the best in-stock location. */
export function getSelectedLocation(productId: string | null | undefined): LocationAvailability | undefined {
    const locations = getLocationAvailability(productId);
    const masterId = getMasterProductId(productId);
    const selectedId = masterId ? selectedByProduct.get(masterId) : undefined;
    const selected = locations.find((location) => location.fulfillmentLocationId === selectedId);
    if (selected && isLocationInStock(selected)) return selected;
    return locations[0];
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Re-renders when any selection changes; returns the resolved selected location for the product. */
export function useSelectedLocation(productId: string | null | undefined): LocationAvailability | undefined {
    useSyncExternalStore(
        subscribe,
        () => version,
        () => 0
    );
    return getSelectedLocation(productId);
}
