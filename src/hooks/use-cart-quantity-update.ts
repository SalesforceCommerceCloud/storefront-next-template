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

// React
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// React Router
import type { useFetcher } from 'react-router';

// Third-party
import debounce from 'lodash.debounce';

// Components
import { useToast } from '@/components/toast';

// Hooks
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useBasketUpdater } from '@/providers/basket';
import { registerPendingCartMutation, unregisterPendingCartMutation } from '@/hooks/cart-mutation-toast-store';

// Lib
import { resolveQuantityUpdateToast } from '@/lib/cart/cart-mutation-toast-resolvers';

// Constants
import { resourceRoutes } from '@/route-paths';
// Types
import type { ShopperBasketsV2 } from '@/scapi';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { useTranslation } from 'react-i18next';

/**
 * The constraint is intentionally weak: this hook submits to two different action routes (`removeAction` from config,
 * `/action/cart-item-update`) whose full response shapes differ. The hook reads `fetcher.data?.success` and the
 * optional `fetcher.data?.basket` it publishes back into `BasketProvider` — both routes wrap success as
 * `{ success: true, basket }` via `createBasketAction`. Callers pin a richer type if they want narrower access.
 */
interface UseCartQuantityUpdateProps<
    TResponse extends { success?: boolean; basket?: ShopperBasketsV2.schemas['Basket']; error?: { code?: string } },
> {
    /** Cart item ID for API calls */
    itemId: string;
    /** Initial quantity value */
    initialValue: number;
    /** Stock level for validation */
    stockLevel?: number;
    /** Debounce delay in milliseconds */
    debounceDelay?: number;
    /** Fetcher used to submit the quantity update / remove. */
    fetcher: ReturnType<typeof useFetcher<TResponse>>;
    /**
     * The fetcher's key (from `getItemFetcherKey`). Supplied only by the mini-cart, where closing the drawer
     * unmounts this line item mid-update: it lets the unmount cleanup hand the still-in-flight request off to
     * `CartMutationToastWatcher` so the toast still fires. Omitted where the line item never unmounts
     * mid-update (e.g. the cart page), in which case no handoff is registered.
     */
    fetcherKey?: string;
}

interface UseCartQuantityUpdateReturn {
    /** Current quantity value (can be string for empty input) */
    quantity: number | string;
    /** Stock validation error message */
    stockValidationError: string | null;
    /** Maximum quantity allowed based on stock level (undefined if no limit) */
    stockMax: number | undefined;
    /** Whether to show remove confirmation dialog */
    showRemoveConfirmation: boolean;
    /** Handle quantity change from input */
    handleQuantityChange: (stringValue: string, numberValue: number) => void;
    /** Handle quantity input blur */
    handleQuantityBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
    /** Handle keeping item (cancel removal) */
    handleKeepItem: () => void;
    /** Handle removing item (confirm removal) */
    handleRemoveItem: () => void;
    /** Set remove confirmation dialog visibility */
    setShowRemoveConfirmation: (show: boolean) => void;
}

/**
 * Custom hook for managing cart quantity updates with debouncing, stock validation, and API integration.
 *
 * This hook provides:
 * - Debounced API calls to prevent spam
 * - Stock level validation with error messages
 * - Optimistic updates for better UX
 * - Error handling with rollback on failure
 * - Remove confirmation dialog management
 *
 * @param props - Hook configuration
 * @returns Object containing state and handlers for cart quantity management
 *
 * @example
 * ```tsx
 * const {
 *   quantity,
 *   stockValidationError,
 *   showRemoveConfirmation,
 *   handleQuantityChange,
 *   handleQuantityBlur,
 *   handleKeepItem,
 *   handleRemoveItem,
 *   setShowRemoveConfirmation
 * } = useCartQuantityUpdate({
 *   itemId: 'cart-item-123',
 *   initialValue: 2,
 *   stockLevel: 10,
 *   debounceDelay: 750
 * });
 * ```
 */
export function useCartQuantityUpdate<
    TResponse extends {
        success?: boolean;
        basket?: ShopperBasketsV2.schemas['Basket'];
        error?: { code?: string };
    } = BasketActionResponse,
