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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShopperBasketsV2, ShopperOrders } from '@/scapi';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';
import {
    validatePlaceOrderPreconditions,
    calculateBasketForOrder,
    syncPaymentInstrumentAmount,
    saveCheckoutDataToProfile,
    saveProfilePaymentMethod,
    saveProfileAddressesAndPhone,
    finalizeOrderSuccess,
    type SaveCheckoutDataInput,
    type SaveProfilePaymentMethodInput,
    type SaveProfileAddressesAndPhoneInput,
} from './place-order-orchestration.server';

type Basket = ShopperBasketsV2.schemas['Basket'];
type Order = ShopperOrders.schemas['Order'];

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const calculateBasketMock = vi.fn();
const updateBasketResourceMock = vi.fn();
const getBasketCurrencyMock = vi.fn();
const destroyBasketMock = vi.fn();
const updatePaymentInstrumentMock = vi.fn();

const savePaymentMethodMock = vi.fn();
const saveShippingAddressMock = vi.fn();
const saveBillingAddressMock = vi.fn();
const updateContactInfoMock = vi.fn();

vi.mock('@/lib/api/basket.server', () => ({
    calculateBasket: (...args: unknown[]) => calculateBasketMock(...args),
    getBasketCurrency: (...args: unknown[]) => getBasketCurrencyMock(...args),
    updatePaymentInstrumentInBasket: (...args: unknown[]) => updatePaymentInstrumentMock(...args),
}));

vi.mock('@/middlewares/basket.server', () => ({
    updateBasketResource: (...args: unknown[]) => updateBasketResourceMock(...args),
    destroyBasket: (...args: unknown[]) => destroyBasketMock(...args),
}));

vi.mock('@/lib/url.server', () => ({
    buildUrlFromContext: (path: string) => `/site${path}`,
}));

vi.mock('@/route-paths', () => ({
    routes: { orderConfirmation: '/order-confirmation/:orderNo' },
    routeHref: (pattern: string, params: Record<string, string>) =>
        pattern.replace(/:(\w+)/g, (_, key: string) => params[key] ?? `:${key}`),
}));

vi.mock('@/lib/api/customer.server', () => ({
    savePaymentMethodToCustomerViaOrder: (...args: unknown[]) => savePaymentMethodMock(...args),
    saveShippingAddressToCustomer: (...args: unknown[]) => saveShippingAddressMock(...args),
    saveBillingAddressToCustomer: (...args: unknown[]) => saveBillingAddressMock(...args),
    updateCustomerContactInfo: (...args: unknown[]) => updateContactInfoMock(...args),
}));

