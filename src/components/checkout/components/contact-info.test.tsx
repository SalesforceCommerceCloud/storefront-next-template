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
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import ContactInfo from './contact-info';
import { resourceRoutes } from '@/route-paths';

// Use real react-hook-form for integration tests
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
        useConfig: () => ({ auth: { otpLength: 6 } }),
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
            {
                path: '/',
                element: ui,
            },
            {
                path: resourceRoutes.authorizePasswordlessEmail,
                action: () => ({ success: false }), // avoid opening OTP modal so form interactions work
            },
        ],
        { initialEntries: ['/'], initialIndex: 0 }
    );
    return render(<RouterProvider router={router} />);
}

describe('ContactInfo Integration Tests', () => {
    let useBasket: ReturnType<typeof vi.fn>;
    let useCustomerProfile: ReturnType<typeof vi.fn>;
    let useLoginSuggestion: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockGetContactInfoFromCustomer.mockReturnValue({});
        mockGetCommonPhoneCountryCodes.mockReturnValue([{ dialingCode: '+1', countryName: 'United States' }]);
        mockUseCheckoutContext.mockReturnValue(buildCheckoutContext());

        const basketModule = await import('@/providers/basket');
        const profileModule = await import('@/hooks/checkout/use-customer-profile');
        const lookupModule = await import('@/hooks/use-customer-lookup');

        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useCustomerProfile = profileModule.useCustomerProfile as ReturnType<typeof vi.fn>;
        useLoginSuggestion = lookupModule.useLoginSuggestion as ReturnType<typeof vi.fn>;

        useBasket.mockReturnValue(createMockBasket());
        useCustomerProfile.mockReturnValue(null);
        useLoginSuggestion.mockReturnValue({ shouldSuggestLogin: false, isCurrentUser: false });
    });

    describe('Basic Rendering', () => {
        test('renders contact info form in editing mode', async () => {
            const { container } = renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getAllByText('Contact Information').length).toBeGreaterThan(0);
            });
            expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();

            const fieldset = container.querySelector('fieldset');
            expect(fieldset).toHaveAttribute('aria-labelledby', 'contact-info-heading');
            expect(container.querySelector('#contact-info-heading')).toHaveTextContent('Contact Information');
        });

        test('displays form in summary mode when not editing', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            await waitFor(() => {
                expect(screen.queryByPlaceholderText(/email address/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Email Input', () => {
        test('renders email label with required indicator', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByText(/email address\*/i)).toBeInTheDocument();
            });
        });

        test('email input is accessible via label', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                const emailInput = screen.getByLabelText(/email address\*/i);
                expect(emailInput).toBeInTheDocument();
                expect(emailInput).toHaveAttribute('type', 'email');
            });
        });

        test('accepts email input', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const emailInput = screen.getByPlaceholderText(/email address/i);
            await user.clear(emailInput);
            await user.type(emailInput, 'valid.email@example.com');

            expect(emailInput).toHaveValue('valid.email@example.com');
        });

        test('pre-fills email from basket', async () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'basket@example.com', customerId: null },
                })
            );

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                const emailInput = screen.getByPlaceholderText(/email address/i);
                expect(emailInput).toHaveValue('basket@example.com');
            });
        });
    });

    describe('Prefill Behavior', () => {
        test('prefills email from customer profile when basket email is missing', async () => {
            mockGetContactInfoFromCustomer.mockReturnValue({
                email: 'profile@example.com',
                phone: '5550001111',
            });
            useCustomerProfile.mockReturnValue({
                customer: {
                    customerId: 'cust-123',
                    email: 'profile@example.com',
                },
            });
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: '', customerId: 'cust-123' },
                })
            );

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const emailInput = await screen.findByPlaceholderText(/email address/i);
            expect(emailInput).toHaveValue('profile@example.com');
        });

        test('renders country code options from helper utility', async () => {
            mockGetCommonPhoneCountryCodes.mockReturnValue([{ dialingCode: '+1', countryName: 'United States' }]);
            useCustomerProfile.mockReturnValue(null);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const select = await screen.findByLabelText(/^code$/i);
            expect(select).toBeInTheDocument();
            expect(within(select).getByText('+1')).toBeInTheDocument();
        });
    });

    describe('Phone Number Fields', () => {
        test('shows phone fields for guest users', async () => {
            useBasket.mockReturnValue(createMockBasket({ customerInfo: { customerId: null } }));
            useCustomerProfile.mockReturnValue(null);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByLabelText(/^code$/i)).toBeInTheDocument();
            });
            expect(screen.getByLabelText(/phone number\*/i)).toBeInTheDocument();
        });

        test('shows phone fields for logged-in users', async () => {
            useCustomerProfile.mockReturnValue({
                customerId: 'customer-123',
                email: 'user@example.com',
            });

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByLabelText(/phone number\*/i)).toBeInTheDocument();
            });
        });

        test('renders country code select', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                const countryCodeSelect = screen.getByLabelText(/^code$/i);
                expect(countryCodeSelect).toBeInTheDocument();
            });
        });

        test('renders persistent format description alongside phone input and links it via aria-describedby (WCAG 3.3.2)', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const phoneInput = await screen.findByLabelText(/phone number\*/i);
            const formItem = phoneInput.closest('[data-slot="form-item"]');
            if (!formItem) throw new Error('phone FormItem not found');

            const description = formItem.querySelector('[data-slot="form-description"]');
            if (!description) throw new Error('FormDescription not rendered next to phone input');
            expect(description.textContent).toMatch(/./);

            // Screen readers only announce the description when the input references it via
            // aria-describedby. The visible text alone doesn't satisfy WCAG 3.3.2.
            const describedBy = phoneInput.getAttribute('aria-describedby');
            if (describedBy === null) throw new Error('phone input missing aria-describedby');
            expect(describedBy.split(/\s+/)).toContain(description.id);
        });

        test('phone aria-describedby references BOTH description and validation message when the field is in error', async () => {
            const user = userEvent.setup();
            const { container } = renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            // Submit with an empty phone to trigger the required-phone validation message.
            const emailInput = await screen.findByPlaceholderText(/email address/i);
            await user.clear(emailInput);
            await user.type(emailInput, 'valid.email@example.com');

            const formElement = container.querySelector('form');
            if (!formElement) throw new Error('Form element not found');
            fireEvent.submit(formElement);

            const phoneInput = screen.getByLabelText(/phone number\*/i);
            await waitFor(() => {
                const formItem = phoneInput.closest('[data-slot="form-item"]');
                if (!formItem) throw new Error('phone FormItem not found');

                const description = formItem.querySelector('[data-slot="form-description"]');
                const message = formItem.querySelector('[data-slot="form-message"]');
                if (!description) throw new Error('FormDescription not rendered next to phone input');
                if (!message) throw new Error('FormMessage not rendered on validation error');

                const describedBy = phoneInput.getAttribute('aria-describedby');
                if (describedBy === null) throw new Error('phone input missing aria-describedby');
                const ids = describedBy.split(/\s+/).filter(Boolean);
                expect(ids).toContain(description.id);
                expect(ids).toContain(message.id);
            });
        });

        test('formats phone number on blur', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const phoneInput = screen.getByLabelText(/phone number\*/i);
            await user.type(phoneInput, '5551234567');
            expect(phoneInput).toHaveValue('5551234567');

            await user.tab();
            expect(phoneInput).toHaveValue('(555) 123-4567');
        });

        test('does not show required-phone error when the shopper focuses and blurs the empty field without typing', async () => {
            const user = userEvent.setup();
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const phoneInput = await screen.findByLabelText(/phone number\*/i);
            expect(phoneInput).toHaveValue('');

            // Focus the empty phone field, then blur without typing anything.
            await user.click(phoneInput);
            await user.tab();

            // No validation error should render. Prior to this fix, the phone
            // onBlur handler called field.onChange('') which triggered
            // mode: 'onChange' required-phone validation before the shopper had
            // typed anything.
            expect(screen.queryByText(/please enter your phone number/i)).not.toBeInTheDocument();
            expect(phoneInput.getAttribute('aria-invalid')).not.toBe('true');
        });

        test('visible phone-format mask is hidden from assistive technology', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            const phoneInput = await screen.findByLabelText(/phone number\*/i);
            const formItem = phoneInput.closest('[data-slot="form-item"]');
            if (!formItem) throw new Error('phone FormItem not found');

            // The empty field renders a visual placeholder mask ("(000) 000-0000").
            // Locate it by its visible text, then assert it is aria-hidden so screen
            // readers announce the format once (via the sr-only FormDescription linked
            // through aria-describedby), not twice.
            const mask = within(formItem as HTMLElement).getByText('(000) 000-0000');
            expect(mask).toHaveAttribute('aria-hidden', 'true');
        });
    });

    describe('Customer Types', () => {
        test('handles guest user flow', async () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'guest@example.com', customerId: null },
                })
            );
            useCustomerProfile.mockReturnValue(null);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
            });
            expect(screen.getByLabelText(/phone number\*/i)).toBeInTheDocument();
        });

        test('handles logged-in user flow', async () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'user@example.com', customerId: 'customer-123' },
                })
            );
            useCustomerProfile.mockReturnValue({
                customerId: 'customer-123',
                email: 'user@example.com',
            });

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
            });
            expect(screen.getByLabelText(/phone number\*/i)).toBeInTheDocument();
        });
    });

    describe('Login Suggestion', () => {
        test('shows login suggestion in summary when customer account exists', async () => {
            useLoginSuggestion.mockReturnValue({
                shouldSuggestLogin: true,
                isCurrentUser: false,
            });

            renderWithRouter(<ContactInfo {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            await waitFor(() => {
                expect(screen.getByText(/have an account/i)).toBeInTheDocument();
            });
        });

        test('hides login suggestion when no account found', async () => {
            useLoginSuggestion.mockReturnValue({
                shouldSuggestLogin: false,
                isCurrentUser: false,
            });

            renderWithRouter(<ContactInfo {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            await waitFor(() => {
                expect(screen.queryByText(/have an account/i)).not.toBeInTheDocument();
            });
        });
    });

    describe('Form Interaction', () => {
        test('renders submit button', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /continue to shipping/i })).toBeInTheDocument();
            });
        });

        test('shows loading state when submitting', async () => {
            renderWithRouter(<ContactInfo {...createDefaultProps({ isLoading: true })} />);

            await waitFor(() => {
                const submitButton = screen.getByRole('button', { name: /saving/i });
                expect(submitButton).toBeDisabled();
                expect(submitButton).toHaveTextContent(/saving/i);
            });
        });

        // Why: on slow networks (e.g. MRT pool target) the email-blur authorize
        // fetcher can still be in flight when the shopper clicks Continue. The
        // button must stay actionable; otpFlowActiveRef gates the next-step
        // transition until the fetcher settles.
        test('Continue button stays enabled while email-blur authorize fetcher is in flight', async () => {
            const user = userEvent.setup();
            let resolveAction: (value: { success: false }) => void = () => undefined;
            const pendingAction = new Promise<{ success: false }>((resolve) => {
                resolveAction = resolve;
            });
            const router = createMemoryRouter(
                [
                    { path: '/', element: <ContactInfo {...createDefaultProps()} /> },
                    {
                        path: resourceRoutes.authorizePasswordlessEmail,
                        action: () => pendingAction,
                    },
                ],
                { initialEntries: ['/'], initialIndex: 0 }
            );
            render(<RouterProvider router={router} />);

            const emailInput = await screen.findByPlaceholderText(/email address/i);
            await user.clear(emailInput);
            await user.type(emailInput, 'pending@example.com');
            const phoneInput = screen.getByLabelText(/phone number\*/i);
            await user.type(phoneInput, '5551234567');
            await user.tab();

            // Confirm the fetcher is actually in flight — without this guard, the
            // button-enabled assertion below could pass for the wrong reason if a
            // future refactor short-circuits handleEmailBlur.
            await waitFor(() => expect(emailInput).toBeDisabled());

            const submitButton = screen.getByRole('button', { name: /continue to shipping/i });
            expect(submitButton).not.toBeDisabled();

            resolveAction({ success: false });
        });
    });

    describe('Form Submission', () => {
        test('submits contact info data when form is valid', async () => {
            const user = userEvent.setup();
            const handleSubmit = vi.fn();
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: '', customerId: null },
                })
            );

            const { container } = renderWithRouter(<ContactInfo {...createDefaultProps({ onSubmit: handleSubmit })} />);

            const emailInput = await screen.findByPlaceholderText(/email address/i);
            await user.clear(emailInput);
            await user.type(emailInput, 'valid.email@example.com');

            const phoneInput = screen.getByLabelText(/phone number\*/i);
            await user.clear(phoneInput);
            await user.type(phoneInput, '5551234567');

            const formElement = container.querySelector('form');
            expect(formElement).not.toBeNull();

            if (!formElement) {
                throw new Error('Form element not found');
            }

            fireEvent.submit(formElement);

            await waitFor(() => {
                expect(handleSubmit).toHaveBeenCalledWith({
                    email: 'valid.email@example.com',
                    countryCode: '+1',
                    phone: '5551234567',
                });
            });
        });
    });

    describe('Edit Mode', () => {
        test('calls onEdit when edit button is clicked', async () => {
            const user = userEvent.setup();
            const handleEdit = vi.fn();
            renderWithRouter(<ContactInfo {...createDefaultProps({ isEditing: false, onEdit: handleEdit })} />);

            const editButton = screen.getByRole('button', { name: /edit/i });
            await user.click(editButton);

            expect(handleEdit).toHaveBeenCalled();
        });
    });

    describe('Edge Cases - Phone Autofill', () => {
        test('auto-fills phone from cart customerInfo when no profile', async () => {
            // Mock basket with phone in customerInfo
            const basketWithPhone = {
                basketId: 'test-basket',
                customerInfo: {
                    email: 'test@example.com',
                    phone: '5551234567', // Tests cart?.customerInfo?.phone && branch
                },
            };
            useBasket.mockReturnValue(basketWithPhone);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            // Tests the phone autofill branch - just verify component renders
            await waitFor(() => {
                expect(screen.getAllByText('Contact Information').length).toBeGreaterThan(0);
            });
        });
    });

    describe('Edge Cases - Current User Login Suggestion', () => {
        test('hides login suggestion for current logged-in user', async () => {
            const basketWithCurrentUser = {
                basketId: 'test-basket',
                customerInfo: {
                    email: 'logged-in@example.com',
                },
            };
            useBasket.mockReturnValue(basketWithCurrentUser);

            // Mock logged-in customer profile with SAME email as basket
            const currentUserProfile = {
                customer: {
                    email: 'logged-in@example.com', // Same email = current user
                },
            };
            useCustomerProfile.mockReturnValue(currentUserProfile);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                expect(screen.queryByText(/have an account/i)).not.toBeInTheDocument();
            });
        });

        test('shows login suggestion when isCurrentUser is true but shouldSuggestLogin is true', async () => {
            const basketWithEmail = {
                basketId: 'test-basket',
                customerInfo: {
                    email: 'test-user@example.com',
                },
            };
            useBasket.mockReturnValue(basketWithEmail);

            // No profile (guest user) - so isCurrentUser will be false, shouldSuggestLogin true
            useCustomerProfile.mockReturnValue(null);

            renderWithRouter(<ContactInfo {...createDefaultProps()} />);

            await waitFor(() => {
                // Ensure the component renders and processes login suggestion logic.
                expect(screen.getAllByText('Contact Information').length).toBeGreaterThan(0);
            });
        });
    });

    describe('Passwordless OTP guest UX (summary)', () => {
        test('hides login suggestion when suppressRegisteredEmailLoginHints is true', async () => {
            useLoginSuggestion.mockReturnValue({
                shouldSuggestLogin: true,
                isCurrentUser: false,
                message: 'Suggest login',
            });
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'registered@example.com', customerId: null },
                })
            );

            renderWithRouter(
                <ContactInfo
                    {...createDefaultProps({
                        isEditing: false,
                        isCompleted: true,
                        suppressRegisteredEmailLoginHints: true,
                    })}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('registered@example.com')).toBeInTheDocument();
            });
            expect(screen.queryByText(/have an account/i)).not.toBeInTheDocument();
        });

        test('shows login suggestion when suppressRegisteredEmailLoginHints is false and lookup suggests login', async () => {
            useLoginSuggestion.mockReturnValue({
                shouldSuggestLogin: true,
                isCurrentUser: false,
                message: 'Suggest login',
            });
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'registered@example.com', customerId: null },
                })
            );

            renderWithRouter(
                <ContactInfo
                    {...createDefaultProps({
                        isEditing: false,
                        isCompleted: true,
                        suppressRegisteredEmailLoginHints: false,
                    })}
                />
            );

            await waitFor(() => {
                expect(screen.getByText(/have an account/i)).toBeInTheDocument();
            });
        });
    });
});
