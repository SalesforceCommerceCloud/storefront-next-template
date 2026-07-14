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
 * React Router checkout loaders for server-side and client-side data fetching
 *
 * This module provides React Router loader functions for the checkout route,
 * handling both server-side rendering and client-side data fetching with
 * automatic fallbacks and optimized performance.
 */

import type { LoaderFunctionArgs } from 'react-router';
import type {
    ShopperBasketsV2,
    ShopperProducts,
    ShopperPromotions,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    ShopperStores,
} from '@/scapi';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';
import type { SessionData } from '@/lib/api/types';
import { getAuth } from '@/middlewares/auth.server';
import { getBasket, updateBasketResource } from '@/middlewares/basket.server';
import { getCustomerProfileForCheckout, isRegisteredCustomer } from '@/lib/api/customer.server';
import { getShippingMethodsForShipment } from '@/lib/api/shipping-methods.server';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { createApiClients } from '@/lib/api-clients.server';
import { siteContext, type SiteContext } from '@salesforce/storefront-next-runtime/site-context';
import { getGcpApiKeyLazy } from '@salesforce/storefront-next-runtime/data-store';
import { getLoginPreferences, LOGIN_PREFERENCES_FALLBACK } from '@/lib/login-preferences.server';
import { getLogger } from '@/lib/logger.server';

// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { getPickupShipment } from '@/extensions/bopis/lib/basket-utils';
import { setAddressAndMethodForPickup } from '@/extensions/bopis/lib/api/shipment.server';
import { fetchStoresForBasket } from '@/extensions/bopis/lib/api/stores.server';
import { isPickupAddressSet } from '@/extensions/bopis/lib/store-utils';
import { isPickupShippingMethod } from '@/extensions/bopis/lib/pickup-shipping-method-utils';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { isAddressEmpty, isOrderBillingAddressIncomplete } from '@/lib/address/address-utils';

/**
 * Checkout page data type
 */
export type CheckoutPageData = {
    /**
     * Pre-prefill basket snapshot from `getBasket()`. Enough to render the checkout shell
     * immediately without waiting on any SCAPI writes. Downstream consumers should read from
     * the basket provider (updated by `PrefillSync` once `prefilledBasket` resolves) rather
     * than trusting this snapshot for post-prefill fields (shipping address, payment, etc.).
     */
    basket: ShopperBasketsV2.schemas['Basket'] | null;
    /**
     * Registered-shopper prefill mutations, streamed rather than awaited. Undefined for guests.
     * Each prefill write (contact info, shipping address, shipping method, billing address, saved
     * payment) triggers the server-side `sfcc.app.shipping.calculate` hook — with a shipping app
     * like CDS installed, that hook makes an outbound HTTP call. Keeping them off the awaited
     * path is the largest first-byte win on this route.
     */
    prefilledBasket?: Promise<ShopperBasketsV2.schemas['Basket'] | null>;
    shippingMethodsMap?: Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>>;
    customerProfile?: Promise<CustomerProfile | null>;
    productMap: Promise<Record<string, ShopperProducts.schemas['Product']>>;
    promotions?: Promise<Record<string, ShopperPromotions.schemas['Promotion']>>;
    isRegisteredCustomer?: boolean;
    emailVerificationEnabled?: boolean;
    // OOTB Google Cloud API key (Address Autocomplete) sourced from the MRT data store; empty when unavailable
    gcpApiKey?: string;
    shippingDefaultSet?: Promise<undefined>;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    storesByStoreId?: Map<string, ShopperStores.schemas['Store']>;
};

/**
 * Server-side customer profile fetcher
 * Optimized to reduce dynamic imports
 * Exported for use in route loaders
 */
export function getServerCustomerProfileData(
    context: LoaderFunctionArgs['context'],
    authSession: SessionData | null
): Promise<CustomerProfile | null> {
    try {
        if (!authSession || !authSession.customerId || authSession.userType !== 'registered') {
            return Promise.resolve(null);
        }

        // Single dynamic import for server utils
        return import('@/lib/checkout/server-utils.server')
            .then(({ getServerCustomerProfile }) => getServerCustomerProfile(context, authSession))
            .catch((error) => {
                const logger = getLogger(context);
                logger.error('Checkout: failed to load customer profile data', { error });
                return null;
            });
    } catch (error) {
        const logger = getLogger(context);
        logger.error('Checkout: failed to import checkout-server-utils', { error });
        return Promise.resolve(null);
    }
}

