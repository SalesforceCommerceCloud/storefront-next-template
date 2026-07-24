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

/**
 * Hooks for the mini cart: fetches the basket alongside full product details (images, variations,
 * promotions) in a single resource-route round-trip, and exposes an imperative loader form for
 * prefetching from the cart-badge hover/focus handlers.
 *
 * DESIGN NOTE — single source of truth for the mini cart
 * ------------------------------------------------------
 * The cart sheet reads `basket` from the fetcher returned here, NOT from `useBasket()` (BasketContext). This is
 * deliberate. Do not "simplify" by routing the cart-sheet's basket through context — that reverts the optimization and
 * reintroduces a second SCAPI round-trip per mini-cart open. If you need the basket somewhere else, use `useBasket()`.
 * The cart-sheet specifically needs basket AND productsById from the same SCAPI snapshot to render correctly — that's
 * why it reads both from here.
 *
 * This hook does call `useBasket()`, but only as the freshness *reference* for the staleness check (`needsMiniCartLoad`
 * compares the context basket's `lastModified` against the fetcher's) — never as the basket it renders. The rendered
 * basket and products still come exclusively from the fetcher.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFetcher } from 'react-router';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import type { loader as basketProductsLoader } from '@/routes/resource.basket-products';
import type { ProductsWithPromotionsMap } from '@/lib/cart/bonus-product-utils';
import { findImageGroupBy } from '@/lib/product/image-groups-utils';
import { useBasket, useBasketSnapshot, useBasketUpdater } from '@/providers/basket';
import { resourceRoutes } from '@/route-paths';
import { markMiniCartPanelMounted, markMiniCartPanelUnmounted } from '@/hooks/mini-cart-store';

/**
 * Identity key for a basket, derived from the fields the cookie snapshot carries (`basketId`, total item quantity,
 * unique line count). Used as the staleness signal in `needsMiniCartLoad`'s fallback branch — when no full basket
 * (with a SCAPI `lastModified`) has been loaded into context, the cookie's item counts are the only client-readable
 * change signal. A count-neutral change (e.g. a variant swap) is invisible to this key; that case is covered by the
 * `lastModified` comparison whenever a full basket for the current basket is available.
 */
const snapshotKey = (basketId: string, totalItemCount: number, uniqueProductCount: number): string =>
    `${basketId}:${totalItemCount}:${uniqueProductCount}`;

/**
 * Identity key for the basket the cookie snapshot now describes, or null when there is nothing to enrich (no basket,
 * or an empty basket). The empty case is the load gate's "skip" signal — the panel renders the empty-cart state and
 * hover-prefetch is a no-op. Empty-basket trust is cookie-based; see the docblock on useMiniCartDataLoader for the
 * divergence tradeoff.
 */
const currentSnapshotKey = (
    snapshot: { basketId?: string; totalItemCount?: number; uniqueProductCount?: number } | null | undefined
): string | null =>
    snapshot?.basketId && (snapshot.totalItemCount ?? 0) > 0
        ? snapshotKey(snapshot.basketId, snapshot.totalItemCount ?? 0, snapshot.uniqueProductCount ?? 0)
        : null;

/**
 * Identity key for the basket the persisted fetcher data represents, computed from the same fields the cookie snapshot
 * uses so a load makes the two keys converge (no reload loop). Null when the fetcher has no basket yet.
 */
const fetchedSnapshotKey = (basket: ShopperBasketsV2.schemas['Basket'] | null | undefined): string | null => {
    if (!basket?.basketId) {
        return null;
    }
    const productItems = basket.productItems ?? [];
    const totalItemCount = productItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
    return snapshotKey(basket.basketId, totalItemCount, productItems.length);
};

