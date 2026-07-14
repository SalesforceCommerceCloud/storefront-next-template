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
import { CHECKOUT_STEPS, type CheckoutStep, type CustomerProfile } from './checkout-context-types';
import type { ShipmentDistribution } from './checkout-distribution';

function hasValidPaymentCard(
    paymentInstrument: ShopperBasketsV2.schemas['OrderPaymentInstrument'] | undefined
): boolean {
    if (!paymentInstrument || paymentInstrument.paymentMethodId !== 'CREDIT_CARD') {
        return false;
    }

    // For saved payment methods, check if paymentInstrumentId exists
    if (paymentInstrument.paymentInstrumentId) {
        return true;
    }

    // For new payment methods, check if all required card fields are present
    const card = paymentInstrument.paymentCard;
    return !!(card?.cardType && card?.expirationMonth && card?.expirationYear && card?.maskedNumber);
}

export function computeFinalStepForReturningCustomer(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    customerProfile: CustomerProfile,
    shipmentDistribution: ShipmentDistribution
): CheckoutStep | null {
    if (!customerProfile?.customer || !basket) {
        return null;
    }

    // For returning registered customers, determine step based on customer profile data
    // since the basket will be prefilled during checkout initialization
    const hasCustomerEmail = customerProfile.customer.login;
    const hasCustomerAddresses = customerProfile.addresses && customerProfile.addresses.length > 0;
    const hasCustomerPaymentMethods =
        customerProfile.paymentInstruments && customerProfile.paymentInstruments.length > 0;
    // allow checkout even if payment section complete even without SPM
    const paymentInstrument = basket.paymentInstruments?.[0];
    const paymentValid = paymentInstrument && hasValidPaymentCard(paymentInstrument);

    // Guard against premature advancement while the basket is still catching up to the customer
    // profile. With prefill now streamed (see `prefilledBasket` in the checkout loader), the
    // initial paint sees the pre-prefill basket: no address, no payment. Once `PrefillSync` publishes the
    // post-prefill basket the provider recomputes and this branch takes over.
    const basketHasAddress =
        !shipmentDistribution.hasDeliveryItems || !shipmentDistribution.hasUnaddressedDeliveryItems;

    // If customer has complete profile (email, addresses, payment methods), go straight to review/place order
    if (hasCustomerEmail && hasCustomerAddresses && (hasCustomerPaymentMethods || paymentValid)) {
        if (!basketHasAddress || !paymentValid) return null;
        return CHECKOUT_STEPS.PLACE_ORDER;
    }

    // If customer has email and addresses but no saved payment methods, go to payment step
    if (hasCustomerEmail && hasCustomerAddresses && !hasCustomerPaymentMethods) {
        if (!basketHasAddress) return null;
        return CHECKOUT_STEPS.PAYMENT;
    }

    // If customer has email but no addresses, go to shipping address (unless basket already has one)
    if (hasCustomerEmail && !hasCustomerAddresses) {
        return shipmentDistribution.hasUnaddressedDeliveryItems ? CHECKOUT_STEPS.SHIPPING_ADDRESS : null;
    }

    // If customer has no email (shouldn't happen for registered users), go to contact info
    if (!hasCustomerEmail) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    // Fallback to review if we can't determine the step
    return CHECKOUT_STEPS.PLACE_ORDER;
}

/**
 * Handle navigation to appropriate next checkout step from Pickup.
 * - If there are delivery items + pickup, advance to shipping address.
 * - If no delivery items (pickup only), advance to payment.
 *
 * @param isPickup - basket has at least one pickup shipment
 * @param hasDeliveryItems - basket has at least one delivery shipment/items
 * @param goToStep - callback for advancing step
 * @param STEPS - checkout steps
 * @param t - translation
 * @returns { label, onClick }
 */
export function handlePickupContinueAction(
    isPickup: boolean,
    hasDeliveryItems: boolean,
    goToStep: (step: CheckoutStep) => void,
    STEPS: typeof CHECKOUT_STEPS,
    t: (key: string) => string
): { label: string; onClick: () => void } {
    if (isPickup && hasDeliveryItems) {
        return {
            label: t('checkout.pickUp.continueToShipping'),
            onClick: () => goToStep(STEPS.SHIPPING_ADDRESS as CheckoutStep),
        };
    } else {
        return {
            label: t('checkout.pickUp.continueToPayment'),
            onClick: () => goToStep(STEPS.PAYMENT as CheckoutStep),
        };
    }
}