/**
 * Server-side shipping methods map fetcher. Exported for use in route loaders.
 * Fetches shipping methods for all shipments in the basket that have a shipping address.
 */
export async function getServerShippingMethodsMapData(
    context: LoaderFunctionArgs['context'],
    _authSession: SessionData | null
): Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>> {
    try {
        const basketResource = await getBasket(context);
        const basket = basketResource.current ?? null;
        return fetchShippingMethodsMapForBasket(context, basket);
    } catch (error) {
        const logger = getLogger(context);
        logger.error('Checkout: failed to fetch shipping methods map', { error });
        return {};
    }
}

/**
 * Shared utility to fetch shipping methods for all shipments in a basket
 * This is used by both client and server loaders to maintain consistency
 *
 * @param context - Router context (client or server)
 * @param basket - Shopping basket
 * @returns Promise that resolves to a map of shipment ID to shipping methods
 */
export async function fetchShippingMethodsMapForBasket(
    context: LoaderFunctionArgs['context'],
    basket: ShopperBasketsV2.schemas['Basket'] | null
): Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>> {
    if (!basket?.basketId || !basket.shipments || basket.shipments.length === 0) {
        return {};
    }

    const basketId = basket.basketId;
    const shippingMethodsMap: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> = {};

    // Fetch shipping methods for each shipment that has a shipping address
    const fetchPromises = basket.shipments
        .filter((shipment) => shipment.shipmentId && !isAddressEmpty(shipment.shippingAddress))
        .map(async (shipment) => {
            try {
                const methods = await getShippingMethodsForShipment(context, basketId, shipment.shipmentId);
                shippingMethodsMap[shipment.shipmentId] = methods;
            } catch (error) {
                const logger = getLogger(context);
                logger.error('Checkout: failed to fetch shipping methods for shipment', {
                    shipmentId: shipment.shipmentId,
                    error,
                });
            }
        });

    await Promise.all(fetchPromises);

    return shippingMethodsMap;
}

/**
 * Fetches shipping methods for all shipments in the basket
 * @param context - Loader context
 * @param basket - Shopping basket
 * @returns Promise that resolves to a map of shipment ID to shipping methods
 */
async function fetchShippingMethodsForAllShipments(
    context: LoaderFunctionArgs['context'],
    basket: ShopperBasketsV2.schemas['Basket'] | null
): Promise<Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']>> {
    return fetchShippingMethodsMapForBasket(context, basket);
}

/**
 * Fetches detailed product information for all items in a shopping basket.
 *
 * This function retrieves product details including images, pricing, and attributes
 * for each product in the basket. It creates a mapping from basket item IDs to
 * their corresponding product data for efficient lookup in the UI.
 * @returns Promise that resolves to a mapping of item IDs to product data.
 */
async function fetchProductsInBasket(
    context: LoaderFunctionArgs['context'],
    productItems: ShopperBasketsV2.schemas['ProductItem'][]
): Promise<Record<string, ShopperProducts.schemas['Product']>> {
    // Main product IDs from basket items
    const ids = productItems.map((item) => item.productId ?? '').filter(Boolean);
    if (!ids.length) {
        return {};
    }

    const currency = (context.get(siteContext) as SiteContext).currency;

    // Route through the shared helper so baskets with more than SCAPI's 24-ID getProducts
    // limit still load: fetchProductsByIds dedupes the IDs, splits them into batches of
    // SCAPI_GET_PRODUCTS_MAX_IDS, and merges the responses.
    const products = (
        await fetchProductsByIds(context, ids, {
            allImages: true,
            perPricebook: true,
            ...(currency ? { currency } : {}),
        })
    ).reduce(
        (acc, product) => {
            acc[product.id] = product;
            return acc;
        },
        {} as Record<string, ShopperProducts.schemas['Product']>
    );

    // Create productsByItemId mapping
    const productsByItemId: Record<string, ShopperProducts.schemas['Product']> = {};
    productItems.forEach((productItem) => {
        if (productItem?.productId && productItem.itemId && products[productItem.productId]) {
            productsByItemId[productItem.itemId] = products[productItem.productId];
        }
    });
    return productsByItemId;
}

