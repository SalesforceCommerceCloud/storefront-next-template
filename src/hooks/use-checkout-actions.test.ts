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
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCheckoutActions, type PaymentSubmissionRef } from './use-checkout-actions';
import { CHECKOUT_STEPS } from '@/components/checkout/utils/checkout-context-types';

const mocks = vi.hoisted(() => {
    const fetchers = new Map<
        string,
        {
            data: { success?: boolean; basket?: { basketId: string; lastModified: string } } | null;
            state: 'idle' | 'submitting';
            submit: ReturnType<typeof vi.fn>;
        }
    >();
    return {
        fetchers,
        basket: {
            basketId: 'b-1',
            lastModified: '2026-07-10T20:00:00.000Z',
            billingAddress: { phone: '5551234567' },
            shipments: [{ shippingAddress: { phone: '5559876543' } }],
        } as {
            basketId: string;
            lastModified: string;
            billingAddress?: { phone: string };
            shipments?: { shippingAddress: { phone: string } }[];
        },
        exitEditMode: vi.fn(),
        goToStep: vi.fn(),
        updateBasket: vi.fn(),
        checkoutContext: {
            step: 0,
            editingStep: null as number | null,
        },
    };
});

vi.mock('react-router', () => ({
    useFetcher: ({ key }: { key: string }) => mocks.fetchers.get(key),
}));

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => ({
        exitEditMode: mocks.exitEditMode,
        step: mocks.checkoutContext.step,
        editingStep: mocks.checkoutContext.editingStep,
        goToStep: mocks.goToStep,
    }),
}));

