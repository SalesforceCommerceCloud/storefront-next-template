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
import { Blob } from 'node:buffer';
import { StrictMode, type ReactNode } from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resetEventMediator } from '@salesforce/storefront-next-runtime/events';
import { addAdapter, getAllAdapters, removeAdapter } from '@/lib/adapters';
import { createEinsteinAdapter } from '@/lib/adapters/engagement/einstein';
import { ensureAdaptersInitialized } from '@/lib/adapters/engagement/initialize';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { TrackingConsent } from '@/types/tracking-consent';
import type { SessionData } from '@/lib/api/types';
import type { ShopperBasketsV2 } from '@/scapi';
import CheckoutFormPage from './checkout-form-page';

vi.unmock('@/hooks/use-analytics');

const state = vi.hoisted(() => ({
    consent: undefined as TrackingConsent | undefined,
    auth: { userType: 'guest', usid: 'checkout-shopper' } as SessionData | undefined,
    step: 0,
    editingStep: null as number | null,
    navigation: 'idle' as 'idle' | 'loading' | 'submitting',
    hydrated: true,
    basket: {} as ShopperBasketsV2.schemas['Basket'],
    pathname: '/checkout',
}));

vi.mock('@/providers/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@/providers/basket', () => ({
    useBasket: () => state.basket,
    useBasketHydrated: () => state.hydrated,
}));
vi.mock('@/hooks/use-tracking-consent', () => ({
    useTrackingConsent: () => ({ trackingConsent: state.consent, isTrackingConsentEnabled: true }),
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useLocation: () => ({ pathname: state.pathname, search: '', hash: '' }),
    useNavigation: () => ({ state: state.navigation }),
    useFetcher: () => ({ state: 'idle', data: null }),
}));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({
        ...mockConfig,
        engagement: {
            ...mockConfig.engagement,
            analytics: { trackingConsent: { consentCategories: ['analytics'] } },
        },
    }),
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useSite: () => ({
        site: mockSiteObject,
        language: mockSiteObject.defaultLocale,
        locale: { id: mockSiteObject.defaultLocale },
        currency: mockSiteObject.defaultCurrency,
    }),
}));
vi.mock('@/lib/adapters/engagement/initialize', () => ({ ensureAdaptersInitialized: vi.fn() }));
vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => ({
        step: state.step,
        STEPS: { CONTACT_INFO: 0, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4, PLACE_ORDER: 5 },
        editingStep: state.editingStep,
        goToStep: vi.fn(),
        exitEditMode: vi.fn(),
        shipmentDistribution: { hasDeliveryItems: true, hasPickupItems: false, deliveryShipments: [] },
    }),
}));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({ useCustomerProfile: () => null }));
vi.mock('@/hooks/use-checkout-actions', () => ({
    useCheckoutActions: () => ({
        contactFetcher: { state: 'idle' },
        shippingAddressFetcher: { state: 'idle' },
        shippingOptionsFetcher: { state: 'idle' },
        paymentFetcher: { state: 'idle' },
        placeOrderFetcher: { state: 'idle' },
        isSubmitting: () => false,
    }),
}));
vi.mock('./components/contact-info', () => ({ default: () => null }));
vi.mock('./components/shipping-address', () => ({ default: () => null }));
vi.mock('./components/shipping-options', () => ({ default: () => null }));
vi.mock('./components/payment', () => ({ default: () => null }));
vi.mock('./components/express-payments', () => ({ default: () => null }));
vi.mock('./components/register-customer-selection', () => ({ default: () => null }));
vi.mock('@/components/my-cart', () => ({ default: () => null }));
vi.mock('@/components/order-summary', () => ({ default: () => null }));
vi.mock('@/components/order-summary/mobile-heading', () => ({ OrderSummaryMobileAccordion: () => null }));
vi.mock('@/targets/ui-target', () => ({ UITarget: ({ children }: { children?: ReactNode }) => children }));

