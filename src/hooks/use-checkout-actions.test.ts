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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCheckoutActions, type PaymentSubmissionRef } from './use-checkout-actions';
import { CHECKOUT_STEPS } from '@/components/checkout/utils/checkout-context-types';

// Per-test mock state so individual cases can drive the fetcher lifecycle and
// checkout-context editingStep. Hoisted so vi.mock() factories capture it.
const fetcherState = vi.hoisted(() => ({
    // Maps fetcher key -> { data, state } for the mocked useFetcher() calls in
    // useCheckoutActions. Keys mirror the ones the hook passes.
    fetchers: new Map<string, { data: unknown; state: string }>(),
    submit: vi.fn(),
}));

const checkoutContext = vi.hoisted(() => ({
    editingStep: null as number | null,
    exitEditMode: vi.fn(),
    goToStep: vi.fn(),
}));

vi.mock('react-router', () => ({
    useFetcher: ({ key }: { key: string } = { key: '' }) => {
        const entry = fetcherState.fetchers.get(key) ?? { data: null, state: 'idle' };
        return { ...entry, submit: fetcherState.submit };
    },
}));

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => ({
        exitEditMode: checkoutContext.exitEditMode,
        editingStep: checkoutContext.editingStep,
        goToStep: checkoutContext.goToStep,
    }),
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

// Reset per-test mock state so ordering doesn't leak fetcher.data or editingStep.
beforeEach(() => {
    fetcherState.fetchers.clear();
    fetcherState.submit.mockReset();
    checkoutContext.editingStep = null;
    checkoutContext.exitEditMode.mockReset();
    checkoutContext.goToStep.mockReset();
});

describe('PaymentSubmissionRef shape', () => {
    it('initial ref shape includes billingAddressGetter as null', () => {
        const ref = buildPaymentSubmissionRef();
        expect(ref.current.billingAddressGetter).toBeNull();
    });
});

// Verifies the selector `use-checkout-actions.ts` uses after `exitEditMode()`
// (W-23325708) finds the ToggleCard heading in a real DOM. If ToggleCard's
// data-testid/data-slot contract changes, this catches it.
describe('exitEditMode focus target (W-23325708 selector contract)', () => {
    it('the querySelector used after exitEditMode finds a focusable card-title', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-testid="sf-toggle-card-contact-info">
              <div data-slot="card-title" tabindex="0">Contact Information</div>
            </div>
            <div data-testid="sf-toggle-card-shipping-address">
              <div data-slot="card-title" tabindex="0">Shipping Address</div>
            </div>
        `;
        document.body.appendChild(root);

        for (const id of ['contact-info', 'shipping-address']) {
            const heading = document.querySelector<HTMLElement>(
                `[data-testid="sf-toggle-card-${id}"] [data-slot="card-title"]`
            );
            expect(heading).not.toBeNull();
            expect(heading?.getAttribute('tabindex')).toBe('0');
            heading?.focus();
            expect(document.activeElement).toBe(heading);
        }

        document.body.removeChild(root);
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

// After exitEditMode() runs, useCheckoutActions schedules a rAF that focuses
// the just-saved section's CardTitle so keyboard / screen-reader users don't
// lose focus (WCAG 2.4.3). Two behaviors to lock in end-to-end here:
//   1. Focus lands on the CardTitle after the rAF fires.
//   2. If the component unmounts before the rAF fires, the scheduled handle
//      is cancelled so the callback does not run against a detached DOM.
describe('exitEditMode focus behavior (end-to-end)', () => {
    let rafSpy: ReturnType<typeof vi.spyOn>;
    let cafSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
        cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    });

    afterEach(() => {
        rafSpy.mockRestore();
        cafSpy.mockRestore();
        document.body.innerHTML = '';
    });

    /**
     * Drive the hook through submitContactInfo -> SUBMITTED -> BASKET_UPDATED ->
     * COMPLETED, so the focus-scheduling effect runs. Returns the rendered hook
     * plus the CardTitle element the effect should focus.
     */
    const drivePastExitEditMode = () => {
        // ToggleCard the effect will select. Two entries verifies the selector
        // finds the right one when multiple cards are present.
        document.body.innerHTML = `
            <div data-testid="sf-toggle-card-contact-info">
              <div data-slot="card-title" tabindex="0">Contact Information</div>
            </div>
            <div data-testid="sf-toggle-card-shipping-address">
              <div data-slot="card-title" tabindex="0">Shipping Address</div>
            </div>
        `;
        const contactHeading = document.querySelector<HTMLElement>(
            '[data-testid="sf-toggle-card-contact-info"] [data-slot="card-title"]'
        );

        checkoutContext.editingStep = CHECKOUT_STEPS.CONTACT_INFO;
        const paymentSubmissionRef = buildPaymentSubmissionRef();
        const { result, rerender, unmount } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));

        // Submit sets actionRef -> { CONTACT_INFO, SUBMITTED } synchronously.
        act(() => {
            result.current.submitContactInfo({ email: 'a@b.com', phone: '', countryCode: '' });
        });

        // Publish a successful fetcher.data so the SUBMITTED -> BASKET_UPDATED
        // effect fires, then rerender so React reads the new value.
        act(() => {
            fetcherState.fetchers.set('contact-form', {
                data: { success: true, basket: mockBasket },
                state: 'idle',
            });
            rerender();
        });

        // Second rerender lets the BASKET_UPDATED -> COMPLETED effect run, which
        // is what calls exitEditMode() and schedules the focus rAF.
        act(() => {
            rerender();
        });

        return { contactHeading, unmount };
    };

    it('focuses the just-saved CardTitle after the requestAnimationFrame fires', async () => {
        const { contactHeading } = drivePastExitEditMode();

        expect(checkoutContext.exitEditMode).toHaveBeenCalled();
        expect(rafSpy).toHaveBeenCalled();

        // Assert on the observable outcome (activeElement) rather than counting
        // ticks. jsdom's rAF fires on its own; waitFor polls until the callback
        // has run and moved focus.
        await waitFor(() => {
            expect(document.activeElement).toBe(contactHeading);
        });
    });

    it('cancels the scheduled rAF when the hook unmounts before it fires', () => {
        const { unmount } = drivePastExitEditMode();

        expect(rafSpy).toHaveBeenCalled();
        const scheduledId = rafSpy.mock.results.at(-1)?.value as number | undefined;
        expect(scheduledId).toBeTypeOf('number');

        // Unmount synchronously; the effect cleanup should cancel the pending
        // frame with the same handle rAF returned.
        expect(() => unmount()).not.toThrow();
        expect(cafSpy).toHaveBeenCalledWith(scheduledId);
    });
});
