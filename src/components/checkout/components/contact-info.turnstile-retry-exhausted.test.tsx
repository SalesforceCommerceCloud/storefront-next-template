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
 * Covers the WI-10 follow-up: when the Turnstile widget cannot produce a token
 * (3 consecutive non-infrastructure errors, e.g. always-block sitekeys or genuine
 * bot-detection rejection), the form must surface the same generic verification-
 * error message instead of leaving the shopper silently stuck waiting for a token
 * that will never come.
 */
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/components/login/otp-modal', () => ({
    default: () => null,
}));
vi.mock('@/components/login/login-modal', () => ({
    default: () => null,
}));

// Mock the Turnstile widget to expose its onRetryExhausted callback as a button the test
// can click. This avoids needing to drive Cloudflare's real iframe in jsdom.
let capturedOnRetryExhausted: ((errorCode: string, family: string) => void) | null = null;
vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: ({ onRetryExhausted }: { onRetryExhausted?: (errorCode: string, family: string) => void }) => {
        capturedOnRetryExhausted = onRetryExhausted ?? null;
        return (
            <div data-testid="turnstile-widget-mock">
                <button
                    type="button"
                    data-testid="turnstile-mock-trigger-retry-exhausted"
                    onClick={() => onRetryExhausted?.('300010', 'bot-detection')}>
                    fire onRetryExhausted
                </button>
            </div>
        );
    },
}));

vi.mock('@/lib/turnstile/utils', () => ({
    isTurnstileEnabled: () => true,
    getTurnstileMode: () => 'managed' as const,
    getTurnstileSiteKey: () => '2x00000000000000000000AB',
}));

const passwordlessFetcherState = {
    state: 'idle' as const,
    data: null as { success: boolean; email?: string } | null,
    submit: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: (opts?: { key?: string }) => {
            if (opts?.key === 'contact-authorize-passwordless-email') {
                return passwordlessFetcherState;
            }
            return { state: 'idle' as const, data: null, submit: vi.fn(), Form: actual.Form };
        },
        useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' as const }),
        useResolvedPath: (to: string) => ({ pathname: to, search: '', hash: '', state: null, key: 'k' }),
    };
});

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/use-customer-lookup', () => ({
    useCustomerLookup: vi.fn(() => null),
    useLoginSuggestion: vi.fn(() => ({ shouldSuggestLogin: false, isCurrentUser: false })),
}));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({ useCustomerProfile: vi.fn(() => null) }));

const mockUseCheckoutContext = vi.fn();
vi.mock('@/hooks/use-checkout', () => ({ useCheckoutContext: () => mockUseCheckoutContext() }));

vi.mock('@/lib/customer/profile-utils', () => ({ getContactInfoFromCustomer: () => ({}) }));
vi.mock('@/lib/address/country-codes', () => ({
    getCommonPhoneCountryCodes: () => [{ dialingCode: '+1', countryName: 'United States' }],
}));
vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual<typeof import('@salesforce/storefront-next-runtime/config')>(
        '@salesforce/storefront-next-runtime/config'
    );
    return {
        ...actual,
        useConfig: () => ({ auth: { otpLength: 6 }, features: { passkey: { enabled: false, mode: 'email' } } }),
    };
});

import ContactInfo from './contact-info';

const createMockBasket = () => ({
    basketId: 'test-basket-123',
    currency: 'USD',
    customerInfo: { email: 'shopper@example.com', customerId: null },
    shipments: [{ shipmentId: 'shipment-1', shippingAddress: null }],
    paymentInstruments: [],
});

const buildCheckoutContext = () => ({
    step: 0,
    computedStep: 0,
    editingStep: null,
    STEPS: { CONTACT_INFO: 0, PICKUP: 1, SHIPPING_ADDRESS: 2, SHIPPING_OPTIONS: 3, PAYMENT: 4, PLACE_ORDER: 5 },
    customerProfile: undefined,
    shippingDefaultSet: Promise.resolve(undefined),
    shipmentDistribution: {
        hasUnaddressedDeliveryItems: false,
        hasEmptyShipments: false,
        deliveryShipments: [],
        hasPickupItems: false,
        hasDeliveryItems: true,
        isDeliveryProductItem: () => true,
        enableMultiAddress: false,
        hasMultipleDeliveryAddresses: false,
    },
    savedAddresses: [],
    setSavedAddresses: vi.fn(),
    goToNextStep: vi.fn(),
    goToStep: vi.fn(),
    exitEditMode: vi.fn(),
});

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'], initialIndex: 0 });
    return render(<RouterProvider router={router} />);
}

describe('ContactInfo - Turnstile widget retry exhaustion', () => {
    let useBasket: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        capturedOnRetryExhausted = null;
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = null;
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());
        const basketModule = await import('@/providers/basket');
        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useBasket.mockReturnValue(createMockBasket());
    });

    test('renders generic verification-error alert when widget exhausts retries', async () => {
        const { fireEvent } = await import('@testing-library/react');
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        // Focus the email field so the widget mounts (showTurnstile flips to true).
        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        // The widget mock should be in the DOM now.
        const triggerButton = await screen.findByTestId('turnstile-mock-trigger-retry-exhausted');
        expect(triggerButton).toBeInTheDocument();

        // Simulate the widget exhausting retries.
        fireEvent.click(triggerButton);

        // The same generic alert that WI-10 surfaces for server-side rejection should appear.
        const alert = await screen.findByTestId('contact-info-verification-error');
        expect(alert).toHaveAttribute('role', 'alert');
        expect(alert).toHaveTextContent(/verify/i);
        // Non-leaky copy: must not mention Turnstile, bot, captcha, or specific error codes.
        const text = (alert.textContent || '').toLowerCase();
        expect(text).not.toMatch(/turnstile|bot|captcha|600010|300010|not_authorized/);
    });

    test('callback was actually wired through the contact-info -> widget prop', async () => {
        const { fireEvent } = await import('@testing-library/react');
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        // Widget mock captures whatever onRetryExhausted prop the form passes in.
        await screen.findByTestId('turnstile-widget-mock');
        expect(capturedOnRetryExhausted, 'form must pass onRetryExhausted to TurnstileWidget').to.be.a('function');
    });

    test('alert clears when shopper focuses email field after retry exhaustion', async () => {
        const { fireEvent } = await import('@testing-library/react');
        renderWithRouter(
            <ContactInfo onSubmit={vi.fn()} isLoading={false} isCompleted={false} isEditing={true} onEdit={vi.fn()} />
        );

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        const trigger = await screen.findByTestId('turnstile-mock-trigger-retry-exhausted');
        fireEvent.click(trigger);

        await screen.findByTestId('contact-info-verification-error');

        // Focus the email field again - the existing handleEmailFocus clears the alert.
        emailInput.blur();
        fireEvent.focus(emailInput);

        // Alert should be gone.
        expect(screen.queryByTestId('contact-info-verification-error')).not.toBeInTheDocument();
    });
});