/**
 * Fetches promotion details for promotion IDs found in basket items, shipping items, and order-level adjustments.
 * @returns Promise that resolves to a mapping of promotion IDs to promotion data
 */
async function fetchPromotionsForBasket(
    context: LoaderFunctionArgs['context'],
    productItems: ShopperBasketsV2.schemas['ProductItem'][],
    basket?: ShopperBasketsV2.schemas['Basket'] | null
): Promise<Record<string, ShopperPromotions.schemas['Promotion']>> {
    const promotionIds = new Set<string>();

    // Extract promotion IDs from product items (top-level and shipment-level; SCAPI may only set priceAdjustments on shipment items)
    productItems.forEach((productItem) => {
        if (productItem.priceAdjustments?.length) {
            productItem.priceAdjustments.forEach((adjustment) => {
                if (adjustment.promotionId) {
                    promotionIds.add(adjustment.promotionId);
                }
            });
        }
    });
    if (basket?.shipments?.length) {
        basket.shipments.forEach((shipment) => {
            const shipmentItems = shipment.productItems as ShopperBasketsV2.schemas['ProductItem'][] | undefined;
            shipmentItems?.forEach((productItem) => {
                if (productItem.priceAdjustments?.length) {
                    productItem.priceAdjustments.forEach((adjustment) => {
                        if (adjustment.promotionId) {
                            promotionIds.add(adjustment.promotionId);
                        }
                    });
                }
            });
        });
    }

    // Extract promotion IDs from shipping items
    if (basket?.shippingItems?.length) {
        basket.shippingItems.forEach((shippingItem) => {
            if (shippingItem.priceAdjustments?.length) {
                shippingItem.priceAdjustments.forEach((adjustment) => {
                    if (adjustment.promotionId) {
                        promotionIds.add(adjustment.promotionId);
                    }
                });
            }
        });
    }

    // Extract promotion IDs from order-level price adjustments
    if (basket?.priceAdjustments && Array.isArray(basket.priceAdjustments)) {
        basket.priceAdjustments.forEach((adjustment) => {
            if (adjustment.promotionId) {
                promotionIds.add(adjustment.promotionId);
            }
        });
    }

    if (promotionIds.size === 0) {
        return {};
    }

    const clients = createApiClients(context);
    const promotionIdsArray = Array.from(promotionIds);

    // API limit: maximum 50 promotion IDs per request. We batch if needed
    const MAX_PROMOTION_IDS_PER_REQUEST = 50;
    const promotions: Record<string, ShopperPromotions.schemas['Promotion']> = {};

    for (let i = 0; i < promotionIdsArray.length; i += MAX_PROMOTION_IDS_PER_REQUEST) {
        const batchIds = promotionIdsArray.slice(i, i + MAX_PROMOTION_IDS_PER_REQUEST);

        try {
            const { data: promotionsData } = await clients.shopperPromotions.getPromotions({
                params: {
                    query: {
                        ids: batchIds,
                    },
                },
            });

            if (promotionsData?.data) {
                promotionsData.data.forEach((promotion) => {
                    if (promotion.id) {
                        promotions[promotion.id] = promotion;
                    }
                });
            }
        } catch (error) {
            const logger = getLogger(context);
            logger.error('Checkout: failed to fetch promotions batch', { error });
        }
    }

    return promotions;
}

/**
 * Returns the canonical email for an authenticated customer.
 * Prefers customer.email; falls back to customer.login only when it contains "@"
 * (social login users have a provider ID like "Google-123..." as their login, not an email).
 */
function getCustomerCanonicalEmail(customerProfile: CustomerProfile): string | undefined {
    return (
        customerProfile.customer?.email ||
        (customerProfile.customer?.login?.includes('@') ? customerProfile.customer.login : undefined)
    );
}

