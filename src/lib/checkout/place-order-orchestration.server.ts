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
 * Internal building blocks for placing an order. The default `action.place-order`
 * and the storefront's `place-order-prepare` / `place-order-finalize` routes call
 * these. Not extension API - signatures may change between releases as the
 * routes evolve.
 *
 *   - validatePlaceOrderPreconditions
 *   - calculateBasketForOrder
 *   - syncPaymentInstrumentAmount
 *   - saveProfilePaymentMethod / saveProfileAddressesAndPhone (or the
 *     combined wrapper saveCheckoutDataToProfile)
 *   - finalizeOrderSuccess
 */

import type { ActionFunctionArgs } from 'react-router';
import type { ShopperBasketsV2, ShopperOrders } from '@/scapi';
import { calculateBasket, getBasketCurrency, updatePaymentInstrumentInBasket } from '@/lib/api/basket.server';
import { destroyBasket, updateBasketResource } from '@/middlewares/basket.server';
import {
    savePaymentMethodToCustomerViaOrder,
    type PaymentInstrumentForSave,
    saveShippingAddressToCustomer,
    saveBillingAddressToCustomer,
    updateCustomerContactInfo,
} from '@/lib/api/customer.server';
import { getAddressBookFromCustomer, getPaymentMethodsFromCustomer } from '@/lib/customer/profile-utils';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import { buildUrlFromContext } from '@/lib/url.server';
import { routes, routeHref } from '@/route-paths';

type ActionContext = ActionFunctionArgs['context'];
type Basket = ShopperBasketsV2.schemas['Basket'];
type Order = ShopperOrders.schemas['Order'];

// ─── Validation ─────────────────────────────────────────────────────────────────

/** Result of `validatePlaceOrderPreconditions`. Discriminated on `ok` so callers can narrow. */
export type PreconditionResult =
    | { ok: true; basket: Basket & { basketId: string } }
    | { ok: false; response: Response };

/**
 * Validates the basket has the minimum information `createOrder` requires:
 * basketId, customerInfo.email, and a shippingAddress + shippingMethod on
 * every non-empty shipment. Returns a discriminated union: on success the
 * basket is narrowed to a non-null `basketId`. Does NOT validate billing
 * address or payment instruments (caller's concern).
 */
export function validatePlaceOrderPreconditions(basket: Basket | null | undefined): PreconditionResult {
    const fail = (code: (typeof ErrorCode)[keyof typeof ErrorCode], message: string): PreconditionResult => ({
        ok: false,
        response: Response.json(
            {
                success: false,
                error: createActionError({ code, message }),
                step: 'placeOrder',
            },
            { status: 400 }
        ),
    });

    if (!basket || !basket.basketId) {
        return fail(ErrorCode.NOT_FOUND, 'No active basket found');
    }
    if (!basket.customerInfo?.email) {
        return fail(ErrorCode.REQUIRED_FIELD, 'Customer email is required');
    }

    // Build shipmentId → item count map so we only validate shipments that
    // actually have items. SCAPI permits empty shipments to exist on a basket
    // (e.g. multiship with one not-yet-populated shipment), but `createOrder`
    // doesn't require addresses on them.
    const shipmentItemCounts = new Map<string, number>();
    if (basket.productItems) {
        for (const item of basket.productItems) {
            if (item.shipmentId) {
                shipmentItemCounts.set(item.shipmentId, (shipmentItemCounts.get(item.shipmentId) || 0) + 1);
            }
        }
    }

    const nonEmptyShipments = (basket.shipments || []).filter((shipment) => {
        if (!shipment.shipmentId) return false;
        return (shipmentItemCounts.get(shipment.shipmentId) || 0) > 0;
    });

    for (const shipment of nonEmptyShipments) {
        if (!shipment.shippingAddress) {
            return fail(ErrorCode.REQUIRED_FIELD, 'Shipping address is required');
        }
        if (!shipment.shippingMethod) {
            return fail(ErrorCode.REQUIRED_FIELD, 'Shipping method is required');
        }
    }

    return { ok: true, basket: basket as Basket & { basketId: string } };
}

// ─── Calculate ──────────────────────────────────────────────────────────────────

/**
 * Refresh basket totals via SCAPI `calculateBasket` and update the local
 * basket resource. Returns the calculated basket. Throws on SCAPI failure;
 * the calling action's try/catch converts to a 500.
 */
