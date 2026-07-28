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
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/components/login/otp-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="otp-modal-mock" /> : null),
}));

vi.mock('@/components/login/login-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="login-modal-mock" /> : null),
}));

// Captures the `onSuccess` callback contact-info.tsx wires into usePasskeyLogin, so the test
// can invoke it directly to simulate the conditional-mediation ceremony resolving while the
// OTP/login modal opened for the same email blur is still on screen.
let capturedPasskeyOnSuccess: (() => void) | undefined;
vi.mock('@/hooks/use-passkey-login', () => ({
    usePasskeyLogin: (onSuccess: () => void) => {
        capturedPasskeyOnSuccess = onSuccess;
        return {
            loginWithPasskey: vi.fn(),
            abortPasskeyLogin: vi.fn(),
            isAuthenticating: false,
        };
    },
}));

const mockPasswordlessSubmit = vi.fn();
const passwordlessFetcherState = {
    state: 'idle' as const,
    data: null as { success: boolean; email?: string; requiresLogin?: boolean } | null,
    submit: mockPasswordlessSubmit,
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: (opts?: { key?: string }) => {
            if (opts?.key === 'contact-authorize-passwordless-email') {
                return passwordlessFetcherState;
            }
            return {
                state: 'idle' as const,
                data: null,
                submit: vi.fn(),
                Form: actual.Form,
            };
        },
        useRevalidator: () => ({
            revalidate: mockRevalidate,
            state: 'idle' as const,
        }),
        useResolvedPath: (to: string) => ({ pathname: to, search: '', hash: '', state: null, key: 'k' }),
    };
});

const mockRevalidate = vi.fn();

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/use-customer-lookup', () => ({
    useCustomerLookup: vi.fn(() => null),
    useLoginSuggestion: vi.fn(() => ({ shouldSuggestLogin: false, isCurrentUser: false })),
}));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(() => null),
}));

const mockUseCheckoutContext = vi.fn();
const defaultSteps = {
    CONTACT_INFO: 0,
    PICKUP: 1,
    SHIPPING_ADDRESS: 2,
    SHIPPING_OPTIONS: 3,
    PAYMENT: 4,
    PLACE_ORDER: 5,
} as const;

const buildCheckoutContext = (overrides?: Record<string, unknown>) => ({
    step: 0,
    computedStep: 0,
    editingStep: null,
    STEPS: defaultSteps,
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
    ...(overrides || {}),
});

vi.mock('@/hooks/use-checkout', () => ({
    useCheckoutContext: () => mockUseCheckoutContext(),
}));

vi.mock('@/lib/customer/profile-utils', () => ({
    getContactInfoFromCustomer: () => ({}),
}));

vi.mock('@/lib/address/country-codes', () => ({
    getCommonPhoneCountryCodes: () => [{ dialingCode: '+1', countryName: 'United States' }],
}));

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual<typeof import('@salesforce/storefront-next-runtime/config')>(
        '@salesforce/storefront-next-runtime/config'
    );
    return {
        ...actual,
        useConfig: () => ({ auth: { otpLength: 6 }, features: { passkey: { enabled: true } } }),
    };
});

import ContactInfo from './contact-info';
import { resourceRoutes } from '@/route-paths';

const createMockBasket = () => ({
    basketId: 'test-basket-123',
    currency: 'USD',
    customerInfo: { email: 'shopper@example.com', customerId: null },
    shipments: [{ shipmentId: 'shipment-1', shippingAddress: null }],
    paymentInstruments: [],
});

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            { path: '/', element: ui },
            {
                path: resourceRoutes.authorizePasswordlessEmail,
                action: () => ({ success: true, email: 'shopper@example.com' }),
            },
        ],
        { initialEntries: ['/'], initialIndex: 0 }
    );
    return render(<RouterProvider router={router} />);
}

// Covers the race the passkey listener guards against: checkout's email input carries
// autoComplete="username webauthn" alongside the passwordless-email flow, so a conditional
// mediation ceremony triggered by the same blur can resolve while the OTP or login modal
// opened by that other flow is still on screen. handlePasskeyLoginSuccess in contact-info.tsx
// must dismiss whichever of the two is open.
describe('ContactInfo - passkey login resolves while OTP/login modal is open', () => {
    let useBasket: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        capturedPasskeyOnSuccess = undefined;
        passwordlessFetcherState.state = 'idle';
        passwordlessFetcherState.data = { success: true, email: 'shopper@example.com' };
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());

        const basketModule = await import('@/providers/basket');
        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useBasket.mockReturnValue(createMockBasket());
    });

    const otpFlowActiveRef = { current: false };

    test('dismisses the OTP modal when the passkey ceremony resolves first', async () => {
        const onPasswordlessOtpVerified = vi.fn();
        otpFlowActiveRef.current = false;

        renderWithRouter(
            <ContactInfo
                onSubmit={vi.fn()}
                isLoading={false}
                isCompleted={false}
                isEditing={true}
                onEdit={vi.fn()}
                onPasswordlessOtpVerified={onPasswordlessOtpVerified}
                otpFlowActiveRef={otpFlowActiveRef}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('otp-modal-mock')).toBeInTheDocument();
        });
        expect(capturedPasskeyOnSuccess).toBeDefined();

        capturedPasskeyOnSuccess?.();

        await waitFor(() => {
            expect(screen.queryByTestId('otp-modal-mock')).not.toBeInTheDocument();
        });
        expect(onPasswordlessOtpVerified).toHaveBeenCalledTimes(1);
        expect(mockRevalidate).toHaveBeenCalledTimes(1);
        expect(otpFlowActiveRef.current).toBe(false);
    });

    test('dismisses the sign-in (login) modal when the passkey ceremony resolves first', async () => {
        passwordlessFetcherState.data = { success: false, requiresLogin: true, email: 'shopper@example.com' };
        const onPasswordlessOtpVerified = vi.fn();
        otpFlowActiveRef.current = false;

        renderWithRouter(
            <ContactInfo
                onSubmit={vi.fn()}
                isLoading={false}
                isCompleted={false}
                isEditing={true}
                onEdit={vi.fn()}
                onPasswordlessOtpVerified={onPasswordlessOtpVerified}
                otpFlowActiveRef={otpFlowActiveRef}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('login-modal-mock')).toBeInTheDocument();
        });
        expect(capturedPasskeyOnSuccess).toBeDefined();

        capturedPasskeyOnSuccess?.();

        await waitFor(() => {
            expect(screen.queryByTestId('login-modal-mock')).not.toBeInTheDocument();
        });
        expect(onPasswordlessOtpVerified).toHaveBeenCalledTimes(1);
        expect(mockRevalidate).toHaveBeenCalledTimes(1);
        expect(otpFlowActiveRef.current).toBe(false);
    });
});
