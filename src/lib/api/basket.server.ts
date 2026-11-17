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
import { createApiClients } from '@/lib/api-clients.server';
import type { RouterContextProvider } from 'react-router';
import { AuthTokenInvalidError, type ShopperBasketsV2 } from '@/scapi';
import { registeredLoginCompletedContext, uncertainBasketHandoffContext } from '@/middlewares/auth.utils';
import { getAuth, recoverCompletedLogin } from '@/middlewares/auth.server';
import {
    basketMetadataContext,
    basketResourceContext,
    basketHandoffWarningContext,
    restoreRetainedBasketSnapshot,
    updateBasketResource,
} from '@/middlewares/basket.server';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { CommerceContextError } from '@/lib/auth/commerce-context.server';

/**
 * Get the appropriate currency for basket calculations
 * Priority: basket.currency > site default > USD fallback
 */
export function getBasketCurrency(
    context: Readonly<RouterContextProvider>,
    basket: ShopperBasketsV2.schemas['Basket'] | undefined
): string {
    // 1. Use basket's current currency if available
    if (basket?.currency) {
        return basket.currency;
    }
    return (context.get(siteContext) as SiteContext).site.defaultCurrency;
}

/**
 * Remove a payment instrument from the basket using the Commerce API
 */
export async function removePaymentInstrumentFromBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    paymentInstrumentId: string
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);
    const { data: basket } = await clients.shopperBasketsV2.removePaymentInstrumentFromBasket({
        params: {
            path: { basketId, paymentInstrumentId },
        },
    });
    return basket;
}

/**
 * Add a payment instrument to the basket using the Commerce API
 */
export async function addPaymentInstrumentToBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    paymentInstrument: ShopperBasketsV2.schemas['OrderPaymentInstrument']
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);
    const { data: basket } = await clients.shopperBasketsV2.addPaymentInstrumentToBasket({
        params: {
            path: { basketId },
        },
        body: paymentInstrument,
    });
    return basket;
}

/**
 * Load applicable payment methods (including BM card type ids) for a basket.
 */
export async function getPaymentMethodsForBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string
): Promise<ShopperBasketsV2.schemas['PaymentMethodResult']> {
    const clients = createApiClients(context);
    const { data } = await clients.shopperBasketsV2.getPaymentMethodsForBasket({
        params: {
            path: { basketId },
        },
    });
    return data;
}

/**
 * Update an existing payment instrument on the basket using the Commerce API.
 */
export async function updatePaymentInstrumentInBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    paymentInstrumentId: string,
    paymentInstrument: ShopperBasketsV2.schemas['OrderPaymentInstrument']
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);
    const { data: basket } = await clients.shopperBasketsV2.updatePaymentInstrumentInBasket({
        params: {
            path: { basketId, paymentInstrumentId },
        },
        body: paymentInstrument,
    });
    return basket;
}

/**
 * Update the billing address for the basket using the Commerce API
 */
export async function updateBillingAddressForBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    billingAddress: ShopperBasketsV2.schemas['OrderAddress']
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const clients = createApiClients(context);
    const { data: basket } = await clients.shopperBasketsV2.updateBillingAddressForBasket({
        params: {
            path: { basketId },
        },
        body: billingAddress,
    });
    return basket;
}

/**
 * Calculate basket totals (taxes, shipping, order total) using the Commerce API
 * This triggers the Commerce Cloud calculation engine to compute all totals
 *
 * @param context - Router context for authentication
 * @param basketId - The basket ID to calculate
 * @param currency - Currency code (should come from basket.currency, defaults to USD for backward compatibility)
 */
export async function calculateBasket(
    context: Readonly<RouterContextProvider>,
    basketId: string,
    currency?: string
): Promise<ShopperBasketsV2.schemas['Basket']> {
    // If no currency is provided, let Commerce Cloud use the basket's existing currency
    // This is safer than hardcoding USD as it respects the basket's current currency setting
    const body: { currency?: string } = {};
    if (currency) {
        body.currency = currency;
    }

    // Use updateBasket with currency to trigger calculation
    // This follows the PWA Kit pattern - updating currency forces recalculation
    const clients = createApiClients(context);
    const { data: basket } = await clients.shopperBasketsV2.updateBasket({
        params: {
            path: { basketId },
        },
        body,
    });
    return basket;
}