export async function calculateBasketForOrder(context: ActionContext, basket: Basket): Promise<Basket> {
    if (!basket.basketId) {
        throw new Error('calculateBasketForOrder: basket has no basketId');
    }
    const currency = getBasketCurrency(context, basket);
    const calculated = await calculateBasket(context, basket.basketId, currency);
    updateBasketResource(context, calculated);
    return calculated;
}

/**
 * Reconcile payment instruments to `orderTotal` before `createOrder`.
 * Call between `calculateBasketForOrder` and `createOrder` so a recalculation
 * (promo, shipping, items) after instruments were attached still sums to the basket.
 *
 * Only an instrument with a `paymentCard` is updated. Its amount becomes
 * `orderTotal` minus the other instruments. An instrument without a `paymentCard`
 * is not updated.
 */
export async function syncPaymentInstrumentAmount(context: ActionContext, basket: Basket): Promise<Basket> {
    if (!basket.basketId) {
        throw new Error('syncPaymentInstrumentAmount: basket has no basketId');
    }
    const instruments = basket.paymentInstruments ?? [];
    if (basket.orderTotal == null) return basket;

    // Last card instrument. A reverse scan keeps the ES2022 lib target (`findLast` is ES2023).
    let card: (typeof instruments)[number] | undefined;
    for (let i = instruments.length - 1; i >= 0; i -= 1) {
        const instrument = instruments[i];
        if (instrument.paymentCard && instrument.paymentInstrumentId) {
            card = instrument;
            break;
        }
    }
    if (!card?.paymentInstrumentId) return basket;

    const otherSum = instruments.reduce(
        (sum, instrument) => (instrument === card ? sum : sum + (instrument.amount ?? 0)),
        0
    );
    const newAmount = basket.orderTotal - otherSum;
    const logger = getLogger(context);
    logger.info('[Checkout] payment-instrument amount sync', {
        basketId: basket.basketId,
        paymentInstrumentId: card.paymentInstrumentId,
        previousAmount: card.amount,
        newAmount,
    });

    const updated = await updatePaymentInstrumentInBasket(context, basket.basketId, card.paymentInstrumentId, {
        amount: newAmount,
    });
    updateBasketResource(context, updated);
    return updated;
}

// ─── Profile saves ──────────────────────────────────────────────────────────────

/** Payment-domain input. Extensions owning their own payment lifecycle skip this helper. */
export interface SaveProfilePaymentMethodInput {
    /** Order returned by `createOrder`. SCAPI infers the customer from the order. */
    order: Order;
    /** Existing profile for dedupe. `null` runs every save. */
    profileSnapshot: CustomerProfile | null;
    /** Shopper opted into "create account at checkout". */
    registeredViaCheckout: boolean;
    /** Registered shopper whose profile is still empty (treated like a fresh registration). */
    isNewlyRegisteredWithEmptyProfile: boolean;
    /** Existing customer who checked "Save payment for future use". */
    savePaymentToProfile: boolean;
}

/** Checkout-domain input. Address + phone saves apply regardless of payment method. */
export interface SaveProfileAddressesAndPhoneInput {
    customerId: string;
    order: Order;
    profileSnapshot: CustomerProfile | null;
    registeredViaCheckout: boolean;
    isNewlyRegisteredWithEmptyProfile: boolean;
    /** Save billing only when the shopper picked "use a different billing address". */
    useDifferentBilling: boolean;
    /**
     * Phone to save as `phoneHome`. Caller resolves it: basket transfers during OTP
     * registration can strip phone from the billing address, so the raw form field
     * is preserved.
     */
    contactPhone: string | undefined;
}

/** Combined input for the wrapper `saveCheckoutDataToProfile`. */
export type SaveCheckoutDataInput = SaveProfilePaymentMethodInput & SaveProfileAddressesAndPhoneInput;

/**
 * Save the order's payment method to the customer wallet. Two branches:
 *
 *   - Registering shoppers and registered shoppers with empty profiles: skip
 *     when the card already matches a saved entry by last4 + expiry, otherwise
 *     save with one retry on failure.
 *   - Existing customer who ticked "save for future use": save unconditionally
 *     (no dedupe), single attempt.
 *
 * Catches per-save failures so a single SCAPI hiccup doesn't strand the order.
 */