/**
 * Determines if a basket needs to be prefilled with customer data.
 * For registered shoppers, we prefill:
 * - Email: always when missing (customer.login is the email)
 * - Shipping address: when missing and customer has saved addresses
 */
function shouldPrefillBasket(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    customerProfile: CustomerProfile
): boolean {
    if (!customerProfile?.customer) {
        return false;
    }

    const basketEmail = basket?.customerInfo?.email;
    const missingOrInvalidEmail = !basketEmail || !basketEmail.includes('@');
    const basketCustomerId = basket?.customerInfo?.customerId;
    const profileCustomerId = customerProfile.customer.customerId;
    const customerMismatch = !basketCustomerId || basketCustomerId !== profileCustomerId;
    const missingShippingAddress = isAddressEmpty(basket?.shipments?.[0]?.shippingAddress);
    const hasShippingAddressNoMethod =
        !missingShippingAddress && basket?.shipments?.[0]?.shippingAddress && !basket?.shipments?.[0]?.shippingMethod;
    const missingPaymentInstrument = !basket?.paymentInstruments?.[0];
    const hasAddresses = !!customerProfile.addresses?.length;

    // Guest email persists on basket.customerInfo.email even after login merges basket into the registered
    // customer. Reconcile so the order and confirmation show the signed-in customer's email.
    const customerEmail = getCustomerCanonicalEmail(customerProfile);
    const emailMismatch = !!customerEmail && !!basketEmail && basketEmail.toLowerCase() !== customerEmail.toLowerCase();

    /**
     * Baskets are tied to the session (e.g. usid), not to a customer ID. customerMismatch may happen when:
     * Guest adds items → basket has no customerId. User logs in. We need to update the basket with the logged-in customer.
     * basketCustomerId !== profileCustomerId: basket has a different customerId (e.g. before merge completed).
     */
    if (missingOrInvalidEmail || customerMismatch || emailMismatch) {
        return true;
    }
    if (missingShippingAddress && hasAddresses) {
        return true;
    }
    if (hasShippingAddressNoMethod) {
        return true;
    }
    if (missingPaymentInstrument) {
        return true;
    }
    return false;
}

/**
 * Ensures the first shipment carries a valid delivery shipping method, filtering out BOPIS.
 *
 * @param applicableShippingMethods Optional pre-fetched list.
 */
export async function applyDefaultShippingMethod(
    context: LoaderFunctionArgs['context'],
    basket: ShopperBasketsV2.schemas['Basket'],
    applicableShippingMethods?: ShopperBasketsV2.schemas['ShippingMethod'][]
): Promise<ShopperBasketsV2.schemas['Basket']> {
    const logger = getLogger(context);
    const shipment = basket.shipments?.[0];
    if (!shipment?.shippingAddress || isAddressEmpty(shipment.shippingAddress) || !basket.basketId) {
        return basket;
    }

    const shipmentId = shipment.shipmentId ?? 'me';
    const basketId = basket.basketId;

    try {
        const methods =
            applicableShippingMethods ??
            (await getShippingMethodsForShipment(context, basketId, shipmentId))?.applicableShippingMethods ??
            [];

        let candidateMethods = methods;
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        // Don't use pickup methods as the auto-default.
        candidateMethods = candidateMethods.filter((method) => !isPickupShippingMethod(method));
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        if (candidateMethods.length === 0) {
            return basket;
        }

        const currentMethodId = shipment.shippingMethod?.id;
        const stillValid = currentMethodId && candidateMethods.some((m) => m.id === currentMethodId);
        if (stillValid) {
            return basket;
        }

        const clients = createApiClients(context);
        const { data } = await clients.shopperBasketsV2.updateShippingMethodForShipment({
            params: { path: { basketId, shipmentId } },
            body: { id: candidateMethods[0].id },
        });
        updateBasketResource(context, data);
        return data;
    } catch (err) {
        logger.error('Checkout: could not set default shipping method on basket', { basketId, error: err });
        return basket;
    }
}

/**
 * Initializes basket for returning customer with saved data
 */