vi.mock('@/lib/customer/profile-utils', () => ({
    getAddressBookFromCustomer: (profile?: { addresses?: unknown[] }) => profile?.addresses ?? [],
    getPaymentMethodsFromCustomer: (profile?: { paymentInstruments?: unknown[] }) => profile?.paymentInstruments ?? [],
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock('@/lib/action-error-helpers.server', () => ({
    createActionError: (input: { code?: string; message?: string }) => ({ code: input.code, message: input.message }),
}));

vi.mock('@/lib/error-codes', () => ({
    ErrorCode: { NOT_FOUND: 'NOT_FOUND', REQUIRED_FIELD: 'REQUIRED_FIELD', OPERATION_FAILED: 'OPERATION_FAILED' },
}));

// Bare `as never` cast: none of the helpers under test inspect the context shape.
const ctx = {} as never;

beforeEach(() => {
    calculateBasketMock.mockReset();
    updateBasketResourceMock.mockReset();
    getBasketCurrencyMock.mockReset();
    destroyBasketMock.mockReset();
    updatePaymentInstrumentMock.mockReset();
    savePaymentMethodMock.mockReset();
    saveShippingAddressMock.mockReset();
    saveBillingAddressMock.mockReset();
    updateContactInfoMock.mockReset();
});

// ─── validatePlaceOrderPreconditions ────────────────────────────────────────────

describe('validatePlaceOrderPreconditions', () => {
    const validShipment = {
        shipmentId: 'me',
        shippingAddress: { firstName: 'A', lastName: 'B' },
        shippingMethod: { id: 'std' },
    } as unknown as ShopperBasketsV2.schemas['Shipment'];

    const validBasket: Basket = {
        basketId: 'basket-1',
        customerInfo: { email: 'a@b.test' },
        productItems: [{ shipmentId: 'me' } as ShopperBasketsV2.schemas['ProductItem']],
        shipments: [validShipment],
    } as Basket;

    it('returns ok=true with the narrowed basket when all preconditions pass', () => {
        const result = validatePlaceOrderPreconditions(validBasket);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.basket.basketId).toBe('basket-1');
        }
    });

    it.each([null, undefined])('returns 400 NOT_FOUND when basket is %s', async (basket) => {
        const result = validatePlaceOrderPreconditions(basket as Basket | null | undefined);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            const body = await result.response.json();
            expect(body.error.code).toBe('NOT_FOUND');
            expect(body.error.message).toBe('No active basket found');
            expect(body.step).toBe('placeOrder');
        }
    });

    it('returns 400 NOT_FOUND when basket has no basketId', async () => {
        const result = validatePlaceOrderPreconditions({ ...validBasket, basketId: undefined } as Basket);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const body = await result.response.json();
            expect(body.error.code).toBe('NOT_FOUND');
        }
    });

    it('returns 400 REQUIRED_FIELD when customer email is missing', async () => {
        const result = validatePlaceOrderPreconditions({ ...validBasket, customerInfo: { email: '' } } as Basket);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const body = await result.response.json();
            expect(body.error.code).toBe('REQUIRED_FIELD');
            expect(body.error.message).toBe('Customer email is required');
        }
    });

    it('returns 400 when a non-empty shipment has no shipping address', async () => {
        const result = validatePlaceOrderPreconditions({
            ...validBasket,
            shipments: [{ shipmentId: 'me', shippingMethod: { id: 'std' } } as ShopperBasketsV2.schemas['Shipment']],
        } as Basket);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const body = await result.response.json();
            expect(body.error.message).toBe('Shipping address is required');
        }
    });

    it('returns 400 when a non-empty shipment has no shipping method', async () => {
        const result = validatePlaceOrderPreconditions({
            ...validBasket,
            shipments: [
                {
                    shipmentId: 'me',
                    shippingAddress: { firstName: 'A' },
                } as ShopperBasketsV2.schemas['Shipment'],
            ],
        } as Basket);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const body = await result.response.json();
            expect(body.error.message).toBe('Shipping method is required');
        }
    });

    it('passes when an empty (no-items) shipment is missing address/method', () => {
        // Empty shipment (no productItems reference its id) must not trigger a
        // 400 even though it has no address/method. Multi-ship scenarios depend
        // on this.
        const result = validatePlaceOrderPreconditions({
            ...validBasket,
            shipments: [validShipment, { shipmentId: 'unused' } as ShopperBasketsV2.schemas['Shipment']],
        } as Basket);
        expect(result.ok).toBe(true);
    });

    it('passes when basket has no shipments at all', () => {
        // Pickup-only or digital-goods baskets may have zero shipments; the
        // validator should not require any.
        const result = validatePlaceOrderPreconditions({ ...validBasket, shipments: [] } as Basket);
        expect(result.ok).toBe(true);
    });
});

// ─── calculateBasketForOrder ────────────────────────────────────────────────────

describe('calculateBasketForOrder', () => {
    it('calculates with the basket currency and updates the local resource', async () => {
        getBasketCurrencyMock.mockReturnValue('USD');
        calculateBasketMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 99 });

        const calculated = await calculateBasketForOrder(ctx, { basketId: 'basket-1' } as Basket);

        expect(getBasketCurrencyMock).toHaveBeenCalledWith(ctx, { basketId: 'basket-1' });
        expect(calculateBasketMock).toHaveBeenCalledWith(ctx, 'basket-1', 'USD');
        expect(updateBasketResourceMock).toHaveBeenCalledWith(ctx, { basketId: 'basket-1', orderTotal: 99 });
        expect(calculated).toEqual({ basketId: 'basket-1', orderTotal: 99 });
    });

    it('throws if basket has no basketId (defensive: caller should have validated)', async () => {
        await expect(calculateBasketForOrder(ctx, {} as Basket)).rejects.toThrow('basket has no basketId');
        expect(calculateBasketMock).not.toHaveBeenCalled();
    });

    it('propagates errors from calculateBasket without updating the local resource', async () => {
        getBasketCurrencyMock.mockReturnValue('USD');
        calculateBasketMock.mockRejectedValue(new Error('SCAPI is down'));

        await expect(calculateBasketForOrder(ctx, { basketId: 'basket-1' } as Basket)).rejects.toThrow('SCAPI is down');
        expect(updateBasketResourceMock).not.toHaveBeenCalled();
    });
});