/**
 * Merge guest basket with registered user basket
 * Call this after login completes to preserve guest cart items
 *
 * This uses transferBasket with merge=true which:
 * - Merges guest basket items into the registered user's basket
 * - Handles case where registered user has no active basket (creates one)
 * - Automatically finds the guest basket using the session's usid
 *
 * Note: As of ShopperBasketsV2 API v2.3.0, mergeBasket may return 204 (No Content) if neither shopper had an active basket.
 * In this case, we return undefined and defer basket creation until an item is added.
 *
 * @param context - Router context for authentication
 * @returns The merged basket, or undefined if neither shopper had a basket
 */
export async function mergeBasket(
    context: Readonly<RouterContextProvider>
): Promise<ShopperBasketsV2.schemas['Basket'] | undefined> {
    const clients = createApiClients(context);
    let basket: ShopperBasketsV2.schemas['Basket'] | undefined;
    try {
        ({ data: basket } = await clients.shopperBasketsV2.transferBasket({
            params: {
                query: {
                    merge: true,
                    populateCustomerDetails: true,
                },
            },
        }));
    } catch (error) {
        if (!(error instanceof AuthTokenInvalidError) || !context.get(registeredLoginCompletedContext)) throw error;
        // Authentication changes clear the hydrated resource but keep an opaque lookup hint for the guest basket.
        const candidateId =
            context.get(basketResourceContext)?.snapshot?.basketId ??
            context.get(basketMetadataContext)?.lookupBasketId;
        // The transfer outcome is unknown: verify ownership instead of replaying the transfer.
        basket = await recoverUncertainBasketHandoff(context, candidateId);
    }
    if (!basket?.basketId) return basket;
    // Transfer (or a verified recovery) alone does not establish current registered qualification. Reprice
    // and replace any hydrated guest resource even when the store is unchanged.
    try {
        const calculated = await calculateBasket(context, basket.basketId, getBasketCurrency(context, basket));
        updateBasketResource(context, calculated);
        return calculated;
    } catch (cause) {
        throw new CommerceContextError('BASKET_QUALIFICATION_UNAVAILABLE', 503, { cause });
    }
}

/**
 * Recover a completed login whose transfer failed with an invalid token. Returns the candidate basket only when the
 * registered customer is verified to own it; otherwise undefined with the handoff flagged as uncertain.
 */
async function recoverUncertainBasketHandoff(
    context: Readonly<RouterContextProvider>,
    candidateId: string | undefined
): Promise<ShopperBasketsV2.schemas['Basket'] | undefined> {
    await recoverCompletedLogin(context);
    context.set(basketHandoffWarningContext, true);
    if (!candidateId) {
        context.set(uncertainBasketHandoffContext, true);
        return undefined;
    }
    const authorized = createApiClients(context);
    const customerId = getAuth(context).customerId;
    if (!customerId) throw new AuthTokenInvalidError();
    try {
        const { data: owned } = await authorized.shopperCustomers.getCustomerBaskets({
            params: { path: { customerId } },
        });
        if (!owned.baskets?.some((basket) => basket.basketId === candidateId)) {
            restoreRetainedBasketSnapshot(context);
            return undefined;
        }
        const { data: basket } = await authorized.shopperBasketsV2.getBasket({
            params: { path: { basketId: candidateId } },
        });
        if (basket.basketId !== candidateId) {
            restoreRetainedBasketSnapshot(context);
            return undefined;
        }
        context.set(basketHandoffWarningContext, false);
        return basket;
    } catch (readError) {
        if (readError instanceof AuthTokenInvalidError) throw readError;
        restoreRetainedBasketSnapshot(context);
        return undefined;
    } finally {
        context.set(uncertainBasketHandoffContext, context.get(basketHandoffWarningContext));
    }
}