const beacon = vi.fn<(url: string, payload: Blob) => boolean>();
const props = { productMapPromise: Promise.resolve({}) };
const flushIdle = () =>
    act(async () => {
        await vi.runOnlyPendingTimersAsync();
    });
const output = async () =>
    Promise.all(
        beacon.mock.calls.map(async ([url, payload]) => ({
            endpoint: new URL(url).pathname.split('/').pop(),
            payload: JSON.parse(await payload.text()),
        }))
    );
const mount = async (strict = false) => {
    const page = () =>
        strict ? (
            <StrictMode>
                <CheckoutFormPage {...props} />
            </StrictMode>
        ) : (
            <CheckoutFormPage {...props} />
        );
    let view!: ReturnType<typeof render>;
    await act(async () => {
        view = render(page());
        await Promise.resolve();
    });
    return {
        ...view,
        refresh: async () => {
            await act(async () => {
                view.rerender(page());
                await Promise.resolve();
            });
        },
    };
};

function registerVendor(checkoutStart = true) {
    addAdapter(
        'einstein',
        createEinsteinAdapter({
            enabled: true,
            host: 'https://api.cquotient.com',
            realm: 'realm',
            siteId: 'site',
            einsteinId: 'client',
            isProduction: false,
            consentCategory: 'analytics',
            eventToggles: {
                ...mockConfig.engagement.adapters.einstein.eventToggles,
                checkout_start: checkoutStart,
                checkout_step: true,
            },
        })
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', Blob);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
    beacon.mockReset().mockReturnValue(true);
    vi.mocked(ensureAdaptersInitialized).mockReset().mockResolvedValue(undefined);
    resetEventMediator();
    for (const adapter of getAllAdapters()) removeAdapter(adapter.name);
    registerVendor();
    state.consent = undefined;
    state.auth = { userType: 'guest', usid: 'checkout-shopper' };
    state.step = 0;
    state.editingStep = null;
    state.navigation = 'idle';
    state.hydrated = true;
    state.pathname = '/checkout';
    state.basket = {
        basketId: 'checkout-basket',
        productSubTotal: 20,
        productItems: [{ itemId: 'item', productId: 'product', quantity: 2, price: 10 }],
    };
});
afterEach(() => {
    cleanup();
    resetEventMediator();
    removeAdapter('einstein');
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Checkout consent recovery at Einstein output', () => {
    it.each([
        'idle',
        'auth',
        'init',
    ])('cancels %s work during pending navigation and recovers when cancelled', async (phase) => {
        state.consent = TrackingConsent.Accepted;
        if (phase === 'auth') state.auth = undefined;
        let initialize: (() => void) | undefined;
        if (phase === 'init')
            vi.mocked(ensureAdaptersInitialized).mockReturnValue(
                new Promise<void>((resolve) => {
                    initialize = resolve;
                })
            );
        const view = await mount();
        if (phase !== 'idle') await flushIdle();
        state.navigation = 'loading';
        await view.refresh();
        state.auth = { userType: 'guest', usid: 'checkout-shopper' };
        await view.refresh();
        await act(async () => {
            initialize?.();
            await Promise.resolve();
        });
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.navigation = 'submitting';
        await view.refresh();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.navigation = 'idle';
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 0]);
    });

    it.each(['idle', 'auth', 'init'])('replaces pending %s step with the edited step', async (phase) => {
        state.consent = TrackingConsent.Accepted;
        state.step = 4;
        if (phase === 'auth') state.auth = undefined;
        let initialize: (() => void) | undefined;
        if (phase === 'init')
            vi.mocked(ensureAdaptersInitialized).mockReturnValue(
                new Promise<void>((resolve) => {
                    initialize = resolve;
                })
            );
        const view = await mount();
        if (phase !== 'idle') await flushIdle();
        state.editingStep = 2;
        await view.refresh();
        state.auth = { userType: 'guest', usid: 'checkout-shopper' };
        await view.refresh();
        await act(async () => {
            initialize?.();
            await Promise.resolve();
        });
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 2]);
        state.editingStep = 0;
        await view.refresh();
        await flushIdle();
        state.editingStep = null;
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 2, 0, 4]);
    });

    it('contains initialization rejection and recovers on the next consent change', async () => {
        state.consent = TrackingConsent.Accepted;
        vi.mocked(ensureAdaptersInitialized).mockRejectedValue(new Error('adapter initialization failed'));
        const view = await mount();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        vi.mocked(ensureAdaptersInitialized).mockResolvedValue(undefined);
        state.consent = TrackingConsent.Declined;
        await view.refresh();
        state.consent = TrackingConsent.Accepted;
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
    });

    it('recovers start and only the current step after consent', async () => {
        const view = await mount();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.step = 2;
        await view.refresh();
        await flushIdle();
        state.step = 4;
        state.consent = TrackingConsent.Accepted;
        await view.refresh();
        await flushIdle();
        expect(await output()).toEqual([
            {
                endpoint: 'beginCheckout',
                payload: {
                    cookieId: 'checkout-shopper',
                    instanceType: 'sbx',
                    realm: 'realm',
                    products: [{ id: 'product', quantity: 2, price: 10 }],
                    amount: 20,
                    checkoutType: 'one-click',
                },
            },
            {
                endpoint: 'checkoutStep',
                payload: {
                    cookieId: 'checkout-shopper',
                    instanceType: 'sbx',
                    realm: 'realm',
                    stepName: 'PAYMENT',
                    stepNumber: 4,
                    basketId: 'checkout-basket',
                    checkoutType: 'one-click',
                },
            },
        ]);
    });

    it('recovers the unchanged current step and does not duplicate handoffs across consent toggles', async () => {
        state.step = 3;
        const view = await mount();
        await flushIdle();
        state.consent = TrackingConsent.Declined;
        await view.refresh();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.consent = TrackingConsent.Accepted;
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ endpoint }) => endpoint)).toEqual(['beginCheckout', 'checkoutStep']);
        expect((await output())[1].payload.stepNumber).toBe(3);
        await view.refresh();
        state.consent = TrackingConsent.Declined;
        await view.refresh();
        await flushIdle();
        state.consent = TrackingConsent.Accepted;
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
        state.step = 4;
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 3, 4]);
    });

    it('never queues steps from an empty checkout', async () => {
        state.consent = TrackingConsent.Accepted;
        const basket = state.basket;
        state.basket = { ...basket, productItems: [] };
        const view = await mount();
        await flushIdle();
        state.step = 2;
        await view.refresh();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.basket = basket;
        state.step = 4;
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 4]);
    });

    it('waits for a hydrated checkout with a basket ID', async () => {
        state.consent = TrackingConsent.Accepted;
        state.hydrated = false;
        const view = await mount();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.hydrated = true;
        state.basket = { ...state.basket, basketId: undefined };
        await view.refresh();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        state.basket = { ...state.basket, basketId: 'checkout-basket' };
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
    });

    it('emits only the current step when steps change before idle in Strict Mode', async () => {
        state.consent = TrackingConsent.Accepted;
        const view = await mount(true);
        expect(beacon).not.toHaveBeenCalled();
        state.step = 2;
        await view.refresh();
        state.step = 4;
        await view.refresh();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 4]);
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
    });

    it('does not restart or duplicate idle work for equivalent basket snapshots', async () => {
        state.consent = TrackingConsent.Accepted;
        const view = await mount();
        state.basket = { ...state.basket, productItems: [...(state.basket.productItems ?? [])] };
        await view.refresh();
        await view.refresh();
        expect(beacon).not.toHaveBeenCalled();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
        state.basket = { ...state.basket };
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(2);
    });

    it.each(['withdrawal', 'navigation', 'empty cart', 'unmount'])('cancels idle work on %s', async (change) => {
        state.consent = TrackingConsent.Accepted;
        const view = await mount();
        if (change === 'withdrawal') state.consent = TrackingConsent.Declined;
        if (change === 'navigation') state.pathname = '/cart';
        if (change === 'empty cart') state.basket = { ...state.basket, productItems: [] };
        if (change === 'unmount') view.unmount();
        else await view.refresh();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
    });

    it.each([
        'withdrawal',
        'navigation',
        'step',
        'cart data',
        'unmount',
    ])('cancels pending initialization on %s', async (change) => {
        state.consent = TrackingConsent.Accepted;
        let initialize!: () => void;
        vi.mocked(ensureAdaptersInitialized).mockReturnValue(
            new Promise<void>((resolve) => {
                initialize = resolve;
            })
        );
        const view = await mount();
        await flushIdle();
        expect(beacon).not.toHaveBeenCalled();
        if (change === 'withdrawal') state.consent = TrackingConsent.Declined;
        if (change === 'navigation') state.pathname = '/cart';
        if (change === 'step') state.step = 4;
        if (change === 'cart data')
            state.basket = {
                ...state.basket,
                productSubTotal: 30,
                productItems: [{ itemId: 'replacement', productId: 'new-product', quantity: 3, price: 10 }],
            };
        if (change === 'unmount') view.unmount();
        else await view.refresh();
        await act(async () => {
            initialize();
            await Promise.resolve();
        });
        expect(beacon).not.toHaveBeenCalled();
        if (change === 'step' || change === 'cart data') {
            await flushIdle();
            const events = await output();
            expect(events.map(({ endpoint }) => endpoint)).toEqual(['beginCheckout', 'checkoutStep']);
            expect(events[1].payload.stepNumber).toBe(change === 'step' ? 4 : 0);
            expect(events[0].payload.products).toEqual(
                change === 'cart data'
                    ? [{ id: 'new-product', quantity: 3, price: 10 }]
                    : [{ id: 'product', quantity: 2, price: 10 }]
            );
        }
    });

    it('cancels an auth wait when the step changes and sends only the current checkout', async () => {
        state.consent = TrackingConsent.Accepted;
        state.auth = undefined;
        const view = await mount();
        await flushIdle();
        state.step = 4;
        await view.refresh();
        state.auth = { userType: 'guest', usid: 'checkout-shopper' };
        await view.refresh();
        expect(beacon).not.toHaveBeenCalled();
        await flushIdle();
        expect((await output()).map(({ payload }) => payload.stepNumber)).toEqual([undefined, 4]);
    });

    it.each(['withdrawal', 'navigation', 'cart data', 'unmount'])('cancels an auth wait on %s', async (change) => {
        state.consent = TrackingConsent.Accepted;
        state.auth = undefined;
        const view = await mount();
        await flushIdle();
        if (change === 'withdrawal') state.consent = TrackingConsent.Declined;
        if (change === 'navigation') state.pathname = '/cart';
        if (change === 'cart data') state.basket = { ...state.basket, productSubTotal: 30 };
        if (change === 'unmount') view.unmount();
        else {
            await view.refresh();
            state.auth = { userType: 'guest', usid: 'checkout-shopper' };
            await view.refresh();
        }
        expect(beacon).not.toHaveBeenCalled();
        expect(ensureAdaptersInitialized).not.toHaveBeenCalled();
        if (change === 'cart data') {
            await flushIdle();
            expect((await output())[0].payload.amount).toBe(30);
        }
    });

    it('respects Einstein event toggles without retrying a successful mediator handoff', async () => {
        state.consent = TrackingConsent.Accepted;
        registerVendor(false);
        const view = await mount();
        await flushIdle();
        expect((await output()).map(({ endpoint }) => endpoint)).toEqual(['checkoutStep']);
        state.consent = TrackingConsent.Declined;
        await view.refresh();
        state.consent = TrackingConsent.Accepted;
        await view.refresh();
        await flushIdle();
        expect(beacon).toHaveBeenCalledTimes(1);
    });
});