// ─── syncPaymentInstrumentAmount ────────────────────────────────────────────────

describe('syncPaymentInstrumentAmount', () => {
    const basketWithInstrument = (orderTotal: number, amount: number | undefined): Basket =>
        ({
            basketId: 'basket-1',
            orderTotal,
            paymentInstruments: [
                {
                    paymentInstrumentId: 'pi-1',
                    paymentMethodId: 'CREDIT_CARD',
                    amount,
                    paymentCard: { cardType: 'Visa' },
                },
            ],
        }) as unknown as Basket;

    it('sends only the amount field (PATCH semantics: SCAPI merges into the existing instrument)', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 50 });

        const result = await syncPaymentInstrumentAmount(ctx, basketWithInstrument(50, 100));

        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-1', { amount: 50 });
        expect(updateBasketResourceMock).toHaveBeenCalledWith(ctx, { basketId: 'basket-1', orderTotal: 50 });
        expect(result).toEqual({ basketId: 'basket-1', orderTotal: 50 });
    });

    it('writes the card amount even when it already equals the order total', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 50 });

        await syncPaymentInstrumentAmount(ctx, basketWithInstrument(50, 50));

        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-1', { amount: 50 });
    });

    it('no-op when basket has no payment instrument', async () => {
        const basket = { basketId: 'basket-1', orderTotal: 50 } as Basket;

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    const basketWithInstruments = (
        orderTotal: number,
        paymentInstruments: Array<{
            paymentInstrumentId: string;
            paymentMethodId: string;
            amount: number;
            paymentCard?: { cardType: string };
        }>
    ): Basket =>
        ({
            basketId: 'basket-1',
            orderTotal,
            paymentInstruments,
        }) as unknown as Basket;

    it('patches the card when an instrument without a paymentCard was applied after it', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 110 });
        const basket = basketWithInstruments(110, [
            {
                paymentInstrumentId: 'pi-card',
                paymentMethodId: 'CREDIT_CARD',
                amount: 100,
                paymentCard: { cardType: 'Visa' },
            },
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 30 },
        ]);

        await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).toHaveBeenCalledOnce();
        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-card', { amount: 80 });
    });

    it('patches only the last instrument to the unpaid balance', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 110 });
        const basket = basketWithInstruments(110, [
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 20 },
            { paymentInstrumentId: 'pi-other-2', paymentMethodId: 'OTHER', amount: 30 },
            {
                paymentInstrumentId: 'pi-card',
                paymentMethodId: 'CREDIT_CARD',
                amount: 10,
                paymentCard: { cardType: 'Visa' },
            },
        ]);

        await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).toHaveBeenCalledOnce();
        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-card', { amount: 60 });
    });

    it('leaves earlier cards fixed and patches only the last card', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 110 });
        const basket = basketWithInstruments(110, [
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 20 },
            { paymentInstrumentId: 'pi-other-2', paymentMethodId: 'OTHER', amount: 30 },
            {
                paymentInstrumentId: 'pi-card-1',
                paymentMethodId: 'CREDIT_CARD',
                amount: 40,
                paymentCard: { cardType: 'Visa' },
            },
            {
                paymentInstrumentId: 'pi-card-2',
                paymentMethodId: 'CREDIT_CARD',
                amount: 5,
                paymentCard: { cardType: 'Visa' },
            },
        ]);

        await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).toHaveBeenCalledOnce();
        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-card-2', { amount: 20 });
    });

    it('no-op when the only instrument has no paymentCard and already equals the order total', async () => {
        const basket = basketWithInstruments(50, [
            { paymentInstrumentId: 'pi-other', paymentMethodId: 'OTHER', amount: 50 },
        ]);

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    it('no-op when every instrument has no paymentCard and the amounts already cover the order total', async () => {
        const basket = basketWithInstruments(50, [
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 20 },
            { paymentInstrumentId: 'pi-other-2', paymentMethodId: 'OTHER', amount: 30 },
        ]);

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    it('does not patch an instrument with no paymentCard when its amount differs from the order total', async () => {
        const basket = basketWithInstruments(50, [
            { paymentInstrumentId: 'pi-other', paymentMethodId: 'OTHER', amount: 40 },
        ]);

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    it('reduces only the last card when the total drops and earlier instruments still fit', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 70 });
        const basket = basketWithInstruments(70, [
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 20 },
            { paymentInstrumentId: 'pi-other-2', paymentMethodId: 'OTHER', amount: 30 },
            {
                paymentInstrumentId: 'pi-card',
                paymentMethodId: 'CREDIT_CARD',
                amount: 80,
                paymentCard: { cardType: 'Visa' },
            },
        ]);

        await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).toHaveBeenCalledOnce();
        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-card', { amount: 20 });
    });

    it('still patches the card when instruments without a paymentCard exceed the order total', async () => {
        updatePaymentInstrumentMock.mockResolvedValue({ basketId: 'basket-1', orderTotal: 70 });
        const basket = basketWithInstruments(70, [
            { paymentInstrumentId: 'pi-other-1', paymentMethodId: 'OTHER', amount: 50 },
            { paymentInstrumentId: 'pi-other-2', paymentMethodId: 'OTHER', amount: 40 },
            {
                paymentInstrumentId: 'pi-card',
                paymentMethodId: 'CREDIT_CARD',
                amount: 30,
                paymentCard: { cardType: 'Visa' },
            },
        ]);

        await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).toHaveBeenCalledOnce();
        expect(updatePaymentInstrumentMock).toHaveBeenCalledWith(ctx, 'basket-1', 'pi-card', { amount: -20 });
    });

    it('no-op when the payment instrument has no paymentInstrumentId', async () => {
        const basket = {
            basketId: 'basket-1',
            orderTotal: 50,
            paymentInstruments: [{ paymentMethodId: 'CREDIT_CARD' }],
        } as unknown as Basket;

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    it('no-op when basket has no orderTotal (precondition check should have caught this)', async () => {
        const basket = {
            basketId: 'basket-1',
            paymentInstruments: [{ paymentInstrumentId: 'pi-1', amount: 0 }],
        } as unknown as Basket;

        const result = await syncPaymentInstrumentAmount(ctx, basket);

        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
        expect(result).toBe(basket);
    });

    it('throws when basket has no basketId (defensive: caller should have validated)', async () => {
        await expect(syncPaymentInstrumentAmount(ctx, {} as Basket)).rejects.toThrow('basket has no basketId');
        expect(updatePaymentInstrumentMock).not.toHaveBeenCalled();
    });

    it('propagates SCAPI errors so the caller can fail place-order before createOrder', async () => {
        updatePaymentInstrumentMock.mockRejectedValue(new Error('SCAPI is down'));

        await expect(syncPaymentInstrumentAmount(ctx, basketWithInstrument(50, 100))).rejects.toThrow('SCAPI is down');
        expect(updateBasketResourceMock).not.toHaveBeenCalled();
    });
});

