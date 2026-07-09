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

// Constants
import { resourceRoutes } from '@/route-paths';
import { ErrorCode } from '@/lib/error-codes';
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
}: UseCartQuantityUpdateProps<TResponse>): UseCartQuantityUpdateReturn {
    const config = useConfig();
    const { addToast } = useToast();
    const { t } = useTranslation('quantitySelector');
    const updateBasket = useBasketUpdater();

    const effectiveDebounceDelay = debounceDelay || config.pages.cart.quantityUpdateDebounce;
    const removeAction = config.pages.cart.removeAction;

    // Remove item function
    const removeItem = useCallback(() => {
        if (!itemId) return;

        const formData = new FormData();
        formData.append('itemId', itemId);
        void fetcher.submit(formData, {
            method: 'POST',
            action: removeAction,
        });
    }, [itemId, removeAction, fetcher]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            if (fetcher.data.success) {
                // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                if (fetcher.data.basket) {
                    updateBasket(fetcher.data.basket);
                }
                // Update the last successful quantity to the pending quantity that triggered this API call
                if (pendingQuantity !== null) {
                    setLastSuccessfulQuantity(pendingQuantity);
                    lastSuccessfulQuantityRef.current = pendingQuantity;
                    setPendingQuantity(null);
                }
                addToast(t('quantityUpdated'), 'success');
            } else {
                // On failure, reset to the last known good value
                setQuantity(lastSuccessfulQuantityRef.current);
                setPendingQuantity(null);
                // The server rejects an increase past available stock with OUT_OF_STOCK; surface that specifically
                // so the shopper knows to lower the quantity rather than seeing a generic "try again" message.
                const message =
                    fetcher.data.error?.code === ErrorCode.OUT_OF_STOCK
                        ? t('insufficientStock')
                        : t('quantityUpdateFailed');
                addToast(message, 'error');
            }
        }
        //As addToast is unlikely to change, we don't need to include it in the dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.state, fetcher.data, itemId, updateBasket]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            changeItemQuantity.cancel();
        };
        // changeItemQuantity: stable debounced function, no need to recreate effect
        // Only depend on itemId to avoid premature cleanup
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
