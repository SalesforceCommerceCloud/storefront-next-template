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
 * Covers the emailVerificationEnabled gate on the checkout Turnstile widget.
 * When the site permission is disabled (emailVerificationEnabled === false),
 * the widget must not mount and the Continue button must not be stuck pending.
 * When enabled or undefined, existing behavior is preserved.
 */
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/components/login/otp-modal', () => ({ default: () => null }));
vi.mock('@/components/login/login-modal', () => ({ default: () => null }));

// Mock the Turnstile widget with a recognisable test id so assertions are unambiguous.
vi.mock('@/components/security/turnstile-widget', () => ({
    TurnstileWidget: () => <div data-testid="turnstile-widget" />,
}));

// Force isTurnstileEnabled to return true so the only gate under test is
// the emailVerificationEnabled prop — not the config-level toggle.
vi.mock('@/lib/turnstile/utils', () => ({
    isTurnstileEnabled: () => true,
    getTurnstileMode: () => 'managed' as const,
    getTurnstileSiteKey: () => '2x00000000000000000000AB',
}));

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: (opts?: { key?: string }) => {
            if (opts?.key === 'contact-authorize-passwordless-email') {
                return { state: 'idle' as const, data: null, submit: vi.fn() };
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
    return { ...actual, useConfig: () => ({ auth: { otpLength: 6 } }) };
});

import ContactInfo from './contact-info';

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
    const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
    return render(<RouterProvider router={router} />);
}

const baseProps = {
    onSubmit: vi.fn(),
    isLoading: false,
    isCompleted: false,
    isEditing: true,
    onEdit: vi.fn(),
};

describe('ContactInfo - emailVerificationEnabled gate', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());
        const basketModule = await import('@/providers/basket');
        (basketModule.useBasket as ReturnType<typeof vi.fn>).mockReturnValue({
            basketId: 'b1',
            currency: 'USD',
            customerInfo: { email: '', customerId: null },
            shipments: [],
            paymentInstruments: [],
        });
    });

    test('widget does not mount on email focus when emailVerificationEnabled is false', () => {
        renderWithRouter(<ContactInfo {...baseProps} emailVerificationEnabled={false} />);

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
    });

    test('Continue button is not disabled when emailVerificationEnabled is false', () => {
        renderWithRouter(<ContactInfo {...baseProps} emailVerificationEnabled={false} />);

        // turnstilePending must be false, so the button is not stuck waiting for a token.
        const continueButton = screen.getByRole('button', { name: /continue/i });
        expect(continueButton).not.toBeDisabled();
    });

    test('widget mounts on email focus when emailVerificationEnabled is true', () => {
        renderWithRouter(<ContactInfo {...baseProps} emailVerificationEnabled={true} />);

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });

    test('widget mounts on email focus when emailVerificationEnabled is undefined (default enabled)', () => {
        renderWithRouter(<ContactInfo {...baseProps} />);

        const emailInput = screen.getByLabelText(/Email Address/i);
        fireEvent.focus(emailInput);

        expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });
});