// ─── saveCheckoutDataToProfile ──────────────────────────────────────────────────

describe('saveCheckoutDataToProfile', () => {
    const baseInput = (): SaveCheckoutDataInput => ({
        customerId: 'cust-1',
        order: {
            orderNo: '00001234',
            paymentInstruments: [
                {
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Visa',
                        numberLastDigits: '4242',
                        expirationMonth: 12,
                        expirationYear: 2030,
                    },
                },
            ],
            shipments: [{ shippingAddress: { firstName: 'A', lastName: 'B', city: 'NYC' } }],
            billingAddress: { firstName: 'A', lastName: 'B', city: 'Boston' },
        } as unknown as Order,
        registeredViaCheckout: true,
        isNewlyRegisteredWithEmptyProfile: false,
        savePaymentToProfile: false,
        useDifferentBilling: false,
        contactPhone: '5551234567',
        profileSnapshot: null,
    });

    it('does nothing and returns early when order has no orderNo', async () => {
        const input = baseInput();
        input.order = { orderNo: '' } as Order;
        await saveCheckoutDataToProfile(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
        expect(saveShippingAddressMock).not.toHaveBeenCalled();
        expect(saveBillingAddressMock).not.toHaveBeenCalled();
        expect(updateContactInfoMock).not.toHaveBeenCalled();
    });

    it('does nothing when neither registration nor save-payment is requested', async () => {
        savePaymentMethodMock.mockResolvedValue(true);
        const input = baseInput();
        input.registeredViaCheckout = false;
        input.isNewlyRegisteredWithEmptyProfile = false;
        input.savePaymentToProfile = false;

        await saveCheckoutDataToProfile(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
        expect(saveShippingAddressMock).not.toHaveBeenCalled();
    });

    describe('registered-via-checkout (new account population)', () => {
        beforeEach(() => {
            savePaymentMethodMock.mockResolvedValue(true);
            saveShippingAddressMock.mockResolvedValue(true);
            saveBillingAddressMock.mockResolvedValue(true);
            updateContactInfoMock.mockResolvedValue(true);
        });

        it('saves payment, shipping address, and phone (no billing without useDifferentBilling)', async () => {
            await saveCheckoutDataToProfile(ctx, baseInput());

            expect(savePaymentMethodMock).toHaveBeenCalledWith(
                ctx,
                '00001234',
                expect.objectContaining({ paymentCard: expect.objectContaining({ numberLastDigits: '4242' }) })
            );
            expect(saveShippingAddressMock).toHaveBeenCalledWith(
                ctx,
                'cust-1',
                expect.objectContaining({ city: 'NYC' }),
                true
            );
            expect(updateContactInfoMock).toHaveBeenCalledWith(ctx, 'cust-1', { phone: '5551234567' });
            // billing address should NOT be saved without useDifferentBilling
            expect(saveBillingAddressMock).not.toHaveBeenCalled();
        });

        it('saves billing address only when useDifferentBilling is true', async () => {
            const input = baseInput();
            input.useDifferentBilling = true;
            await saveCheckoutDataToProfile(ctx, input);
            expect(saveBillingAddressMock).toHaveBeenCalledWith(
                ctx,
                'cust-1',
                expect.objectContaining({ city: 'Boston' })
            );
        });

        it('skips payment-method save when an identical card is already on the wallet', async () => {
            // Wallet already has a Visa ending in 4242 / exp 12-2030; the order
            // card matches, so we should NOT re-save and create a duplicate.
            const input = baseInput();
            input.profileSnapshot = {
                customer: { customerId: 'cust-1' },
                addresses: [],
                paymentInstruments: [
                    {
                        maskedNumber: '************4242',
                        expirationMonth: 12,
                        expirationYear: 2030,
                    },
                ],
                preferredShippingAddress: undefined,
                preferredBillingAddress: undefined,
            } as unknown as CustomerProfile;
            await saveCheckoutDataToProfile(ctx, input);
            expect(savePaymentMethodMock).not.toHaveBeenCalled();
            // Other saves still happen
            expect(saveShippingAddressMock).toHaveBeenCalled();
        });

        it('skips shipping-address save when an identical address already exists in the address book', async () => {
            const input = baseInput();
            input.profileSnapshot = {
                customer: { customerId: 'cust-1' },
                addresses: [
                    // Same address (case-insensitive, whitespace-trimmed)
                    { firstName: ' a ', lastName: 'B', city: 'nyc' },
                ],
                paymentInstruments: [],
                preferredShippingAddress: undefined,
                preferredBillingAddress: undefined,
            } as unknown as CustomerProfile;
            await saveCheckoutDataToProfile(ctx, input);
            expect(saveShippingAddressMock).not.toHaveBeenCalled();
        });

        it('skips phone save when profile already has a matching number (different formatting OK)', async () => {
            const input = baseInput();
            input.contactPhone = '(555) 123-4567';
            input.profileSnapshot = {
                customer: { customerId: 'cust-1', phoneHome: '555-123-4567' },
                addresses: [],
                paymentInstruments: [],
                preferredShippingAddress: undefined,
                preferredBillingAddress: undefined,
            } as unknown as CustomerProfile;
            await saveCheckoutDataToProfile(ctx, input);
            expect(updateContactInfoMock).not.toHaveBeenCalled();
        });

        it('does not false-match a too-short profile phone against a substantive contactPhone', async () => {
            // The dedupe `profilePhoneMatchesContact` rejects inputs below 7
            // digits to avoid pathological matches (e.g. shopper enters "12345"
            // and we wrongly conclude any profile with a phone matches).
            // Behavior: when the profile has only a too-short phone, the
            // substantive contactPhone IS saved (no spurious dedupe match).
            const input = baseInput();
            input.contactPhone = '5551234567';
            input.profileSnapshot = {
                customer: { customerId: 'cust-1', phoneHome: '12345' },
                addresses: [],
                paymentInstruments: [],
                preferredShippingAddress: undefined,
                preferredBillingAddress: undefined,
            } as unknown as CustomerProfile;
            await saveCheckoutDataToProfile(ctx, input);
            expect(updateContactInfoMock).toHaveBeenCalledWith(ctx, 'cust-1', { phone: '5551234567' });
        });

        it('retries a failed save once after a short delay', async () => {
            vi.useFakeTimers();
            savePaymentMethodMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
            const promise = saveCheckoutDataToProfile(ctx, baseInput());
            // First attempt fires immediately; advance through the retry delay.
            await vi.advanceTimersByTimeAsync(500);
            await promise;
            expect(savePaymentMethodMock).toHaveBeenCalledTimes(2);
            vi.useRealTimers();
        });
    });

    describe('isNewlyRegisteredWithEmptyProfile (treated like registered-via-checkout)', () => {
        beforeEach(() => {
            savePaymentMethodMock.mockResolvedValue(true);
            saveShippingAddressMock.mockResolvedValue(true);
            updateContactInfoMock.mockResolvedValue(true);
        });

        it('saves the same things as registered-via-checkout', async () => {
            const input = baseInput();
            input.registeredViaCheckout = false;
            input.isNewlyRegisteredWithEmptyProfile = true;
            await saveCheckoutDataToProfile(ctx, input);
            expect(savePaymentMethodMock).toHaveBeenCalled();
            expect(saveShippingAddressMock).toHaveBeenCalled();
            expect(updateContactInfoMock).toHaveBeenCalled();
        });
    });

    describe('opted-in payment save (existing customer)', () => {
        it('saves only the payment method, not addresses or phone', async () => {
            savePaymentMethodMock.mockResolvedValue(true);
            const input = baseInput();
            input.registeredViaCheckout = false;
            input.isNewlyRegisteredWithEmptyProfile = false;
            input.savePaymentToProfile = true;

            await saveCheckoutDataToProfile(ctx, input);

            expect(savePaymentMethodMock).toHaveBeenCalledTimes(1);
            expect(saveShippingAddressMock).not.toHaveBeenCalled();
            expect(saveBillingAddressMock).not.toHaveBeenCalled();
            expect(updateContactInfoMock).not.toHaveBeenCalled();
        });

        it('catches and logs payment save errors without re-throwing', async () => {
            savePaymentMethodMock.mockRejectedValue(new Error('SCAPI 500'));
            const input = baseInput();
            input.registeredViaCheckout = false;
            input.isNewlyRegisteredWithEmptyProfile = false;
            input.savePaymentToProfile = true;

            // Must not reject: order is already placed; logging the failure
            // is the right outcome, throwing would strand the shopper.
            await expect(saveCheckoutDataToProfile(ctx, input)).resolves.toBeUndefined();
        });
    });

    it('handles missing paymentInstruments gracefully', async () => {
        const input = baseInput();
        input.order = { ...input.order, paymentInstruments: [] } as Order;
        await saveCheckoutDataToProfile(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
    });

    it('handles missing shipments gracefully', async () => {
        savePaymentMethodMock.mockResolvedValue(true);
        const input = baseInput();
        input.order = { ...input.order, shipments: undefined } as Order;
        await saveCheckoutDataToProfile(ctx, input);
        expect(saveShippingAddressMock).not.toHaveBeenCalled();
        // Other saves still happen
        expect(savePaymentMethodMock).toHaveBeenCalled();
    });
});

// ─── finalizeOrderSuccess ──────────────────────────────────────────────────────

describe('finalizeOrderSuccess', () => {
    it('destroys the basket and returns the prefixed confirmation URL', () => {
        const url = finalizeOrderSuccess(ctx, { orderNo: 'O-123' });
        expect(destroyBasketMock).toHaveBeenCalledOnce();
        expect(url).toBe('/site/order-confirmation/O-123');
    });

    it('appends registration query params when registration metadata is supplied', () => {
        const url = finalizeOrderSuccess(ctx, { orderNo: 'O-123', registration: { email: 'a@b.test' } });
        expect(url).toContain('/site/order-confirmation/O-123?');
        expect(url).toContain('accountCreated=true');
        expect(url).toContain('email=a%40b.test');
        expect(url).toContain('autoLoggedIn=true');
    });

    it('omits query params when registration is undefined', () => {
        const url = finalizeOrderSuccess(ctx, { orderNo: 'O-123' });
        expect(url).not.toContain('?');
    });
});

// ─── saveProfilePaymentMethod ───────────────────────────────────────────────────

describe('saveProfilePaymentMethod', () => {
    const basePaymentInput = (): SaveProfilePaymentMethodInput => ({
        order: {
            orderNo: 'O-1',
            paymentInstruments: [
                {
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: {
                        cardType: 'Visa',
                        numberLastDigits: '4242',
                        expirationMonth: 12,
                        expirationYear: 2030,
                    },
                },
            ],
        } as unknown as Order,
        profileSnapshot: null,
        registeredViaCheckout: true,
        isNewlyRegisteredWithEmptyProfile: false,
        savePaymentToProfile: false,
    });

    it('does nothing when order has no paymentInstruments', async () => {
        const input = basePaymentInput();
        input.order = { orderNo: 'O-1' } as Order;
        await saveProfilePaymentMethod(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
    });

    it('saves on registered-via-checkout and retries on failure', async () => {
        savePaymentMethodMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        await saveProfilePaymentMethod(ctx, basePaymentInput());
        expect(savePaymentMethodMock).toHaveBeenCalledTimes(2);
    });

    it('skips when card already matches a saved wallet entry', async () => {
        const input = basePaymentInput();
        input.profileSnapshot = {
            paymentInstruments: [{ maskedNumber: '4242', expirationMonth: 12, expirationYear: 2030 }],
        } as unknown as CustomerProfile;
        await saveProfilePaymentMethod(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
    });

    it('saves once (no retry) for opted-in existing-customer save', async () => {
        savePaymentMethodMock.mockResolvedValue(true);
        const input = basePaymentInput();
        input.registeredViaCheckout = false;
        input.savePaymentToProfile = true;
        await saveProfilePaymentMethod(ctx, input);
        expect(savePaymentMethodMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when neither registration nor savePaymentToProfile is set', async () => {
        const input = basePaymentInput();
        input.registeredViaCheckout = false;
        input.savePaymentToProfile = false;
        await saveProfilePaymentMethod(ctx, input);
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
    });
});

// ─── saveProfileAddressesAndPhone ───────────────────────────────────────────────

describe('saveProfileAddressesAndPhone', () => {
    const baseAddressInput = (): SaveProfileAddressesAndPhoneInput => ({
        customerId: 'cust-1',
        order: {
            orderNo: 'O-1',
            shipments: [{ shippingAddress: { firstName: 'A', lastName: 'B', city: 'NYC' } }],
            billingAddress: { firstName: 'A', lastName: 'B', city: 'Boston' },
        } as unknown as Order,
        profileSnapshot: null,
        registeredViaCheckout: true,
        isNewlyRegisteredWithEmptyProfile: false,
        useDifferentBilling: false,
        contactPhone: '5551234567',
    });

    it('does nothing for non-registering, non-empty-profile shoppers', async () => {
        const input = baseAddressInput();
        input.registeredViaCheckout = false;
        await saveProfileAddressesAndPhone(ctx, input);
        expect(saveShippingAddressMock).not.toHaveBeenCalled();
        expect(saveBillingAddressMock).not.toHaveBeenCalled();
        expect(updateContactInfoMock).not.toHaveBeenCalled();
    });

    it('saves shipping + phone but skips billing without useDifferentBilling', async () => {
        saveShippingAddressMock.mockResolvedValue(true);
        updateContactInfoMock.mockResolvedValue(true);
        await saveProfileAddressesAndPhone(ctx, baseAddressInput());
        expect(saveShippingAddressMock).toHaveBeenCalledOnce();
        expect(saveBillingAddressMock).not.toHaveBeenCalled();
        expect(updateContactInfoMock).toHaveBeenCalledOnce();
    });

    it('saves billing when useDifferentBilling is true', async () => {
        saveShippingAddressMock.mockResolvedValue(true);
        saveBillingAddressMock.mockResolvedValue(true);
        updateContactInfoMock.mockResolvedValue(true);
        const input = baseAddressInput();
        input.useDifferentBilling = true;
        await saveProfileAddressesAndPhone(ctx, input);
        expect(saveBillingAddressMock).toHaveBeenCalledOnce();
    });

    it('does NOT save payment method (payment-domain helper handles that)', async () => {
        await saveProfileAddressesAndPhone(ctx, baseAddressInput());
        expect(savePaymentMethodMock).not.toHaveBeenCalled();
    });
});