>({
    itemId,
    initialValue,
    stockLevel,
    debounceDelay,
    fetcher,
    fetcherKey,
}: UseCartQuantityUpdateProps<TResponse>): UseCartQuantityUpdateReturn {
    const config = useConfig();
    const { addToast } = useToast();
    const { t } = useTranslation('quantitySelector');
    const updateBasket = useBasketUpdater();

    const effectiveDebounceDelay = debounceDelay || config.pages.cart.quantityUpdateDebounce;
    const removeAction = config.pages.cart.removeAction;

    // True only while THIS mounted line item has a request in flight. The fetcher is keyed by item id,
    // so its settled data outlives the component: closing the panel mid-update unmounts the line item
    // before the flushed request resolves, and remounting on reopen would replay a stale toast (the
    // "Quantity updated" confirmation, or the error message on a rejected change). This ref is set when
    // this instance submits and cleared when the response is consumed, so a fresh mount observing
    // already-settled data stays quiet.
    const requestInitiatedHereRef = useRef(false);

    // Remove item function
    const removeItem = useCallback(() => {
        if (!itemId) return;

        // Reclaim this key from any prior close-flush handoff before submitting again: if an earlier request
        // is still parked in the registry (its watcher leaf hasn't fired yet), drop it so only this mounted
        // instance's response effect toasts. Otherwise the armed watcher leaf and this instance would both
        // fire for the same settled response. No-op when there's no parked entry or no key.
        if (fetcherKey) unregisterPendingCartMutation(fetcherKey);
        requestInitiatedHereRef.current = true;
        const formData = new FormData();
        formData.append('itemId', itemId);
        void fetcher.submit(formData, {
            method: 'POST',
            action: removeAction,
        });
    }, [itemId, removeAction, fetcher, fetcherKey]);

    const [stockValidationError, setStockValidationError] = useState<string | null>(() =>
        stockLevel !== undefined && stockLevel > 0 && stockLevel <= initialValue ? t('maxStockReached') : null
    );
    const [quantity, setQuantity] = useState<number | string>(initialValue);
    const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);

    // Track the last quantity that was successfully confirmed by the API
    const [lastSuccessfulQuantity, setLastSuccessfulQuantity] = useState<number>(initialValue);
    // Track which quantity is currently being processed by an API call
    const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);

    // Use refs to access current values in callbacks without stale closures
    const lastSuccessfulQuantityRef = useRef<number>(initialValue);
    const quantityRef = useRef<number | string>(initialValue);

    // Generate inventory message when quantity is at or above stock level
    const getInventoryMessage = useCallback(
        (qty: number) => {
            if (stockLevel !== undefined && stockLevel > 0 && stockLevel <= qty) {
                return t('maxStockReached');
            }
            return null;
        },
        [stockLevel, t]
    );

    // Create debounced function with current values
    const changeItemQuantity = useMemo(() => {
        return debounce((newQuantity: number) => {
            // Don't make API call if quantity exceeds stock level
            if (stockLevel !== undefined && stockLevel > 0 && newQuantity > stockLevel) {
                return;
            }

            // Track the quantity that triggered this API call
            setPendingQuantity(newQuantity);
            // Reclaim this key from any prior close-flush handoff before submitting again: if an earlier
            // change is still parked in the registry (the shopper closed the panel, then reopened and edited
            // before that first request settled), drop it so only this mounted instance's response effect
            // toasts. Otherwise the armed watcher leaf and this instance would both fire for the same settled
            // response. No-op when there's no parked entry or no key.
            if (fetcherKey) unregisterPendingCartMutation(fetcherKey);
            requestInitiatedHereRef.current = true;

            const formData = new FormData();
            formData.append('itemId', itemId);
            formData.append('quantity', newQuantity.toString());

            void fetcher.submit(formData, {
                method: 'PATCH',
                action: resourceRoutes.cartItemUpdate,
            });
        }, effectiveDebounceDelay);
        // effectiveDebounceDelay: stable value, no need to recreate effect
        // fetcher: stable fetcher, no need to recreate effect
        // fetcherKey: derived from itemId, invariant for this line item
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [itemId, stockLevel]);

    // Handle quantity change with cart-specific logic
    const handleQuantityChange = useCallback(
        (stringValue: string, numberValue: number) => {
            // Handle empty input - allow user to clear input without showing remove confirmation
            if (stringValue === '') {
                setQuantity(stringValue);
                setStockValidationError(null);
                return;
            }

            // Handle 0 input - show remove confirmation
            if (numberValue === 0) {
                setQuantity(0); // Show 0 in the input field
                setShowRemoveConfirmation(true);
                return;
            }

            // Handle increment from empty state - change to 1
            if (quantityRef.current === '' && numberValue === 1) {
                setQuantity(numberValue);
                setStockValidationError(null);

                // Cancel any pending handlers before making new API call
                changeItemQuantity.cancel();

                // Make API call
                changeItemQuantity(numberValue);
                return;
            }

            // Set the Quantity of product to value of input if value number
            if (numberValue >= 0) {
                // Always update the quantity display value for immediate UI feedback
                setQuantity(numberValue);

                // Show or clear stock validation message
                setStockValidationError(getInventoryMessage(numberValue));

                // Check if quantity exceeds stock level
                if (stockLevel !== undefined && stockLevel > 0 && stockLevel < numberValue) {
                    // Cancel any pending debounced API calls
                    changeItemQuantity.cancel();

                    // Don't make API call if quantity exceeds stock
                    return;
                }

                // Cancel any pending handlers before making new API call
                changeItemQuantity.cancel();

                // Make API call
                changeItemQuantity(numberValue);
            }
        },
        [stockLevel, getInventoryMessage, changeItemQuantity]
    );

    // Handle quantity blur - default to last successful update if user leaves with empty input
    const handleQuantityBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        const { value: inputValue } = e.target;

        // Handle empty input - reset to last successful update
        if (!inputValue || inputValue === '') {
            setQuantity(lastSuccessfulQuantityRef.current);
            setStockValidationError(null);
            return;
        }

        // Handle 0 input - show remove confirmation
        if (inputValue === '0') {
            setShowRemoveConfirmation(true);
        }
    }, []);

    // Handle remove confirmation - keep item
    const handleKeepItem = useCallback(() => {
        setShowRemoveConfirmation(false);
        // Reset quantity to last successful update to keep the item
        setQuantity(lastSuccessfulQuantityRef.current);
    }, []);

    // Handle remove confirmation - remove item
    const handleRemoveItem = useCallback(() => {
        setShowRemoveConfirmation(false);
        removeItem();
    }, [removeItem]);

    // Handle API response when API call completes
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            // Consume the "this instance submitted" flag once per settled response. A remount on panel
            // reopen re-attaches to the same keyed fetcher and sees the already-settled data, but with the
            // flag false, so it won't replay the confirmation toast for a change the shopper already saw.
            const initiatedHere = requestInitiatedHereRef.current;
            requestInitiatedHereRef.current = false;

            if (fetcher.data.success) {
                // Publish the new revision so useBasket() consumers stay in sync. This response is
                // down-shaped (mutations can't send `expand=approaching_discounts`); the expanded
                // re-fetch supplies `approachingDiscounts` via the provider tie-break (see basket.tsx).
                if (fetcher.data.basket) {
                    updateBasket(fetcher.data.basket);
                }
                // Update the last successful quantity to the pending quantity that triggered this API call
                if (pendingQuantity !== null) {
                    setLastSuccessfulQuantity(pendingQuantity);
                    lastSuccessfulQuantityRef.current = pendingQuantity;
                    setPendingQuantity(null);
                }
            } else {
                // On failure, reset to the last known good value. This bookkeeping stays unconditional (a fresh
                // mount resets to initialValue, a no-op) to mirror the success branch's unconditional basket sync.
                setQuantity(lastSuccessfulQuantityRef.current);
                setPendingQuantity(null);
            }

            // Only notify for an update this mounted line item actually made, not a deferred response replayed
            // on reopen (the page's own quantity already reflects the flushed change). When the shopper closes
            // the mini-cart mid-update this instance unmounts before the response settles, so that toast is
            // fired by CartMutationToastWatcher instead (see the unmount cleanup below). resolveQuantityUpdateToast
            // is the single source of truth for the copy, shared with the watcher, and covers both branches:
            // the success confirmation and the error notice (OUT_OF_STOCK vs generic).
            if (initiatedHere) {
                const { message, type } = resolveQuantityUpdateToast(fetcher.data, t);
                addToast(message, type);
            }
        }
        //As addToast is unlikely to change, we don't need to include it in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.state, fetcher.data, itemId, updateBasket]);

    // Flush (not cancel) any pending debounced update on unmount so a quantity change made just
    // before the mini-cart panel closes still reaches the basket. Closing the panel unmounts the
    // line item inside the debounce window; cancelling here dropped the trailing change, so a rapid
    // increase/decrease followed by an immediate close left the quantity unadjusted. flush() is a
    // no-op when nothing is pending, so an unmount with no in-flight change costs nothing.
    useEffect(() => {
        return () => {
            changeItemQuantity.flush();
            // If a request this line item initiated is still unsettled as we unmount — the shopper closed the
            // mini-cart in the same beat as the change, so flush() above just fired the trailing edit (or an
            // earlier submission is still awaiting its response) — hand the keyed fetcher off to the root-mounted
            // CartMutationToastWatcher. It keeps React Router from purging the settled data and fires the
            // confirmation / error toast once, so the notification isn't lost with this unmounting instance.
            // The flag is only still true here when the response has NOT yet been consumed (see the effect
            // above), so a settled-while-mounted change never registers and never double-toasts. fetcherKey is
            // supplied only by the mini-cart (where this unmount happens); without it there's nothing to hand off.
            if (requestInitiatedHereRef.current && fetcherKey) {
                registerPendingCartMutation(fetcherKey, 'quantity-update');
            }
        };
        // changeItemQuantity: stable debounced function, no need to recreate effect
        // fetcherKey: derived from itemId, invariant for this line item
        // Only depend on itemId to avoid premature cleanup
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [itemId]);

    // Keep refs in sync with state
    useEffect(() => {
        quantityRef.current = quantity;
    }, [quantity]);

    useEffect(() => {
        lastSuccessfulQuantityRef.current = lastSuccessfulQuantity;
    }, [lastSuccessfulQuantity]);

    // Update local quantity and stock validation when initialValue or stockLevel changes
    // (e.g., from external basket updates or async data loading)
    useEffect(() => {
        setQuantity(initialValue);
        setLastSuccessfulQuantity(initialValue);
        setStockValidationError(getInventoryMessage(initialValue));
    }, [initialValue, stockLevel, getInventoryMessage]);

    const stockMax = stockLevel !== undefined && stockLevel > 0 ? stockLevel : undefined;

    return {
        quantity,
        stockValidationError,
        stockMax,
        showRemoveConfirmation,
        handleQuantityChange,
        handleQuantityBlur,
        handleKeepItem,
        handleRemoveItem,
        setShowRemoveConfirmation,
    };
}
