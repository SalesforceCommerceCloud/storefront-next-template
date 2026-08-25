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

import type { ShopperBasketsV2 } from '@/scapi';
import type { RouterContextProvider } from 'react-router';
import type { ToastType } from '@/components/toast';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getPickupProductItemsForStore } from '@/extensions/bopis/lib/basket-utils';

export type DeliveryOptionValidationResult = { valid: true } | { valid: false; errorMessage: string };

/**
 * Validates that adding a new item with the given pickup store does not conflict with the
 * existing basket. A basket may only contain pickup items from a single store at a time;
 * mixing stores requires the shopper to clear the conflicting items first.
 *
 * Pure: takes a basket and the new item's store id, returns the validation outcome with a
 * pre-translated error message ready for surfacing as a toast or action error. Used by the
 * server-side cart actions so the validation cannot be bypassed by direct API calls.
 *
 * @param basket - Current basket (or null/undefined if none exists yet — always valid)
 * @param newStoreId - Store ID for the new item (null/undefined for delivery items)
 * @param context - Optional router context for server-side translation lookup
 */
export function validateDeliveryOptionCompatibility(
    basket: ShopperBasketsV2.schemas['Basket'] | null | undefined,
    newStoreId: string | null | undefined,
    context?: Readonly<RouterContextProvider>
): DeliveryOptionValidationResult {
    if (!basket?.productItems) {
        return { valid: true };
    }

    const existingStoreId = basket.shipments?.find(
        (shipment) =>
            typeof shipment.c_fromStoreId === 'string' &&
            getPickupProductItemsForStore(basket, shipment.c_fromStoreId).length > 0
    )?.c_fromStoreId as string | undefined;
    if (newStoreId && existingStoreId && newStoreId !== existingStoreId) {
        const { t } = getTranslation(context);
        return { valid: false, errorMessage: t('extBopis:cart.addToCartValidation.changeStoreError') };
    }

    return { valid: true };
}

/**
 * Toast-aware adapter over {@link validateDeliveryOptionCompatibility} for client-side callers.
 * Used as an opportunistic pre-check before submitting an add-to-cart action: when the basket is
 * already hydrated in context (e.g., the shopper opened the mini-cart earlier), we can short-circuit
 * the network round-trip and surface the localized error immediately. The server-side validation in
 * the cart-add actions remains authoritative.
 *
 * @param basket - Current basket (or undefined if not yet hydrated — always valid)
 * @param newStoreId - Store ID for the new item (null for delivery items)
 * @param addToast - Toast function to show error messages
 * @returns true if validation passes, false if validation fails (toast shown)
 */
export function isSelectedDeliveryOptionValid(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    newStoreId: string | null,
    addToast: (message: string, type: ToastType) => void
): boolean {
    const result = validateDeliveryOptionCompatibility(basket, newStoreId);
    if (!result.valid) {
        addToast(result.errorMessage, 'error');
        return false;
    }
    return true;
}
