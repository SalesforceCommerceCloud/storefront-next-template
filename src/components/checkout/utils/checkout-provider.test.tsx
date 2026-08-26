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
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopperBasketsV2 } from '@/scapi';
import CheckoutProvider from './checkout-context';
import { CHECKOUT_STEPS } from './checkout-context-types';
import { useCheckoutContext } from '@/hooks/use-checkout';

// An addressed basket carrying a shipping method but no payment → computeStepFromBasket = PAYMENT.
const addressedBasketWithMethod = {
    customerInfo: { email: 'guest@example.com' },
    productItems: [{ productId: 'p1', quantity: 1 }],
    shipments: [
        {
            shipmentId: 'me',
            shippingAddress: {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Anytown',
                stateCode: 'CA',
                postalCode: '12345',
                countryCode: 'US',
            },
            shippingMethod: { id: 'standard', name: 'Standard' },
        },
    ],
    paymentInstruments: [],
} as unknown as ShopperBasketsV2.schemas['Basket'];

// An addressed basket with NO shipping method → still needs a method → computeStepFromBasket
// stays at SHIPPING_OPTIONS.
const addressedBasketWithoutMethod = {
    customerInfo: { email: 'guest@example.com' },
    productItems: [{ productId: 'p1', quantity: 1 }],
    shipments: [
        {
            shipmentId: 'me',
            shippingAddress: {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Anytown',
                stateCode: 'CA',
                postalCode: '12345',
                countryCode: 'US',
            },
        },
    ],
    paymentInstruments: [],
} as unknown as ShopperBasketsV2.schemas['Basket'];

let mockBasket: ShopperBasketsV2.schemas['Basket'] | undefined = addressedBasketWithMethod;
vi.mock('@/providers/basket', () => ({
    useBasket: () => mockBasket,
}));

// Mutable so tests can toggle computeStepFromBasket between PAYMENT (false) and SHIPPING_OPTIONS (true).
let mockNeedsShippingMethods = false;
vi.mock('./checkout-distribution', () => ({
    getShipmentDistribution: () => ({
        hasPickupItems: false,
        hasDeliveryItems: true,
        enableMultiAddress: false,
        hasMultipleDeliveryAddresses: false,
        hasUnaddressedDeliveryItems: false,
        needsShippingMethods: mockNeedsShippingMethods,
        hasEmptyShipments: false,
        isDeliveryProductItem: () => true,
        deliveryShipments: [],
    }),
}));

// Capture the live context so tests can inspect the resolved step.
let ctx: ReturnType<typeof useCheckoutContext>;
function Capture() {
    ctx = useCheckoutContext();
    return null;
}

function renderProvider() {
    return render(
        <CheckoutProvider shippingDefaultSet={Promise.resolve(undefined)}>
            <Capture />
        </CheckoutProvider>
    );
}

describe('CheckoutProvider guest entry clamp', () => {
    beforeEach(() => {
        mockBasket = addressedBasketWithMethod;
        mockNeedsShippingMethods = false;
    });

    it('holds a guest at Shipping Options on entry even when the basket computes to Payment', () => {
        // A guest whose basket computes to PAYMENT is capped at SHIPPING_OPTIONS to confirm.
        renderProvider();
        expect(ctx.computedStep).toBe(CHECKOUT_STEPS.PAYMENT);
        expect(ctx.step).toBe(CHECKOUT_STEPS.SHIPPING_OPTIONS);
    });

    it('holds a guest at Shipping Options on entry when no method is applied', () => {
        mockBasket = addressedBasketWithoutMethod;
        mockNeedsShippingMethods = true;
        renderProvider();
        expect(ctx.computedStep).toBe(CHECKOUT_STEPS.SHIPPING_OPTIONS);
        expect(ctx.step).toBe(CHECKOUT_STEPS.SHIPPING_OPTIONS);
    });

    it('keeps a guest on Shipping Options when a method is applied while they are there (does not open Payment)', () => {
        // Guest "both open" case: a method applied while the guest sits on Shipping Options must not
        // advance them to Payment.
        mockBasket = addressedBasketWithoutMethod;
        mockNeedsShippingMethods = true;
        renderProvider();
        expect(ctx.step).toBe(CHECKOUT_STEPS.SHIPPING_OPTIONS);

        // A valid method is now applied → computedStep recomputes to PAYMENT.
        act(() => {
            mockBasket = addressedBasketWithMethod;
            mockNeedsShippingMethods = false;
            ctx.setSavedAddresses([]); // trigger a re-render without leaving edit mode
        });
        expect(ctx.computedStep).toBe(CHECKOUT_STEPS.PAYMENT);
        expect(ctx.step).toBe(CHECKOUT_STEPS.SHIPPING_OPTIONS);
    });
});