export async function saveProfilePaymentMethod(
    context: ActionContext,
    input: SaveProfilePaymentMethodInput
): Promise<void> {
    const logger = getLogger(context);
    const { order, profileSnapshot, savePaymentToProfile } = input;
    if (!order.orderNo) {
        logger.error('[Checkout] saveProfilePaymentMethod: order has no orderNo');
        return;
    }
    const orderNo = order.orderNo;
    const instrument = order.paymentInstruments?.[0] as PaymentInstrumentForSave | undefined;
    if (!instrument) return;

    const shouldPopulate = input.registeredViaCheckout || input.isNewlyRegisteredWithEmptyProfile;
    if (shouldPopulate) {
        if (orderPaymentMatchesSavedProfile(instrument, profileSnapshot ?? undefined)) return;
        await retryProfileSave(
            () => savePaymentMethodToCustomerViaOrder(context, orderNo, instrument),
            'payment method save',
            logger
        );
        return;
    }
    if (savePaymentToProfile) {
        // Existing customer opted into "save for future use": single attempt; leave addresses alone.
        try {
            await savePaymentMethodToCustomerViaOrder(context, orderNo, instrument);
        } catch (error) {
            logger.error('[Checkout] saveProfilePaymentMethod: failed to save payment method', { error });
        }
    }
}

/**
 * Save shipping/billing addresses and phone to the customer profile. Runs only
 * for registering or empty-profile shoppers; deduplicates against the supplied
 * snapshot so re-checkouts don't create duplicate address-book entries.
 */
export async function saveProfileAddressesAndPhone(
    context: ActionContext,
    input: SaveProfileAddressesAndPhoneInput
): Promise<void> {
    const logger = getLogger(context);
    const {
        customerId,
        order,
        profileSnapshot,
        registeredViaCheckout,
        isNewlyRegisteredWithEmptyProfile,
        useDifferentBilling,
        contactPhone,
    } = input;
    if (!order.orderNo) {
        logger.error('[Checkout] saveProfileAddressesAndPhone: order has no orderNo');
        return;
    }
    const shouldPopulate = registeredViaCheckout || isNewlyRegisteredWithEmptyProfile;
    if (!shouldPopulate) return;

    const existingAddresses = getAddressBookFromCustomer(profileSnapshot ?? undefined);
    const savePromises: Promise<void>[] = [];

    if (order.shipments?.[0]?.shippingAddress) {
        const shippingAddress = order.shipments[0].shippingAddress;
        const alreadySaved = existingAddresses.some((address) => isSameAddress(address, shippingAddress));
        if (!alreadySaved) {
            savePromises.push(
                retryProfileSave(
                    () => saveShippingAddressToCustomer(context, customerId, shippingAddress, true),
                    'shipping address save',
                    logger
                )
            );
        }
    }

    if (useDifferentBilling && order.billingAddress) {
        const billingAddress = order.billingAddress;
        const alreadySaved = existingAddresses.some((address) => isSameAddress(address, billingAddress));
        if (!alreadySaved) {
            savePromises.push(
                retryProfileSave(
                    () => saveBillingAddressToCustomer(context, customerId, billingAddress),
                    'billing address save',
                    logger
                )
            );
        }
    }

    if (contactPhone && !profilePhoneMatchesContact(profileSnapshot?.customer, contactPhone)) {
        savePromises.push(
            retryProfileSave(
                () => updateCustomerContactInfo(context, customerId, { phone: contactPhone }),
                'phone save',
                logger
            )
        );
    }

    if (savePromises.length > 0) {
        // Await so the action's request lifecycle doesn't end before SCAPI calls complete.
        await Promise.all(savePromises);
    }
}

/**
 * Convenience wrapper that runs both payment-method and address/phone saves.
 * Default storefront `action.place-order` uses this; extensions that own
 * payment can call `saveProfileAddressesAndPhone` alone.
 */
export async function saveCheckoutDataToProfile(context: ActionContext, input: SaveCheckoutDataInput): Promise<void> {
    await Promise.all([saveProfilePaymentMethod(context, input), saveProfileAddressesAndPhone(context, input)]);
}

// ─── Order finalization ─────────────────────────────────────────────────────────

/** Set when the shopper registered during checkout: adds account-creation query params. */
export interface RegistrationMetadata {
    email: string;
}

/**
 * Destroy the local basket cache and build the order-confirmation URL.
 * Caller wraps the URL in a `redirect()` (server flow) or returns it as
 * JSON (client-driven flow).
 */