/**
 * Whether the basket-products resource needs a (re)load. Always false when there is nothing to enrich (no basket id, or
 * an empty basket per the cookie snapshot) — that gate wins over every freshness signal below.
 *
 * Freshness is decided by `lastModified` whenever a full basket for the current basket has been loaded into
 * `BasketProvider` (`referenceBasket`): the add/edit/remove handlers and this hook's own publish-back effect write the
 * action-response basket — which carries the SCAPI-set `lastModified` — into context, so after any mutation the
 * reference revision is fresh even when item counts are unchanged (e.g. a variant swap). The comparison is directional:
 * reload only when the reference is strictly NEWER than the persisted fetcher data (a revision the cache hasn't pulled
 * yet). A reference OLDER than the cache is not staleness — it is the publish-back render-lag. When the panel is open
 * and `resource.basket-products` revalidates the fetcher post-action, the fetcher holds the new revision a render
 * before `useBasket()` (a parent `setState`) converges to it; a symmetric `!==` would read that benign lag as stale
 * and fire a redundant second load. Equal revisions mean the cache is current and is reused without a round-trip.
 * `lastModified` is SCAPI's ISO-8601 UTC timestamp, so a lexicographic `>` is a chronological comparison.
 *
 * When no full basket reference is available — only the cookie snapshot, which has no `lastModified` (returning
 * visitor, nothing added this session, panel never opened) — the count-derived key is the fallback signal. It cannot
 * see a count-neutral change, so the load decision errs toward the cache only when the counts also match; a divergent
 * count always reloads. Once the first load resolves and publishes into context, subsequent decisions use the
 * `lastModified` path. Shared by the hover-prefetch and panel-open paths; callers still gate on `fetcher.state`.
 */
const needsMiniCartLoad = (
    snapshot: { basketId?: string; totalItemCount?: number; uniqueProductCount?: number } | null | undefined,
    fetchedBasket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    referenceBasket: ShopperBasketsV2.schemas['Basket'] | null | undefined
): boolean => {
    // The cookie reports nothing to enrich (no basket id, or an empty basket). Normally a skip — but the shared
    // fetcher cache outlives panel close, so after a closed-panel empty-out (cart-page remove, post-checkout return,
    // cross-tab clear) it can still hold the pre-empty line items. The panel reads `basket` straight from the fetcher,
    // so leaving the cache as-is renders ghost items while the cookie-driven badge shows 0. Reload to flush the cache
    // when it still holds items; once the reload brings back the emptied (item-less) basket this returns false, so it
    // converges. A cold/empty fetcher has no items → still a skip, preserving the cold-visitor no-round-trip path.
    if (currentSnapshotKey(snapshot) === null) {
        return (fetchedBasket?.productItems?.length ?? 0) > 0;
    }

    // A full basket for the current basket is the reference: compare on its SCAPI `lastModified`, which moves on every
    // mutation including count-neutral ones. Guard on matching basketId so a stale reference from a prior basket
    // (guest → registered handoff) can't suppress a needed load.
    const referenceLastModified =
        referenceBasket?.basketId && referenceBasket.basketId === snapshot?.basketId
            ? referenceBasket.lastModified
            : undefined;
    if (referenceLastModified) {
        // Directional: reload only when the reference revision is strictly newer than what the fetcher holds. An older
        // reference is the publish-back render-lag (post-action revalidation lands in the fetcher a render before
        // useBasket() converges), not a stale cache — reloading on it fires a redundant second request.
        const fetchedLastModified = fetchedBasket?.lastModified;
        return !fetchedLastModified || referenceLastModified > fetchedLastModified;
    }

    // Cookie-only fallback: no full basket reference, so the count key is the only signal available.
    return fetchedSnapshotKey(fetchedBasket) !== currentSnapshotKey(snapshot);
};

/**
 * A basket product item enriched with full product details (images, variations, etc.)
 * Combines basket item data with product catalog data for display purposes
 */
export type BasketItemWithProduct = ShopperBasketsV2.schemas['ProductItem'] &
    Partial<ShopperProducts.schemas['Product']> & {
        isProductUnavailable?: boolean;
    };

interface UseMiniCartDataResult {
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined;
    productItems: BasketItemWithProduct[];
    productsById: ProductsWithPromotionsMap;
    isLoading: boolean;
    error: Error | null;
}