export async function initializeBasketForReturningCustomer(
    context: LoaderFunctionArgs['context'],
    customerProfile: CustomerProfile
): Promise<ShopperBasketsV2.schemas['Basket'] | null> {
    const logger = getLogger(context);
    try {
        // Load the basket if it's not already loaded
        const basket = (await getBasket(context)).current ?? undefined;

        if (!basket || !customerProfile?.customer) {
            return null;
        }
        if (!basket.basketId) {
            return null;
        }

        const basketId = basket.basketId;
        logger.debug('Checkout: prefilling basket for returning customer', { basketId });

        const clients = createApiClients(context);
        let updatedBasket = basket;
        let hasUpdates = false;

        const basketCustomerId = updatedBasket.customerInfo?.customerId;
        const profileCustomerId = customerProfile.customer.customerId;
        const basketEmail = updatedBasket.customerInfo?.email;

        // For social login users, customer.login is the provider's external ID (e.g. "Google-123...")
        // not an email. Prefer customer.email, fall back to login only if it contains "@".
        const customerEmail = getCustomerCanonicalEmail(customerProfile);

        // Guest email persists on basket.customerInfo.email even after login merges basket into the registered
        // customer. Reconcile so the order and confirmation show the signed-in customer's email.
        const emailMismatch =
            !!customerEmail && !!basketEmail && basketEmail.toLowerCase() !== customerEmail.toLowerCase();
        const needsCustomerAssociation =
            !basketEmail ||
            !basketEmail.includes('@') ||
            !basketCustomerId ||
            basketCustomerId !== profileCustomerId ||
            emailMismatch;

        if (needsCustomerAssociation && customerEmail) {
            const { data } = await clients.shopperBasketsV2.updateCustomerForBasket({
                params: {
                    path: {
                        basketId,
                    },
                },
                body: { email: customerEmail },
            });
            updatedBasket = data;
            updateBasketResource(context, updatedBasket);
            hasUpdates = true;
        }

        // Set shipping address if missing
        const shippingAddress = updatedBasket.shipments?.[0]?.shippingAddress;
        if (isAddressEmpty(shippingAddress) && customerProfile.addresses?.length > 0) {
            const defaultAddress =
                customerProfile.addresses.find((addr) => addr.preferred) || customerProfile.addresses[0];

            if (defaultAddress) {
                const newShippingAddress = {
                    firstName: defaultAddress.firstName,
                    lastName: defaultAddress.lastName,
                    address1: defaultAddress.address1,
                    address2: defaultAddress.address2 || undefined,
                    city: defaultAddress.city,
                    stateCode: defaultAddress.stateCode,
                    postalCode: defaultAddress.postalCode,
                    countryCode: defaultAddress.countryCode || 'US',
                    phone:
                        defaultAddress.phone ||
                        customerProfile.customer.phoneMobile ||
                        customerProfile.customer.phoneHome ||
                        undefined,
                };

                const { data } = await clients.shopperBasketsV2.updateShippingAddressForShipment({
                    params: {
                        path: {
                            basketId,
                            shipmentId: updatedBasket.shipments?.[0]?.shipmentId || 'me',
                        },
                    },
                    body: newShippingAddress,
                });
                updatedBasket = data;
                updateBasketResource(context, updatedBasket);
                hasUpdates = true;
            }
        }

        // Set billing address if missing or only a stub (e.g. phone-only patch from contact step)
        const shippingAddrForBilling = updatedBasket.shipments?.[0]?.shippingAddress;
        if (
            (!updatedBasket.billingAddress || isOrderBillingAddressIncomplete(updatedBasket.billingAddress)) &&
            hasUpdates &&
            shippingAddrForBilling &&
            !isAddressEmpty(shippingAddrForBilling)
        ) {
            try {
                const { data } = await clients.shopperBasketsV2.updateBillingAddressForBasket({
                    params: {
                        path: {
                            basketId,
                        },
                    },
                    body: {
                        firstName: shippingAddrForBilling.firstName,
                        lastName: shippingAddrForBilling.lastName,
                        address1: shippingAddrForBilling.address1,
                        address2: shippingAddrForBilling.address2,
                        city: shippingAddrForBilling.city,
                        stateCode: shippingAddrForBilling.stateCode,
                        postalCode: shippingAddrForBilling.postalCode,
                        countryCode: shippingAddrForBilling.countryCode,
                        phone: shippingAddrForBilling.phone,
                    },
                });
                updatedBasket = data;
                updateBasketResource(context, updatedBasket);
            } catch (error) {
                logger.error('Checkout: billing address prefill failed', { basketId, error });
            }
        }

        // Set default shipping method when shipment has address but no method (e.g. after prefill or address-only update)
        if (updatedBasket.shipments?.[0]?.shippingAddress && !updatedBasket.shipments?.[0]?.shippingMethod) {
            updatedBasket = await applyDefaultShippingMethod(context, updatedBasket);
        }

        // Add saved payment instrument if available
        if (!updatedBasket.paymentInstruments?.[0] && customerProfile.paymentInstruments?.length > 0) {
            try {
                const { addPaymentInstrumentToBasket } = await import('@/lib/api/basket.server');
                const { getPaymentMethodsFromCustomer } = await import('@/lib/customer/profile-utils');

                const { normalizeCardType } = await import('@/lib/payment/payment-utils');
                const savedPaymentMethods = getPaymentMethodsFromCustomer(customerProfile);
                if (savedPaymentMethods.length > 0) {
                    const preferredMethod =
                        savedPaymentMethods.find((method) => method.preferred) || savedPaymentMethods[0];
                    const normalizedCardType = normalizeCardType(preferredMethod.cardType);

                    if (!normalizedCardType || normalizedCardType === 'unknown') {
                        logger.warn('Checkout: invalid card type for saved payment method', {
                            cardType: preferredMethod.cardType,
                        });
                        // Skip auto-applying invalid payment method to avoid incomplete basket payment
                    } else {
                        const paymentInfo = {
                            paymentMethodId: 'CREDIT_CARD',
                            amount: updatedBasket.orderTotal ?? 0,
                            paymentCard: {
                                cardType: normalizedCardType,
                                holder: preferredMethod.cardholderName || '',
                                maskedNumber: preferredMethod.maskedNumber || '',
                                expirationMonth: preferredMethod.expirationMonth,
                                expirationYear: preferredMethod.expirationYear,
                            },
                        };

                        updatedBasket = await addPaymentInstrumentToBasket(context, basketId, paymentInfo);
                        updateBasketResource(context, updatedBasket);
                    }
                }
            } catch (error) {
                logger.error('Checkout: failed to prefill saved payment instrument', { basketId, error });
            }
        }

        return updatedBasket;
    } catch (error) {
        logger.error('Checkout: returning customer basket initialization failed', { error });
        return null;
    }
}

