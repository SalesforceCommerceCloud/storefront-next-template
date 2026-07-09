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
import { renderHook } from '@testing-library/react';
import { useCheckoutActions, type PaymentSubmissionRef } from './use-checkout-actions';

vi.mock('react-router', () => ({
    useFetcher: () => ({ data: null, state: 'idle', submit: vi.fn() }),
}));

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => ({ exitEditMode: vi.fn(), editingStep: null }),
}));

const mockBasket = {
    basketId: 'b-1',
    billingAddress: { phone: '5551234567' },
    shipments: [{ shippingAddress: { phone: '5559876543' } }],
};

vi.mock('@/providers/basket', () => ({
    useBasket: () => mockBasket,
    useBasketUpdater: () => vi.fn(),
}));

const buildPaymentSubmissionRef = (
    options?: { savePaymentToProfile?: boolean; useDifferentBilling?: boolean } | null
): PaymentSubmissionRef => ({
    current: {
        formDataGetter: null,
        billingAddressGetter: null,
        shouldPlaceOrderAfterPayment: false,
        options: options ?? null,
        setFormErrors: null,
        onPlaceOrder: null,
    },
});

describe('PaymentSubmissionRef shape', () => {
    it('initial ref shape includes billingAddressGetter as null', () => {
        const ref = buildPaymentSubmissionRef();
        expect(ref.current.billingAddressGetter).toBeNull();
    });
});

describe('buildPlaceOrderFinalizeFormData', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('forwards shouldCreateAccount and registration intent flags', () => {
        sessionStorage.setItem('registeredViaCheckout', 'true');
        sessionStorage.setItem('shouldCreateAccount', 'true');
        const paymentSubmissionRef = buildPaymentSubmissionRef();

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.get('shouldCreateAccount')).toBe('true');
        expect(formData.get('checkoutRegistrationIntent')).toBe('true');
    });

    it('omits savePaymentToProfile when ref does not request it', () => {
        const paymentSubmissionRef = buildPaymentSubmissionRef();

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.has('savePaymentToProfile')).toBe(false);
    });

    it('forwards savePaymentToProfile when ref requests it', () => {
        const paymentSubmissionRef = buildPaymentSubmissionRef({ savePaymentToProfile: true });

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.get('savePaymentToProfile')).toBe('true');
    });

    it('forwards useDifferentBilling boolean from the ref', () => {
        const paymentSubmissionRef = buildPaymentSubmissionRef({ useDifferentBilling: true });

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.get('useDifferentBilling')).toBe('true');
    });

    it('omits useDifferentBilling when not set on the ref', () => {
        const paymentSubmissionRef = buildPaymentSubmissionRef();

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.has('useDifferentBilling')).toBe(false);
    });

    it('uses session-stored contact phone when present', () => {
        sessionStorage.setItem('checkoutContactPhone', '+15555550123');
        const paymentSubmissionRef = buildPaymentSubmissionRef();

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.get('contactPhone')).toBe('+15555550123');
    });

    it('falls back to basket billing address phone when session is empty', () => {
        const paymentSubmissionRef = buildPaymentSubmissionRef();

        const { result } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));
        const formData = result.current.buildPlaceOrderFinalizeFormData();

        expect(formData.get('contactPhone')).toBe('5551234567');
    });
});
