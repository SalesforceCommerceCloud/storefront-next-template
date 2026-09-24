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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash.debounce';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';
import {
    useBasket,
    useBasketError,
    useBasketHydrated,
    useBasketLoader,
    useBasketSnapshot,
    useBasketUpdater,
} from '@/providers/basket';
import { useItemFetcher, useItemFetcherLoading } from '@/hooks/use-item-fetcher';
import { findBasketItemForProduct } from '@/lib/cart/find-basket-item';
import { ErrorCode } from '@/lib/error-codes';
import { resourceRoutes } from '@/route-paths';
import type { BasketActionResponse } from '@/routes/types/action-responses';

interface UseInlineCartQuantityProps {
    /** Selected SKU (a resolved variant's product id, or the standard product id). */
    productId: string | undefined;
    /** Selected pickup store. Omitted for ship-to-home. */
    storeId?: string | null;
    /** Available stock for the selected SKU and fulfillment option. */
    stockLevel?: number;
    /** Maximum quantity configured for this item, such as a bonus-product limit. */
    maxQuantity?: number;
    /** Enables basket hydration and matching when this control is active. */
    enabled: boolean;
}

/**
 * Owns basket-backed quantity mutations for the PDP inline cart control.
 * It uses existing cart item actions, so follow-up quantity changes do not
 * run the first-add path that opens the mini cart.
 */