/**
 * Handles basket prefill for returning customers and returns updated basket
 *
 * IMPORTANT: Returns the updated basket (not the profile) because:
 * - The clientLoader needs the updated basket to check for shipping address
 * - After prefill, basket.shipments[0].shippingAddress is populated
 * - This allows clientLoader to correctly determine if shipping methods should be fetched
 *
 * @param context - Client loader context
 * @param profile - Customer profile with saved addresses/payment methods
 * @returns Updated basket with prefilled data, or current basket if no prefill needed
 */
async function handleBasketPrefill(
    context: LoaderFunctionArgs['context'],
    profile: CustomerProfile
): Promise<ShopperBasketsV2.schemas['Basket'] | null> {
    try {
        // Load the basket if it's not already loaded.
        const currentBasket = (await getBasket(context)).current ?? undefined;

        const needsPrefill = shouldPrefillBasket(currentBasket, profile);

        if (needsPrefill) {
            // Prefill basket with customer's saved data (email, shipping address, billing address)
            return await initializeBasketForReturningCustomer(context, profile);
        }

        // No prefill needed - basket already has required data
        return currentBasket ?? null;
    } catch (error) {
        const logger = getLogger(context);
        logger.error('Checkout: basket prefill failed, returning current basket', { error });
        return (await getBasket(context)).current ?? null;
    }
}

