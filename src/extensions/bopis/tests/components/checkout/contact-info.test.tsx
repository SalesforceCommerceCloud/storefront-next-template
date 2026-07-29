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
import ContactInfo from '@/components/checkout/components/contact-info';

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/use-customer-lookup', () => ({
    useCustomerLookup: vi.fn(() => ({ isLoading: false, customer: null, lookup: vi.fn() })),
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
        hasPickupItems: false,
        hasDeliveryItems: true,
        enableMultiAddress: false,
        hasMultipleDeliveryAddresses: false,
        hasUnaddressedDeliveryItems: false,
        hasEmptyShipments: false,
        isDeliveryProductItem: () => false,
        deliveryShipments: [],
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

const mockGetContactInfoFromCustomer = vi.fn((_customerProfile?: unknown) => ({}));
vi.mock('@/lib/customer/profile-utils', () => ({
    getContactInfoFromCustomer: (customerProfile?: unknown) => mockGetContactInfoFromCustomer(customerProfile),
}));

const mockGetCommonPhoneCountryCodes = vi.fn(() => [{ dialingCode: '+1', countryName: 'United States' }]);
vi.mock('@/lib/address/country-codes', () => ({
    getCommonPhoneCountryCodes: () => mockGetCommonPhoneCountryCodes(),
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

const createMockBasket = (overrides = {}) => ({
    basketId: 'test-basket-123',
    currency: 'USD',
    customerInfo: { email: 'test@example.com', customerId: null },
    shipments: [{ shipmentId: 'shipment-1', shippingAddress: null }],
    paymentInstruments: [],
    ...overrides,
});

const otpFlowActiveRef = { current: false };

const createDefaultProps = (overrides = {}) => ({
    onSubmit: vi.fn(),
    isLoading: false,
    actionData: undefined,
    isCompleted: false,
    isEditing: true,
    onEdit: vi.fn(),
    onRegisteredUserChoseGuest: vi.fn(),
    otpFlowActiveRef,
    ...overrides,
});

function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            { path: '/', element: ui },
            {
                path: '/action/authorize-passwordless-email',
                action: () => ({ success: true, email: 'test@example.com' }),
            },
        ],
        { initialEntries: ['/'], initialIndex: 0 }
    );
    return render(<RouterProvider router={router} />);
}

describe('ContactInfo - Multiship-BOPIS Scenarios', () => {
    let useBasket: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockGetContactInfoFromCustomer.mockReturnValue({});
        mockGetCommonPhoneCountryCodes.mockReturnValue([{ dialingCode: '+1', countryName: 'United States' }]);

        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());

        const basketModule = await import('@/providers/basket');
        const profileModule = await import('@/hooks/checkout/use-customer-profile');
        const lookupModule = await import('@/hooks/use-customer-lookup');

        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        const useCustomerProfile = profileModule.useCustomerProfile as ReturnType<typeof vi.fn>;
        const useLoginSuggestion = lookupModule.useLoginSuggestion as ReturnType<typeof vi.fn>;

        useBasket.mockReturnValue(createMockBasket());
        useCustomerProfile.mockReturnValue(null);
        useLoginSuggestion.mockReturnValue({ shouldSuggestLogin: false, isCurrentUser: false });
    });

    describe('Button Label - Pickup vs Shipping', () => {
        test('renders submit button with "Continue to Shipping" for delivery-only basket', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    shipmentDistribution: {
                        hasPickupItems: false,
                        hasDeliveryItems: true,
                        enableMultiAddress: false,
                        hasMultipleDeliveryAddresses: false,
                        hasUnaddressedDeliveryItems: false,
                        hasEmptyShipments: false,
                        isDeliveryProductItem: () => false,
                        deliveryShipments: [],
                    },
                })
            );
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /continue to shipping/i })).toBeInTheDocument();
            });
        });

        test('renders submit button with "Continue to Pickup" when basket has pickup items', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    shipmentDistribution: {
                        hasPickupItems: true,
                        hasDeliveryItems: false,
                        enableMultiAddress: false,
                        hasMultipleDeliveryAddresses: false,
                        hasUnaddressedDeliveryItems: false,
                        hasEmptyShipments: false,
                        isDeliveryProductItem: () => false,
                        deliveryShipments: [],
                    },
                })
            );
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /continue to pickup/i })).toBeInTheDocument();
            });
        });

        test('renders submit button with "Continue to Pickup" for mixed basket (pickup + delivery)', async () => {
            mockUseCheckoutContext.mockReturnValue(
                buildCheckoutContext({
                    shipmentDistribution: {
                        hasPickupItems: true,
                        hasDeliveryItems: true,
                        enableMultiAddress: false,
                        hasMultipleDeliveryAddresses: false,
                        hasUnaddressedDeliveryItems: false,
                        hasEmptyShipments: false,
                        isDeliveryProductItem: () => false,
                        deliveryShipments: [],
                    },
                })
            );
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /continue to pickup/i })).toBeInTheDocument();
            });
        });
    });
});