// Shared React Router fetcher key for the basket-products resource. Both useMiniCartData (mounted by the cart
// sheet) and useMiniCartDataLoader (used for prefetch) attach to this key so they observe the same fetcher state
// — a prefetch in flight is reused by the cart sheet rather than dispatched a second time.
const MINI_CART_FETCHER_KEY = 'basket-products';
const MINI_CART_RESOURCE_URL = resourceRoutes.basketProducts;

/**
 * Imperative loader for the mini-cart resource. Returns a reference-stable callback that dispatches a load when the
 * shared fetcher is idle and the persisted basket-products data is stale (see `needsMiniCartLoad` for the freshness
 * rule), and is a no-op otherwise. Calling this hook allocates a React Router fetcher slot on every page that mounts
 * it, but no network call fires until the returned callback is invoked.
 *
 * Used by the cart-badge to pre-warm on hover/focus so basket + product data is in cache by the time the panel mounts.
 * Because post-action revalidation is suppressed while the panel is closed (see `resource.basket-products`), a basket
 * mutation can leave the persisted data stale; the hover re-fetches in that case, not just on the very first warm.
 *
 * Skips when no basketId is known in the snapshot or when the snapshot reports an empty basket — without an existing
 * basket there's nothing to enrich, and an empty basket has no line items to enrich either; triggering the resource
 * route would round-trip for no gain. Empty-basket trust is cookie-based, so a stale "empty" cookie can briefly hide
 * a cross-tab add, but the next loader run reconciles via the basket middleware.
 */
export function useMiniCartDataLoader(): () => void {
    const fetcher = useFetcher<typeof basketProductsLoader>({ key: MINI_CART_FETCHER_KEY });
    const snapshot = useBasketSnapshot();
    const referenceBasket = useBasket();

    // useFetcher returns a fresh object every render and the snapshot/reference can flip on cookie or context updates.
    // Mirror all three into refs so the returned callback can have empty useCallback deps and stay reference-stable.
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const snapshotRef = useRef(snapshot);
    snapshotRef.current = snapshot;
    const referenceBasketRef = useRef(referenceBasket);
    referenceBasketRef.current = referenceBasket;

    return useCallback(() => {
        const f = fetcherRef.current;
        if (f.state === 'idle' && needsMiniCartLoad(snapshotRef.current, f.data?.basket, referenceBasketRef.current)) {
            void f.load(MINI_CART_RESOURCE_URL);
        }
    }, []);
}

const deriveVariationValuesFromAttributes = (
    variationAttributes: ShopperProducts.schemas['VariationAttribute'][] | undefined
): Record<string, string> | undefined => {
    if (!variationAttributes?.length) return undefined;

    const selected = variationAttributes.reduce<Record<string, string>>((acc, attribute) => {
        const value = attribute.values?.length === 1 ? attribute.values[0]?.value : undefined;
        if (attribute.id && value) {
            acc[attribute.id] = value;
        }
        return acc;
    }, {});

    return Object.keys(selected).length > 0 ? selected : undefined;
};

const normalizeVariationValues = (value: unknown): Record<string, string> | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const entries = Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const getFallbackImageGroup = (
    imageGroups: ShopperProducts.schemas['ImageGroup'][] | undefined
): ShopperProducts.schemas['ImageGroup'] | undefined => {
    if (!imageGroups?.length) return undefined;

    const smallGroups = imageGroups.filter((group) => group.viewType === 'small');
    if (smallGroups.length === 0) return undefined;

    return smallGroups.find((group) => !group.variationAttributes?.length) ?? smallGroups[0];
};

/**
 * Fetches the basket plus full product details (images, variations, promotions) and merges the two into enriched
 * line items. Loads on first mount; React Router auto-revalidates the fetcher after sibling action submissions
 * (e.g. cart-item-remove), so additions/removals propagate without additional plumbing.
 */