/** Checkout route loader: fetches basket, profile (registered), shipping methods; returns promises for streaming. */
export async function loader(args: LoaderFunctionArgs): Promise<CheckoutPageData> {
    try {
        const { context } = args;
        const logger = getLogger(context);
        const userIsRegistered = isRegisteredCustomer(context);
        const session = getAuth(context);
        // Both reads hit the same single data-store partition; run them concurrently so the gcp read adds no marginal
        // latency to the login-preferences read the loader already does. Neither preference is critical to rendering
        // the basket, so each degrades to its default on failure.
        const [{ emailVerificationEnabled }, gcpApiKey] = await Promise.all([
            getLoginPreferences(context).catch((error) => {
                logger.error('Checkout: login preferences read failed, defaulting email verification off', { error });
                return LOGIN_PREFERENCES_FALLBACK;
            }),
            getGcpApiKeyLazy(context).catch((error) => {
                logger.error('Checkout: GCP API key read failed, disabling address autocomplete', { error });
                return '';
            }),
        ]);
        logger.debug('Checkout: loader starting', { userIsRegistered, hasBasket: Boolean(session.customerId) });

        const basket = (await getBasket(context)).current ?? null;

        const productMapPromise = fetchProductsInBasket(context, basket?.productItems ?? []);

        const promotionsPromise = fetchPromotionsForBasket(context, basket?.productItems ?? [], basket);

        let shippingDefaultSet = Promise.resolve(undefined);
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        let storesByStoreId: Map<string, ShopperStores.schemas['Store']> | undefined;
        const pickupShipment = getPickupShipment(basket);
        if (pickupShipment) {
            storesByStoreId = await fetchStoresForBasket(context, basket);
            const store = storesByStoreId?.get(pickupShipment.c_fromStoreId as string);
            if (store) {
                const addressAlreadySet = isPickupAddressSet(pickupShipment.shippingAddress, store, context);

                if (!addressAlreadySet) {
                    shippingDefaultSet = setAddressAndMethodForPickup(
                        context,
                        basket?.basketId,
                        store,
                        pickupShipment.shipmentId
                    ).then((updatedBasket) => {
                        updateBasketResource(context, updatedBasket);
                        return Promise.resolve(undefined);
                    });
                }
            }
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        if (userIsRegistered && session.customerId) {
            const customerProfile = await getCustomerProfileForCheckout(context, session.customerId).catch((error) => {
                logger.error('Checkout: failed to fetch customer profile', { error });
                return null;
            });

            if (customerProfile) {
                // Stream the prefill mutations rather than awaiting them so first paint doesn't block on the
                // ECOM basket calculation.
                const prefilledBasketPromise = shippingDefaultSet
                    .then(() => handleBasketPrefill(context, customerProfile))
                    .catch((error) => {
                        logger.error('Checkout: prefill stream failed, degrading to loader basket', { error });
                        return null;
                    });
                const shippingMethodsMapPromise = prefilledBasketPromise
                    .then((prefilled) => fetchShippingMethodsForAllShipments(context, prefilled ?? basket))
                    .catch((error) => {
                        logger.error('Checkout: shipping methods stream failed, degrading to empty map', { error });
                        return {};
                    });

                return {
                    basket,
                    prefilledBasket: prefilledBasketPromise,
                    shippingMethodsMap: shippingMethodsMapPromise,
                    customerProfile: Promise.resolve(customerProfile),
                    productMap: productMapPromise,
                    promotions: promotionsPromise,
                    isRegisteredCustomer: true,
                    emailVerificationEnabled,
                    gcpApiKey,
                    shippingDefaultSet,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    ...(storesByStoreId && { storesByStoreId }),
                };
            }
        }

        const shippingMethodsMapPromise = fetchShippingMethodsForAllShipments(context, basket);

        return {
            basket,
            shippingMethodsMap: shippingMethodsMapPromise,
            productMap: productMapPromise,
            promotions: promotionsPromise,
            isRegisteredCustomer: false,
            emailVerificationEnabled,
            gcpApiKey,
            shippingDefaultSet,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            ...(storesByStoreId && { storesByStoreId }),
        };
    } catch (error) {
        const logger = getLogger(args.context);
        logger.error('Checkout: loader failed', { error });
        return {
            basket: null,
            shippingMethodsMap: Promise.resolve({}),
            productMap: Promise.resolve({}),
            promotions: Promise.resolve({}),
            isRegisteredCustomer: false,
        };
    }
}
