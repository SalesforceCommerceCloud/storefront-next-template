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
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
    useRef,
    type PropsWithChildren,
} from 'react';
import type { ShopperBasketsV2, ShopperStores } from '@/scapi';
import { getPickupItemsFromBasket } from '../lib/basket-utils';
import { getPickupItemsCacheKey, type CachedHashData } from '../lib/cache-utils';

/**
 * Store and inventory information for pickup items
 */
export interface PickupItemInfo {
    inventoryId: string;
    storeId: string;
}

/**
 * Context for managing Buy Online, Pick-up In Store (BOPIS) items.
 * Maintains a map of productId -> pickup info (inventoryId, storeId) for items marked for store pickup.
 *
 * This is separate from the store-locator UI state to maintain proper separation
 * of concerns: store-locator manages UI state (modal, search, selection),
 * while pickup context manages business logic state (which products need pickup).
 *
 * @note This context is client-side only and scoped to the page/component tree.
 */
interface PickupContextType {
    /** Map of productId to pickup info (inventoryId, storeId) for items marked for store pickup */
    pickupBasketItems: Map<string, PickupItemInfo>;
    /** Map of storeId to store details for pickup stores in the basket */
    pickupStores: Map<string, ShopperStores.schemas['Store']>;
    /** Add a product to the pickup items map */
    addItem: (productId: string, inventoryId: string, storeId: string) => void;
    /** Remove a product from the pickup items map */
    removeItem: (productId: string) => void;
    /** Clear all pickup items */
    clearItems: () => void;
}

const PickupContext = createContext<PickupContextType | null>(null);

interface PickupProviderProps {
    /** Optional basket to extract pickup items from (automatically extracts and caches pickup items) */
    basket?: ShopperBasketsV2.schemas['Basket'];
    /** Store details for pickup stores in the basket */
    initialPickupStores?: Map<string, ShopperStores.schemas['Store']>;
}

/**
 * Provider for pickup state management.
 * Should be placed at the page or layout level where pickup functionality is needed.
 *
 * **Usage:**
 * - Wrap product view or cart components with this provider
 * - Use `usePickup` hook in child components to access pickup state
 * - Pass `basket` prop when you have basket data (automatically extracts and caches pickup items)
 *
 * @example
 * ```tsx
 * <PickupProvider>
 *   <ProductView />
 * </PickupProvider>
 * ```
 *
 * @example
 * ```tsx
 * // With basket (automatically extracts and caches pickup items)
 * <PickupProvider basket={basket} initialPickupStores={storesByStoreId}>
 *   <CartContent />
 * </PickupProvider>
 * ```
 */
const PickupProvider = ({ children, basket, initialPickupStores }: PropsWithChildren<PickupProviderProps>) => {
    // Cache for pickup items with hash-based key comparison for optimal performance
    const pickupItemsCacheRef = useRef<{
        key: string;
        items: Map<string, PickupItemInfo>;
        hashData: CachedHashData | null;
    } | null>(null);

    // Extract and cache pickup items from basket using optimized hash-based caching
    // Returns the same Map instance when basket data hasn't changed, preventing unnecessary re-renders
    const cachedPickupItems = useMemo(() => {
        if (!basket) {
            pickupItemsCacheRef.current = null;
            return new Map<string, PickupItemInfo>();
        }

        const [currentKey, updatedHashData] = getPickupItemsCacheKey(
            basket,
            pickupItemsCacheRef.current?.hashData ?? null
        );

        if (pickupItemsCacheRef.current?.key === currentKey) {
            // Update hash data even if key is same (for future incremental checks)
            if (updatedHashData) {
                pickupItemsCacheRef.current.hashData = updatedHashData;
            }
            return pickupItemsCacheRef.current.items;
        }

        const items = getPickupItemsFromBasket(basket);
        pickupItemsCacheRef.current = { key: currentKey, items, hashData: updatedHashData };
        return items;
        // Only depend on basket properties that affect pickup items extraction:
        // - basketId: identifies the basket (used in cache key)
        // - productItems: items checked for pickup status
        // - shipments: identifies pickup shipments (via c_fromStoreId)
        // This avoids unnecessary recalculations when unrelated basket properties change
        // (e.g., currency, customerInfo, totals). The hash-based cache inside handles
        // reference equality checks, so this optimization is safe and performant.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [basket?.basketId, basket?.productItems, basket?.shipments]);

    const [pickupBasketItems, setPickupBasketItems] = useState<Map<string, PickupItemInfo>>(() => {
        return cachedPickupItems ? new Map(cachedPickupItems) : new Map();
    });

    const prevCachedItemsRef = useRef<Map<string, PickupItemInfo> | undefined>(cachedPickupItems);
    const pickupStores = useMemo(() => initialPickupStores ?? new Map(), [initialPickupStores]);

    useEffect(() => {
        if (!cachedPickupItems) {
            if (prevCachedItemsRef.current) {
                setPickupBasketItems(new Map());
            }
            prevCachedItemsRef.current = undefined;
            return;
        }

        if (cachedPickupItems === prevCachedItemsRef.current) {
            return;
        }

        prevCachedItemsRef.current = cachedPickupItems;
        // Protected from unnecessary updates: getPickupItemsCacheKey returns the same Map instance
        // when basket data hasn't changed (based on hash-based cache key comparison).
        // This reference equality check prevents re-renders when basket object reference changes
        // but the actual pickup items data remains the same.
        setPickupBasketItems(new Map(cachedPickupItems));
    }, [cachedPickupItems]);

    const addItem = useCallback((productId: string, inventoryId: string, storeId: string) => {
        setPickupBasketItems((prev) => {
            const newMap = new Map(prev);
            newMap.set(productId, { inventoryId, storeId });
            return newMap;
        });
    }, []);

    const removeItem = useCallback((productId: string) => {
        setPickupBasketItems((prev) => {
            const newMap = new Map(prev);
            newMap.delete(productId);
            return newMap;
        });
    }, []);

    const clearItems = useCallback(() => {
        setPickupBasketItems(new Map());
    }, []);

    return (
        <PickupContext.Provider value={{ pickupBasketItems, pickupStores, addItem, removeItem, clearItems }}>
            {children}
        </PickupContext.Provider>
    );
};

/**
 * Hook for accessing pickup context.
 *
 * **Note:** In the current implementation, pickup data is only available when PickupProvider is mounted.
 * Components should handle the case where pickup context might be `undefined`.
 *
 * @returns Pickup state and actions, or undefined if no PickupProvider is mounted
 *
 * @example
 * ```tsx
 * function DeliveryOptions() {
 *     const pickup = usePickup();
 *     if (pickup) {
 *         const { pickupBasketItems, pickupStores, addItem } = pickup;
 *         // ... use the context
 *     }
 * }
 * ```
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const usePickup = (): PickupContextType | null => {
    return useContext(PickupContext);
};

export default PickupProvider;