export function useMiniCartData(): UseMiniCartDataResult {
    // Shared fetcher key so prefetch (e.g. on cart-badge hover via useMiniCartDataLoader) and the cart-sheet
    // panel observe the same fetcher state — avoids a duplicate request when click follows a hover prefetch. We can't
    // delegate to useMiniCartDataLoader here because this hook reads fetcher state/data for the merge logic.
    const fetcher = useFetcher<typeof basketProductsLoader>({ key: MINI_CART_FETCHER_KEY });
    const { state: fetcherState, data: fetcherData, load: loadMiniCart } = fetcher;
    const snapshot = useBasketSnapshot();
    const snapshotBasketId = snapshot?.basketId;
    const snapshotTotalItemCount = snapshot?.totalItemCount ?? 0;
    // Read-only (no autoLoad): the full basket BasketProvider already holds, used as the freshness reference. It carries
    // the SCAPI `lastModified` that the count-derived snapshot key cannot — so a count-neutral mutation is still
    // detected. This hook publishes the fetched basket back into the same context below, so the reference converges to
    // the fetched revision after a load (no reload loop).
    const referenceBasket = useBasket();

    // Mark the panel mounted for the lifetime of this hook. Only the open cart sheet mounts `useMiniCartData`, so this
    // tracks the panel's visibility in the mini-cart store. `resource.basket-products`' `shouldRevalidate` reads it to
    // suppress post-action revalidation while the panel is closed — see the mini-cart-store module.
    useEffect(() => {
        markMiniCartPanelMounted();
        return () => markMiniCartPanelUnmounted();
    }, []);

    // Staleness decision, shared with the hover-prefetch path via `needsMiniCartLoad`. The fetcher data outlives panel
    // close/reopen (the cart badge holds the shared fetcher key), so a divergence from the reference means a mutation
    // landed while the fetcher was idle. After a load this hook publishes the fetched basket into the same context the
    // reference reads from, so the two converge — no reload loop. `needsMiniCartLoad` is pure, so the derived boolean is
    // a value-stable effect dep (true on a stale or cold cache, false when current).
    const needsLoad = needsMiniCartLoad(snapshot, fetcherData?.basket, referenceBasket);

    // Load when the fetcher is idle and the cached data is stale for the current basket — a cold open (no data yet) or
    // a mutation that landed while the panel was closed and revalidation was suppressed. When the data is current it is
    // reused without a round-trip. Revalidation while the panel is open is handled separately by the resource route's
    // `shouldRevalidate` (footer totals on in-panel removals); this effect only covers the open transition.
    useEffect(() => {
        if (fetcherState === 'idle' && needsLoad) {
            void loadMiniCart(MINI_CART_RESOURCE_URL);
        }
    }, [needsLoad, fetcherState, loadMiniCart]);

    // Publish the fetched basket into BasketProvider so badge count and other useBasket() consumers stay in sync.
    // Reads no value from BasketContext, so writing back here cannot create a render loop. updateBasket is
    // reference-stable.
    //
    // Key the effect on `basketId + lastModified` rather than the fetcherData object itself: React Router's fetcher
    // returns a fresh data object on every revalidation, even when SCAPI returns identical content. Without this guard,
    // every harmless revalidation would call updateBasket(), and even though the basket updater dedups by lastModified
    // internally, running the publisher body N times per session is wasted work. The basket payload is read through a
    // ref so the effect body sees the current value while the dep array tracks only the identity-defining fields.
    //
    // This loader fetches via getBasket (which sends `expand=approaching_discounts`), so the published basket
    // carries `approachingDiscounts`; the provider's shape-aware tie-break lets it upgrade a same-revision
    // down-shaped mutation write rather than deduping it away (see basket.tsx).
    const updateBasket = useBasketUpdater();
    const fetchedBasket = fetcherData?.basket;
    const fetchedBasketRef = useRef(fetchedBasket);
    fetchedBasketRef.current = fetchedBasket;
    const fetchedBasketId = fetchedBasket?.basketId;
    const fetchedLastModified = fetchedBasket?.lastModified;
    useEffect(() => {
        const fetched = fetchedBasketRef.current;
        if (fetched?.basketId) {
            updateBasket(fetched);
        }
    }, [fetchedBasketId, fetchedLastModified, updateBasket]);

    const basket = fetcherData?.basket ?? null;
    const productsById = useMemo<ProductsWithPromotionsMap>(() => fetcherData?.productsById ?? {}, [fetcherData]);

    const enriched = useMemo<{ productItems: BasketItemWithProduct[]; error: Error | null }>(() => {
        const productItems = basket?.productItems;
        if (!productItems?.length) {
            return { productItems: [], error: null };
        }

        // No product data yet — show basic basket items so the panel reflects the line items immediately.
        if (!fetcherData) {
            return { productItems, error: null };
        }

        try {
            const basketProductIds = productItems
                .map((item) => item.productId)
                .filter((id): id is string => Boolean(id));
            const hasAllCurrentProductData = basketProductIds.every((productId) => Boolean(productsById[productId]));

            // Avoid mixing stale fetcher data with the current basket while a refresh is in flight.
            if (!hasAllCurrentProductData) {
                return { productItems, error: null };
            }

            // Deliberate fork of `getEnrichedProducts` (lib/product/product-utils.ts). The mini cart adds single-value
            // variation derivation, SKU-first image fallback, and the stale-data guard above — all fetcher-specific
            // concerns we don't want pushed into the synchronous checkout helper.
            const enrichedItems: BasketItemWithProduct[] = productItems.map((item) => {
                const productId = item.productId;
                if (!productId || !productsById[productId]) {
                    return item;
                }

                const fullProduct = productsById[productId];
                const explicitImageVariationValues =
                    normalizeVariationValues(item.variationValues) ||
                    normalizeVariationValues(fullProduct.variationValues);
                const derivedDisplayVariationValues = deriveVariationValuesFromAttributes(
                    fullProduct.variationAttributes
                );
                const resolvedVariationValues = explicitImageVariationValues || derivedDisplayVariationValues;

                // SKU-first image strategy:
                // 1) Prefer SKU-resolved product image groups directly (fallback group)
                // 2) Only apply variation filtering when explicit variation values are present
                const imageGroup =
                    (explicitImageVariationValues
                        ? findImageGroupBy(fullProduct.imageGroups, {
                              viewType: 'small',
                              selectedVariationAttributes: explicitImageVariationValues,
                          })
                        : undefined) ?? getFallbackImageGroup(fullProduct.imageGroups);

                return {
                    ...item,
                    ...fullProduct,
                    // Preserve basket-specific data (only override if item has the value)
                    itemId: item.itemId,
                    quantity: item.quantity,
                    price: item.price,
                    priceAfterItemDiscount: item.priceAfterItemDiscount,
                    // Keep line-item values, then product values, then derive from single-value variation attrs.
                    variationValues: resolvedVariationValues,
                    // Keep fullProduct.variationAttributes for proper display names
                    variationAttributes: fullProduct.variationAttributes,
                    // Use the correct image for the variation
                    imageGroups: imageGroup ? [imageGroup] : fullProduct.imageGroups,
                };
            });

            return { productItems: enrichedItems, error: null };
        } catch (err) {
            return {
                productItems,
                error: err instanceof Error ? err : new Error('Unknown error'),
            };
        }
    }, [basket, fetcherData, productsById]);

    // Treat "no data yet" as loading so a cold open (touch device, external setMiniCartOpen(true), no prefetch)
    // renders the loading state instead of the empty-cart state for the one frame before the fetcher resolves.
    // `idle && !fetcherData` covers the brief window between mount and the load() effect dispatching.
    //
    // Exception: when there is no basketId or when the snapshot reports an empty basket, we have intentionally not
    // dispatched a load — the panel should render the empty-cart state, not a permanent spinner. Mirrors the
    // cart-badge prefetch gate.
    const isLoading =
        Boolean(snapshotBasketId) && snapshotTotalItemCount > 0 && (fetcherState !== 'idle' || !fetcherData);

    return {
        basket,
        productItems: enriched.productItems,
        productsById,
        isLoading,
        error: enriched.error,
    };
}
