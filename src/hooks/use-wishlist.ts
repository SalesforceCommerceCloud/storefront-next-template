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
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { useTranslation } from 'react-i18next';
import type { ShopperSearch } from '@/scapi';
import { useToast } from '@/components/toast';
import { useAnalytics } from '@/hooks/use-analytics';
import { resourceRoutes } from '@/route-paths';
import type { action as wishlistAddAction } from '@/routes/action.wishlist-add';
import type { action as wishlistRemoveAction } from '@/routes/action.wishlist-remove';

/**
 * Hook for wishlist functionality using action routes for server-side state management.
 * Pass `initialProductIds` from a route loader (e.g. cart) so controls reflect the server wishlist after refresh.
 * Otherwise the hook only tracks optimistic toggles until navigation.
 *
 * Fetcher responses are handled via useEffect rather than by reading fetcher.data
 * immediately after submit — the latter causes a stale closure because fetcher.data
 * is updated through React state and is only current on the next render.
 */
export type UseWishlistOptions = {
    /** Product IDs already in the shopper wishlist (registered sessions). */
    initialProductIds?: readonly string[];
};

export const useWishlist = (options?: UseWishlistOptions) => {
    const { t } = useTranslation();
    const addFetcher = useFetcher<typeof wishlistAddAction>();
    const removeFetcher = useFetcher<typeof wishlistRemoveAction>();
    const { addToast } = useToast();
    const { trackWishlistItemAdded, trackWishlistItemRemoved } = useAnalytics();

    const initialProductIds = options?.initialProductIds;
    const initialProductIdsKey = useMemo(
        () => (initialProductIds?.length ? [...initialProductIds].sort().join('\0') : ''),
        [initialProductIds]
    );

    const [wishlistItems, setWishlistItems] = useState<Set<string>>(() => new Set(initialProductIds ?? []));

    /** Which wishlist mutation is in flight — keeps correct loading copy after optimistic `wishlistItems` flips */
    const [pendingOperation, setPendingOperation] = useState<'add' | 'remove' | null>(null);

    useEffect(() => {
        if (initialProductIds === undefined) {
            return;
        }
        setWishlistItems(new Set(initialProductIds));
    }, [initialProductIds, initialProductIdsKey]);

    // Refs to carry operation context into the useEffect handlers
    const pendingAddRef = useRef<{ productId: string; productName: string; surface?: string } | null>(null);
    const pendingRemoveRef = useRef<{ productId: string; surface?: string } | null>(null);
    const hasHandledAddRef = useRef(false);
    const hasHandledRemoveRef = useRef(false);

    const isLoading = addFetcher.state !== 'idle' || removeFetcher.state !== 'idle';

    // Handle add response — reading fetcher.data here (not in the submit callback)
    // ensures we always see the current value rather than a stale closure snapshot.
    useEffect(() => {
        if (addFetcher.state === 'submitting') {
            hasHandledAddRef.current = false;
            return;
        }

        if (addFetcher.state === 'idle' && addFetcher.data && pendingAddRef.current && !hasHandledAddRef.current) {
            hasHandledAddRef.current = true;
            const result = addFetcher.data;
            const { productId, productName, surface } = pendingAddRef.current;
            pendingAddRef.current = null;

            if (result.success) {
                if (result.alreadyInWishlist) {
                    addToast(t('product:alreadyInWishlist', { productName }), 'info');
                } else {
                    addToast(t('product:addedToWishlist', { productName }), 'success');
                }

                // Emit analytics event on success (not for duplicates, only new adds)
                if (!result.alreadyInWishlist && surface) {
                    void trackWishlistItemAdded({
                        surface: surface as 'pdp' | 'plp' | 'cart' | 'wishlist-page',
                        productId,
                    });
                }
            } else {
                setWishlistItems((prev) => {
                    const next = new Set(prev);
                    next.delete(productId);
                    return next;
                });
                addToast(t('product:failedToAddToWishlist'), 'error');
            }
            setPendingOperation(null);
        }
    }, [addFetcher.state, addFetcher.data, addToast, t, trackWishlistItemAdded]);

    // Handle remove response
    useEffect(() => {
        if (removeFetcher.state === 'submitting') {
            hasHandledRemoveRef.current = false;
            return;
        }

        if (
            removeFetcher.state === 'idle' &&
            removeFetcher.data &&
            pendingRemoveRef.current &&
            !hasHandledRemoveRef.current
        ) {
            hasHandledRemoveRef.current = true;
            const result = removeFetcher.data;
            const { productId, surface } = pendingRemoveRef.current;
            pendingRemoveRef.current = null;

            if (result.success) {
                addToast(t('product:removedFromWishlist'), 'success');

                // Emit analytics event on success
                if (surface) {
                    void trackWishlistItemRemoved({
                        surface: surface as 'pdp' | 'plp' | 'cart' | 'wishlist-page',
                        productId,
                    });
                }
            } else {
                setWishlistItems((prev) => {
                    const next = new Set(prev);
                    next.add(productId);
                    return next;
                });
                addToast(t('product:failedToRemoveFromWishlist'), 'error');
            }
            setPendingOperation(null);
        }
    }, [removeFetcher.state, removeFetcher.data, addToast, t, trackWishlistItemRemoved]);

    const isItemInWishlist = useCallback(
        (product: ShopperSearch.schemas['ProductSearchHit'], variant?: ShopperSearch.schemas['ProductSearchHit']) => {
            const productId = variant?.productId || product.productId;
            return productId ? wishlistItems.has(productId) : false;
        },
        [wishlistItems]
    );

    // Toggle the wishlist state for a product. Works for both guest and registered
    // sessions — SCAPI accepts the underlying `customerId` from either token type.
    // Fire-and-forget: submit is called synchronously and the useEffect handlers
    // above react to the fetcher state/data changes on subsequent renders.
    const toggleWishlist = useCallback(
        (
            product: ShopperSearch.schemas['ProductSearchHit'],
            variant?: ShopperSearch.schemas['ProductSearchHit'],
            surface?: 'pdp' | 'plp' | 'cart' | 'wishlist-page'
        ) => {
            const productId = variant?.productId || product.productId;
            if (!productId) {
                addToast(t('product:failedToAddToWishlist'), 'error');
                return;
            }

            const isInWishlist = wishlistItems.has(productId);

            setPendingOperation(isInWishlist ? 'remove' : 'add');

            // Optimistic update
            setWishlistItems((prev) => {
                const next = new Set(prev);
                if (isInWishlist) {
                    next.delete(productId);
                } else {
                    next.add(productId);
                }
                return next;
            });

            // Store context for the effect handlers, then submit
            if (isInWishlist) {
                pendingRemoveRef.current = { productId, surface };
                // In this case, we have access to only the product id (not item id)
                void removeFetcher.submit({ productId }, { method: 'POST', action: resourceRoutes.wishlistRemove });
            } else {
                pendingAddRef.current = { productId, productName: product.productName || 'product', surface };
                void addFetcher.submit({ productId }, { method: 'POST', action: resourceRoutes.wishlistAdd });
            }
        },
        [wishlistItems, addFetcher, removeFetcher, addToast, t]
    );

    return {
        wishlist: Array.from(wishlistItems),
        isLoading,
        pendingOperation,
        isItemInWishlist,
        toggleWishlist,
    };
};