export function computeStepFromBasket(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    shipmentDistribution: ShipmentDistribution
): CheckoutStep {
    if (!basket) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    if (!basket.customerInfo?.email) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    if (shipmentDistribution.hasDeliveryItems) {
        if (shipmentDistribution.hasUnaddressedDeliveryItems) {
            return CHECKOUT_STEPS.SHIPPING_ADDRESS;
        }

        if (shipmentDistribution.needsShippingMethods) {
            return CHECKOUT_STEPS.SHIPPING_OPTIONS;
        }
    }

    const paymentInstrument = basket.paymentInstruments?.[0];
    if (!paymentInstrument || !hasValidPaymentCard(paymentInstrument)) {
        return CHECKOUT_STEPS.PAYMENT;
    }

    return CHECKOUT_STEPS.PLACE_ORDER;
}

export function getCompletedSteps(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    shipmentDistribution: ShipmentDistribution,
    currentStep: CheckoutStep
): CheckoutStep[] {
    const completed: CheckoutStep[] = [];

    if (!basket) {
        return completed;
    }

    const hasEmail =
        basket.customerInfo?.email ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('checkoutEmail'));
    if (hasEmail && currentStep > CHECKOUT_STEPS.CONTACT_INFO) {
        completed.push(CHECKOUT_STEPS.CONTACT_INFO);
    }

    if (shipmentDistribution.hasDeliveryItems) {
        if (!shipmentDistribution.hasUnaddressedDeliveryItems && currentStep > CHECKOUT_STEPS.SHIPPING_ADDRESS) {
            completed.push(CHECKOUT_STEPS.SHIPPING_ADDRESS);
        }

        if (!shipmentDistribution.needsShippingMethods && currentStep > CHECKOUT_STEPS.SHIPPING_OPTIONS) {
            completed.push(CHECKOUT_STEPS.SHIPPING_OPTIONS);
        }
    }

    const paymentInstrument = basket.paymentInstruments?.[0];
    if (paymentInstrument && hasValidPaymentCard(paymentInstrument) && currentStep > CHECKOUT_STEPS.PAYMENT) {
        completed.push(CHECKOUT_STEPS.PAYMENT);
    }

    return completed;
}

function shipmentHasValidMethod(result: ShopperBasketsV2.schemas['ShippingMethodResult'] | undefined): boolean {
    const methods = result?.applicableShippingMethods;
    return (
        !!methods &&
        methods.length > 0 &&
        methods.some((m) => !!m.id && !!m.name && typeof m.price === 'number' && !Number.isNaN(m.price))
    );
}

/**
 * Returns true when the shipping-methods map contains at least one valid, selectable method
 * across all shipments. A method is valid when it has an id, a name, and a numeric price.
 * Used to block advancing past the Shipping Address step when the submitted address yields
 * no deliverable options.
 */
export function hasAnyValidShippingMethod(
    map: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> | undefined
): boolean {
    if (!map) return false;
    return Object.values(map).some(shipmentHasValidMethod);
}

/**
 * Returns true when every shipment present in the map has at least one valid, selectable method.
 * Used by the route to detect the "address entered but no deliverable methods" state on refresh,
 * which pins the shopper to Shipping Address. In a multi-shipment basket, even one shipment
 * lacking methods means the order cannot be completed.
 *
 * **Empty/undefined map returns `true`** (vacuous truth). This matters because the checkout
 * loader skips revalidation after a step action and the loader's initial `shippingMethodsMap`
 * is `{}` for a basket without an address yet; we MUST NOT treat that empty map as evidence of
 * failure, or we would pin the shopper to Shipping Address before they have even submitted one.
 * A populated map with at least one shipment lacking methods returns `false`.
 */
export function hasValidShippingMethodForEveryShipment(
    map: Record<string, ShopperBasketsV2.schemas['ShippingMethodResult']> | undefined
): boolean {
    if (!map) return true;
    return Object.values(map).every(shipmentHasValidMethod);
}

export function shouldAutoAdvanceForReturningCustomer(
    isRegisteredCustomer: boolean,
    customerProfile?: CustomerProfile
): boolean {
    if (!isRegisteredCustomer || !customerProfile) {
        return false;
    }

    const hasAddresses = customerProfile.addresses && customerProfile.addresses.length > 0;
    const hasPaymentMethods = customerProfile.paymentInstruments && customerProfile.paymentInstruments.length > 0;

    return hasAddresses && hasPaymentMethods;
}