export function useInlineCartQuantity({
    productId,
    storeId,
    stockLevel,
    maxQuantity,
    enabled,
}: UseInlineCartQuantityProps) {
    const basket = useBasket({ autoLoad: enabled });
    const basketSnapshot = useBasketSnapshot();
    const basketHydrated = useBasketHydrated();
    const basketError = useBasketError();
    const updateBasket = useBasketUpdater();
    const loadBasket = useBasketLoader();
    const { addToast } = useToast();
    const { t } = useTranslation('quantitySelector');
    const config = useConfig();
    const debounceDelay = config.pages.cart.quantityUpdateDebounce;
    const removeAction = config.pages.cart.removeAction;
    const cartItem = useMemo(
        () => (enabled ? findBasketItemForProduct(basket, productId, storeId) : undefined),
        [basket, enabled, productId, storeId]
    );
    const itemId = cartItem?.itemId;
    const basketQuantity = cartItem?.quantity ?? 0;
    const [optimisticQuantity, setOptimisticQuantity] = useState<number | null>(null);
    // A quantity the shopper tapped to while an update was in flight, held until the line is free so it
    // can flush as one trailing submit instead of being dropped.
    const pendingFlushRef = useRef<number | null>(null);
    const fetcher = useItemFetcher({ itemId, componentName: 'inline-add-to-cart' });
    const itemHasPendingMutation = useItemFetcherLoading(itemId);
    const isUpdating = fetcher.state !== 'idle' || itemHasPendingMutation;

    // A new target line clears the optimistic override and any queued flush outright.
    useEffect(() => {
        setOptimisticQuantity(null);
        pendingFlushRef.current = null;
    }, [itemId]);

    // A settled basket change clears the optimistic override, unless a tap made while an update was in
    // flight is still queued to flush. In that case the optimistic value is deliberately ahead of the
    // basket, so keep showing it until its own submit lands (see the flush effect below).
    useEffect(() => {
        if (pendingFlushRef.current === null) {
            setOptimisticQuantity(null);
        }
    }, [basketQuantity]);

    useEffect(() => {
        const result = fetcher.data as BasketActionResponse | undefined;
        if (fetcher.state !== 'idle' || !result) {
            return;
        }

        if (result.success) {
            if (result.basket) {
                updateBasket(result.basket);
            }
            // Keep a queued in-flight tap visible; the flush effect submits it now the line is free.
            if (pendingFlushRef.current === null) {
                setOptimisticQuantity(null);
            }
            return;
        }

        if (result.success === false) {
            pendingFlushRef.current = null;
            setOptimisticQuantity(null);
            addToast(
                result.error?.code === ErrorCode.OUT_OF_STOCK ? t('insufficientStock') : t('quantityUpdateFailed'),
                'error'
            );
        }
    }, [fetcher.data, fetcher.state, updateBasket, addToast, t]);

    // A failed auto-load leaves a basket id, no current basket, and `hydrated: true` (see basket.tsx
    // `onError`), so its contents are unknown. `useBasket`'s auto-load effect won't re-fire because its
    // deps don't change after the error, so retry the load once per basket id here. `hydrated` stays
    // true across the retry, so `loadRetryExhausted` (below) tracks when that retry settles. Until it
    // does, the CTA stays resolving so it can't offer a first-add mid-retry and duplicate a line the
    // retry is about to reveal. We do NOT keep the CTA disabled on a terminal failure: a basket we can
    // never read (e.g. a stale id left in the cookie after logout) must still allow adding to cart.
    const basketId = basketSnapshot?.basketId;
    const retriedBasketIdRef = useRef<string | null>(null);
    const retryErrorRef = useRef<string[] | null | undefined>(null);
    const [retryExhaustedBasketId, setRetryExhaustedBasketId] = useState<string | null>(null);
    useEffect(() => {
        const loadFailed = enabled && !basket && !!basketId && basketHydrated && !!basketError?.length;
        if (loadFailed && retriedBasketIdRef.current !== basketId) {
            retriedBasketIdRef.current = basketId ?? null;
            retryErrorRef.current = basketError;
            loadBasket();
        }
    }, [enabled, basket, basketId, basketHydrated, basketError, loadBasket]);

    // The retry settles when the basket loads (`!basket` turns false below) or a fresh error arrives. A
    // new `basketError` reference after we captured `retryErrorRef` means the retry failed again, so the
    // load is terminally failed for this basket id.
    useEffect(() => {
        if (
            retriedBasketIdRef.current === basketId &&
            !basket &&
            !!basketError?.length &&
            basketError !== retryErrorRef.current
        ) {
            setRetryExhaustedBasketId(basketId ?? null);
        }
    }, [basketId, basket, basketError]);

    const quantityInCart = optimisticQuantity ?? basketQuantity;
    // Exhaustion is scoped to the basket id it was recorded for. On a basket hand-off (e.g. a guest to
    // registered merge) the provider keeps basket A's `hydrated` and `error` for the first render on
    // basket B, so a plain boolean would treat B's retained error as terminal and release the CTA before
    // B's own load and retry run. Requiring the exhausted id to equal the current `basketId` keeps B
    // resolving until it settles on its own.
    const retryExhausted = !!basketId && retryExhaustedBasketId === basketId;
    // The auto-loaded basket resolves after first paint. Until it does, `quantityInCart` reads 0 even
    // when this SKU is already in the basket, so the caller must not offer the first-add path yet. It
    // would open the mini-cart and re-add instead of showing the stepper. This holds while the load is
    // in flight (`!basketHydrated`) and while a failed load is being retried (until `retryExhausted`).
    // A shopper with no basket to fetch (no `basketId`) has a genuine quantity of 0. On terminal failure
    // the CTA is released rather than blocked indefinitely.
    const isResolvingQuantity =
        enabled && !basket && !!basketId && (!basketHydrated || (!!basketError?.length && !retryExhausted));
    const effectiveLimit =
        maxQuantity === undefined
            ? stockLevel
            : stockLevel === undefined
              ? maxQuantity
              : Math.min(maxQuantity, stockLevel);
    const incrementDisabled = effectiveLimit !== undefined && quantityInCart >= effectiveLimit;

    // Coalesce rapid taps into a single basket update carrying the trailing quantity, matching the
    // cart line-item quantity input (see use-cart-quantity-update.ts). Each tap updates the optimistic
    // quantity immediately for responsive UI; only the final quantity is submitted once the burst
    // settles. The absolute quantity is sent (never a delta), so an overlapping update is last-write-
    // wins rather than corrupting the count. A trailing quantity of 0 removes the line.
    const submitQuantity = useMemo(() => {
        return debounce((nextQuantity: number) => {
            if (!itemId) {
                return;
            }

            const formData = new FormData();
            formData.append('itemId', itemId);
            if (nextQuantity <= 0) {
                void fetcher.submit(formData, { method: 'POST', action: removeAction });
                return;
            }
            formData.append('quantity', nextQuantity.toString());
            void fetcher.submit(formData, { method: 'PATCH', action: resourceRoutes.cartItemUpdate });
        }, debounceDelay);
        // fetcher is a stable submitter; recreate only when the target line, delay, or remove route changes.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [itemId, debounceDelay, removeAction]);

    // Cancel a scheduled update when the target line changes or the control unmounts, so a queued
    // submit never fires against a stale line or after teardown.
    useEffect(() => {
        return () => submitQuantity.cancel();
    }, [submitQuantity]);

    // Once an in-flight update settles and the line is free, submit the quantity the shopper tapped to
    // while it was busy. The optimistic quantity already shows this value; send the absolute quantity so
    // it is last-write-wins against the update that just finished.
    useEffect(() => {
        if (isUpdating || pendingFlushRef.current === null) {
            return;
        }
        const nextQuantity = pendingFlushRef.current;
        pendingFlushRef.current = null;
        submitQuantity.cancel();
        submitQuantity(nextQuantity);
    }, [isUpdating, submitQuantity]);

    // Apply a tapped quantity: show it immediately, then either submit it (line idle) or queue it to
    // flush once the in-flight update settles (line busy). Queueing keeps rapid taps from being dropped
    // mid-update while still coalescing them into a single trailing submit.
    const applyQuantity = useCallback(
        (quantity: number) => {
            setOptimisticQuantity(quantity);
            submitQuantity.cancel();
            if (isUpdating) {
                pendingFlushRef.current = quantity;
                return;
            }
            pendingFlushRef.current = null;
            submitQuantity(quantity);
        },
        [isUpdating, submitQuantity]
    );

    const increment = useCallback(() => {
        if (!itemId || incrementDisabled) {
            return;
        }
        applyQuantity(quantityInCart + 1);
    }, [applyQuantity, incrementDisabled, itemId, quantityInCart]);

    const decrement = useCallback(() => {
        if (!itemId) {
            return;
        }
        applyQuantity(quantityInCart <= 1 ? 0 : quantityInCart - 1);
    }, [applyQuantity, itemId, quantityInCart]);

    return { quantityInCart, increment, decrement, isUpdating, incrementDisabled, isResolvingQuantity };
}