export function finalizeOrderSuccess(
    context: ActionContext,
    options: { orderNo: string; registration?: RegistrationMetadata }
): string {
    destroyBasket(context);

    let url = buildUrlFromContext(routeHref(routes.orderConfirmation, { orderNo: options.orderNo }), context);

    if (options.registration?.email) {
        const params = new URLSearchParams({
            accountCreated: 'true',
            email: options.registration.email,
            autoLoggedIn: 'true',
        });
        url += `?${params.toString()}`;
    }

    return url;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const PROFILE_SAVE_RETRY_DELAY_MS = 500;

/**
 * Retry wrapper for profile save operations that return a boolean success
 * flag. Newly registered accounts can have brief SCAPI auth propagation
 * delays causing the first call to fail; one retry after a short delay
 * resolves most cases.
 */
async function retryProfileSave(
    fn: () => Promise<boolean>,
    label: string,
    logger: ReturnType<typeof getLogger>
): Promise<void> {
    const ok = await fn();
    if (ok) return;
    logger.warn(`[Checkout] ${label} failed, retrying once`);
    await new Promise((resolve) => setTimeout(resolve, PROFILE_SAVE_RETRY_DELAY_MS));
    const retried = await fn();
    if (!retried) {
        logger.error(`[Checkout] ${label} failed after retry`);
    }
}

const normalizeAddressField = (value: string | undefined): string => (value ?? '').trim().toLowerCase();
const normalizePhoneDigits = (phone: string | undefined): string => (phone ?? '').replace(/\D/g, '');

interface AddressLike {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    stateCode?: string;
    postalCode?: string;
    countryCode?: string;
}

function isSameAddress(a: AddressLike | undefined, b: AddressLike | undefined): boolean {
    if (!a || !b) return false;
    return (
        normalizeAddressField(a.firstName) === normalizeAddressField(b.firstName) &&
        normalizeAddressField(a.lastName) === normalizeAddressField(b.lastName) &&
        normalizeAddressField(a.address1) === normalizeAddressField(b.address1) &&
        normalizeAddressField(a.address2) === normalizeAddressField(b.address2) &&
        normalizeAddressField(a.city) === normalizeAddressField(b.city) &&
        normalizeAddressField(a.stateCode) === normalizeAddressField(b.stateCode) &&
        normalizeAddressField(a.postalCode) === normalizeAddressField(b.postalCode) &&
        normalizeAddressField(a.countryCode) === normalizeAddressField(b.countryCode)
    );
}

function profilePhoneMatchesContact(customer: CustomerProfile['customer'] | undefined, contactPhone: string): boolean {
    if (!customer) return false;
    const incoming = normalizePhoneDigits(contactPhone);
    // Require at least 7 digits to avoid false matches on partial inputs.
    if (incoming.length < 7) return false;
    return (
        normalizePhoneDigits(customer.phoneHome) === incoming ||
        normalizePhoneDigits(customer.phoneMobile) === incoming ||
        normalizePhoneDigits(customer.phoneBusiness) === incoming
    );
}

/**
 * True when the order's payment card matches an existing saved wallet entry
 * (last4 + expiry month/year). Used to suppress duplicate saves when the
 * shopper checks out with a card already on file.
 */
function orderPaymentMatchesSavedProfile(
    instrument: PaymentInstrumentForSave,
    profile: CustomerProfile | undefined
): boolean {
    if (!profile?.paymentInstruments?.length) return false;
    const saved = getPaymentMethodsFromCustomer(profile);
    if (!saved?.length) return false;
    const card = instrument.paymentCard;
    if (!card) return false;

    // Try numberLastDigits first (the explicit field), fall back to maskedNumber's
    // trailing digits for SCAPI responses that omit numberLastDigits.
    let orderLast4 = card.numberLastDigits?.replace(/\D/g, '').slice(-4);
    if (!orderLast4 && card.maskedNumber) {
        orderLast4 = card.maskedNumber.replace(/\D/g, '').slice(-4);
    }
    if (!orderLast4 || orderLast4.length < 4) return false;

    return saved.some((pm) => {
        const pmLast4 = pm.maskedNumber?.replace(/\D/g, '').slice(-4) || '';
        return (
            pmLast4 === orderLast4 &&
            pm.expirationMonth === card.expirationMonth &&
            pm.expirationYear === card.expirationYear
        );
    });
}