vi.mock('@/providers/basket', () => ({
    useBasket: () => mocks.basket,
    useBasketUpdater: () => mocks.updateBasket,
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

const shippingAddressFetcher = () => {
    const fetcher = mocks.fetchers.get('shipping-address-form');
    if (!fetcher) {
        throw new Error('Shipping address fetcher was not initialized');
    }
    return fetcher;
};

// Reset per-test mock state so ordering doesn't leak fetcher.data, basket revision, or editingStep.
beforeEach(() => {
    for (const key of [
        'contact-form',
        'shipping-address-form',
        'shipping-options-form',
        'payment-form',
        'place-order',
    ]) {
        mocks.fetchers.set(key, {
            data: null,
            state: 'idle',
            submit: vi.fn(),
        });
    }
    mocks.checkoutContext.step = 0;
    mocks.checkoutContext.editingStep = null;
    mocks.basket = {
        basketId: 'b-1',
        lastModified: '2026-07-10T20:00:00.000Z',
        billingAddress: { phone: '5551234567' },
        shipments: [{ shippingAddress: { phone: '5559876543' } }],
    };
    vi.clearAllMocks();
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

describe('shipping progression', () => {
    beforeEach(() => {
        sessionStorage.clear();
        mocks.checkoutContext.step = 2;
        mocks.checkoutContext.editingStep = 2;
    });

    it('waits for the response basket revision before completing shipping address progression', () => {
        const noShippingMethodsRef = { current: false };
        const responseBasket = {
            basketId: 'shipping-address-basket',
            lastModified: '2026-07-10T20:01:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions({ noShippingMethodsRef }));

        act(() => result.current.submitShippingAddress(new FormData()));
        act(() => {
            shippingAddressFetcher().data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).not.toHaveBeenCalled();

        act(() => {
            mocks.basket = responseBasket;
            rerender();
        });

        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('completes active shipping address progression without an editing step after the basket revision catches up', () => {
        mocks.checkoutContext.editingStep = null;
        const noShippingMethodsRef = { current: false };
        const responseBasket = {
            basketId: 'shipping-address-basket',
            lastModified: '2026-07-10T20:01:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions({ noShippingMethodsRef }));

        act(() => result.current.submitShippingAddress(new FormData()));
        act(() => {
            shippingAddressFetcher().data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).not.toHaveBeenCalled();

        act(() => {
            mocks.basket = responseBasket;
            rerender();
        });

        expect(mocks.exitEditMode).toHaveBeenCalledOnce();

        act(() => rerender());
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('completes shipping address progression when basket context has a newer revision', () => {
        const noShippingMethodsRef = { current: false };
        const responseBasket = {
            basketId: 'b-1',
            lastModified: '2026-07-10T20:01:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions({ noShippingMethodsRef }));

        act(() => result.current.submitShippingAddress(new FormData()));
        act(() => {
            mocks.basket = {
                ...mocks.basket,
                lastModified: '2026-07-10T20:02:00.000Z',
            };
            shippingAddressFetcher().data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();

        act(() => rerender());
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('waits for the response basket revision before completing shipping options progression', () => {
        mocks.checkoutContext.editingStep = 3;
        mocks.checkoutContext.step = 3;
        const responseBasket = {
            basketId: 'shipping-options-basket',
            lastModified: '2026-07-10T20:02:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions());

        const formData = new FormData();
        formData.append('shippingMethodId', 'standard-shipping');
        act(() => result.current.submitShippingOptions(formData));
        act(() => {
            const fetcher = mocks.fetchers.get('shipping-options-form');
            if (!fetcher) {
                throw new Error('Shipping options fetcher was not initialized');
            }
            fetcher.data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).not.toHaveBeenCalled();

        act(() => {
            mocks.basket = responseBasket;
            rerender();
        });

        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('completes active shipping options progression without an editing step after the basket revision catches up', () => {
        mocks.checkoutContext.editingStep = null;
        mocks.checkoutContext.step = 3;
        const responseBasket = {
            basketId: 'shipping-options-basket',
            lastModified: '2026-07-10T20:02:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions());

        const formData = new FormData();
        formData.append('shippingMethodId', 'standard-shipping');
        act(() => result.current.submitShippingOptions(formData));
        act(() => {
            const fetcher = mocks.fetchers.get('shipping-options-form');
            if (!fetcher) {
                throw new Error('Shipping options fetcher was not initialized');
            }
            fetcher.data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).not.toHaveBeenCalled();

        act(() => {
            mocks.basket = responseBasket;
            rerender();
        });

        expect(mocks.exitEditMode).toHaveBeenCalledOnce();

        act(() => rerender());
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('completes shipping options progression when basket context has a newer revision', () => {
        mocks.checkoutContext.editingStep = 3;
        mocks.checkoutContext.step = 3;
        const responseBasket = {
            basketId: 'b-1',
            lastModified: '2026-07-10T20:01:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions());

        act(() => result.current.submitShippingOptions(new FormData()));
        act(() => {
            mocks.basket = {
                ...mocks.basket,
                lastModified: '2026-07-10T20:02:00.000Z',
            };
            const fetcher = mocks.fetchers.get('shipping-options-form');
            if (!fetcher) {
                throw new Error('Shipping options fetcher was not initialized');
            }
            fetcher.data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();

        act(() => rerender());
        expect(mocks.exitEditMode).toHaveBeenCalledOnce();
    });

    it('completes shipping options recalculation only after the response basket is published', () => {
        mocks.checkoutContext.editingStep = 3;
        mocks.checkoutContext.step = 3;
        const responseBasket = {
            basketId: 'recalculation-basket',
            lastModified: '2026-07-10T20:02:00.000Z',
        };
        const { result, rerender } = renderHook(() => useCheckoutActions());

        act(() => result.current.submitShippingOptionsForRecalculation(new FormData()));
        act(() => {
            const fetcher = mocks.fetchers.get('shipping-options-form');
            if (!fetcher) {
                throw new Error('Shipping options fetcher was not initialized');
            }
            fetcher.data = {
                success: true,
                basket: responseBasket,
            };
            rerender();
        });

        expect(mocks.updateBasket).toHaveBeenCalledWith(responseBasket);
        expect(mocks.exitEditMode).not.toHaveBeenCalled();
        expect(mocks.goToStep).toHaveBeenCalledOnce();
        expect(mocks.goToStep).toHaveBeenCalledWith(3);

        act(() => {
            mocks.basket = responseBasket;
            rerender();
        });

        expect(mocks.exitEditMode).not.toHaveBeenCalled();

        // A later basket publication cannot make a completed recalculation exit edit mode.
        act(() => {
            mocks.basket = {
                ...responseBasket,
                lastModified: '2026-07-10T20:03:00.000Z',
            };
            rerender();
        });

        expect(mocks.exitEditMode).not.toHaveBeenCalled();
        expect(mocks.goToStep).toHaveBeenCalledOnce();
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

        mocks.checkoutContext.editingStep = CHECKOUT_STEPS.CONTACT_INFO;
        const paymentSubmissionRef = buildPaymentSubmissionRef();
        const { result, rerender, unmount } = renderHook(() => useCheckoutActions({ paymentSubmissionRef }));

        // Submit sets actionRef -> { CONTACT_INFO, SUBMITTED } synchronously.
        act(() => {
            result.current.submitContactInfo({ email: 'a@b.com', phone: '', countryCode: '' });
        });

        // Publish a successful fetcher.data so the SUBMITTED -> BASKET_UPDATED
        // effect fires, then rerender so React reads the new value.
        act(() => {
            const contactFetcher = mocks.fetchers.get('contact-form');
            if (!contactFetcher) {
                throw new Error('Contact fetcher was not initialized');
            }
            contactFetcher.data = { success: true, basket: mocks.basket };
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

        expect(mocks.exitEditMode).toHaveBeenCalled();
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
