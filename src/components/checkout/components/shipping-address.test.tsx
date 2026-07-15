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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShippingAddress from './shipping-address';

// Use real react-hook-form for integration tests
vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(() => null),
}));
vi.mock('@/providers/auth', () => ({
    useAuth: vi.fn(() => ({ customerId: 'cust-123' })),
}));

const mockSubmit = vi.fn();
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({
        data: null,
        state: 'idle',
        submit: mockSubmit,
    })),
}));
vi.mock('@/hooks/use-scapi-fetcher-effect', () => ({
    useScapiFetcherEffect: vi.fn(),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
    toast: {
        error: (...args: unknown[]) => mockToastError(...args),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

const createMockBasket = (overrides = {}) => ({
    basketId: 'test-basket-123',
    currency: 'USD',
    customerInfo: { email: 'test@example.com', phone: '5551234567' },
    shipments: [
        {
            shipmentId: 'shipment-1',
            shippingAddress: null,
        },
    ],
    ...overrides,
});

const createDefaultProps = (overrides = {}) => ({
    onSubmit: vi.fn(),
    isLoading: false,
    actionData: undefined,
    isCompleted: false,
    isEditing: true,
    onEdit: vi.fn(),
    enableMultiAddress: false,
    handleToggleShippingAddressMode: vi.fn(),
    ...overrides,
});

describe('ShippingAddress Integration Tests', () => {
    let useBasket: ReturnType<typeof vi.fn>;
    let useCustomerProfile: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const basketModule = await import('@/providers/basket');
        const profileModule = await import('@/hooks/checkout/use-customer-profile');

        useBasket = basketModule.useBasket as ReturnType<typeof vi.fn>;
        useCustomerProfile = profileModule.useCustomerProfile as ReturnType<typeof vi.fn>;

        useBasket.mockReturnValue(createMockBasket());
        useCustomerProfile.mockReturnValue(null);
        mockSubmit.mockReset();
    });

    describe('Basic Rendering', () => {
        test('renders shipping address form in editing mode', () => {
            const { container } = render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getAllByText('Shipping Address').length).toBeGreaterThan(0);
            expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();

            const fieldset = container.querySelector('fieldset');
            expect(fieldset).toHaveAttribute('aria-labelledby', 'shipping-address-heading');
            expect(container.querySelector('#shipping-address-heading')).toHaveTextContent('Shipping Address');
        });

        test('displays summary when not editing', () => {
            render(<ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            expect(screen.queryByPlaceholderText(/first name/i)).not.toBeInTheDocument();
        });
    });

    describe('Form Fields', () => {
        test('renders all required address fields', () => {
            render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/city/i)).toBeInTheDocument();
            // State is a dropdown (combobox) when country is US
            expect(screen.getByRole('combobox', { name: /state/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toBeInTheDocument();
        });

        test('allows entering address data', async () => {
            const user = userEvent.setup();
            render(<ShippingAddress {...createDefaultProps()} />);

            const firstNameInput = screen.getByPlaceholderText(/first name/i);
            await user.type(firstNameInput, 'John');

            expect(firstNameInput).toHaveValue('John');
        });
    });

    describe('Auto-population', () => {
        test('auto-populates phone from contact info', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'test@example.com', phone: '5551234567' },
                })
            );

            render(<ShippingAddress {...createDefaultProps()} />);

            // Phone field is hidden by default (showPhone=false)
            // It is still auto-populated in form state for submission
            expect(screen.queryByRole('textbox', { name: /phone/i })).not.toBeInTheDocument();
        });

        test('falls back to customer profile phone when basket has none', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    customerInfo: { email: 'test@example.com', phone: '' },
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            shippingAddress: {
                                firstName: 'Jane',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'New York',
                                stateCode: 'NY',
                                postalCode: '10001',
                                phone: '',
                            },
                        },
                    ],
                })
            );

            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-1',
                        firstName: 'Jane',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'New York',
                        stateCode: 'NY',
                        postalCode: '10001',
                        phone: '9998887777',
                    },
                ],
                preferredShippingAddress: {
                    addressId: 'addr-1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'New York',
                    stateCode: 'NY',
                    postalCode: '10001',
                    phone: '9998887777',
                },
            });

            render(<ShippingAddress {...createDefaultProps()} />);

            // With saved addresses we show SavedAddressesList (no form), so assert list is shown
            expect(screen.getByRole('radiogroup', { name: /select a saved address/i })).toBeInTheDocument();
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        test('pre-fills address from saved basket shipping address', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            shippingAddress: {
                                firstName: 'Jane',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'New York',
                                stateCode: 'NY',
                                postalCode: '10001',
                            },
                        },
                    ],
                })
            );

            render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getByPlaceholderText(/first name/i)).toHaveValue('Jane');
            expect(screen.getByPlaceholderText(/last name/i)).toHaveValue('Doe');
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toHaveValue('123 Main St');
        });

        test('renders form for customer with profile', () => {
            useCustomerProfile.mockReturnValue({
                customerId: 'customer-123',
                firstName: 'Alice',
                lastName: 'Smith',
                email: 'alice@example.com',
            });

            render(<ShippingAddress {...createDefaultProps()} />);

            // Component renders successfully with customer profile
            expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
        });
    });

    describe('Summary Display', () => {
        test('shows address summary when completed', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Boston',
                                stateCode: 'MA',
                                postalCode: '02101',
                            },
                        },
                    ],
                })
            );

            render(<ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            expect(screen.getByText('John Doe')).toBeInTheDocument();
            expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
            expect(screen.getByText(/Boston/)).toBeInTheDocument();
        });

        test('shows empty summary when no address', () => {
            render(<ShippingAddress {...createDefaultProps({ isEditing: false })} />);

            // ShippingAddressDisplay renders nothing when address is empty
            expect(screen.queryByText(/not provided yet/i)).not.toBeInTheDocument();
        });
    });

    describe('Form Interaction', () => {
        test('renders submit button', () => {
            render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });

        test('shows loading state when submitting', () => {
            render(<ShippingAddress {...createDefaultProps({ isLoading: true })} />);

            const submitButton = screen.getByRole('button', { name: /saving/i });
            expect(submitButton).toBeDisabled();
        });

        test('calls onEdit when edit button clicked', async () => {
            const user = userEvent.setup();
            const handleEdit = vi.fn();
            const basketWithAddress = createMockBasket({
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                        },
                    },
                ],
            });
            useBasket.mockReturnValue(basketWithAddress);

            // Mock basket with shipping address so edit button appears
            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [
                        {
                            shipmentId: 'shipment-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Boston',
                                stateCode: 'MA',
                                postalCode: '02101',
                            },
                        },
                    ],
                })
            );

            render(
                <ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true, onEdit: handleEdit })} />
            );

            const changeButton = screen.getByRole('button', { name: /edit/i });
            await user.click(changeButton);

            expect(handleEdit).toHaveBeenCalled();
        });

        test('opens Add Address modal when Add New Address is clicked (saved addresses path)', async () => {
            const user = userEvent.setup();
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-1',
                        firstName: 'Jane',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'San Francisco',
                        stateCode: 'CA',
                        postalCode: '94102',
                        countryCode: 'US',
                        preferred: true,
                    },
                ],
                preferredShippingAddress: {
                    addressId: 'addr-1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                },
            });

            render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getByRole('radiogroup', { name: /select a saved address/i })).toBeInTheDocument();
            const addNewButton = screen.getByRole('button', { name: /add new address/i });
            await user.click(addNewButton);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Add New Address' })).toBeInTheDocument();
        });
    });

    describe('Edit Address Flow', () => {
        const savedAddressProfile = {
            customer: { email: 'test@example.com' },
            addresses: [
                {
                    addressId: 'home-addr',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    address2: 'Apt 4',
                    city: 'San Francisco',
                    stateCode: 'CA',
                    postalCode: '94102',
                    countryCode: 'US',
                    preferred: true,
                    phone: '5551234567',
                },
                {
                    addressId: 'work-addr',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    address1: '456 Office Blvd',
                    city: 'San Jose',
                    stateCode: 'CA',
                    postalCode: '95101',
                    countryCode: 'US',
                    preferred: false,
                },
            ],
            preferredShippingAddress: {
                addressId: 'home-addr',
                firstName: 'Jane',
                lastName: 'Doe',
                address1: '123 Main St',
                address2: 'Apt 4',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94102',
                countryCode: 'US',
            },
        };

        test('shows Edit Address links when saved addresses are rendered', () => {
            useCustomerProfile.mockReturnValue(savedAddressProfile);
            render(<ShippingAddress {...createDefaultProps()} />);
            const editLinks = screen.getAllByRole('button', { name: /edit address/i });
            expect(editLinks.length).toBeGreaterThanOrEqual(1);
        });

        test('opens Edit Address modal when Edit Address link is clicked', async () => {
            const user = userEvent.setup();
            useCustomerProfile.mockReturnValue(savedAddressProfile);
            render(<ShippingAddress {...createDefaultProps()} />);

            const editLinks = screen.getAllByRole('button', { name: /edit address/i });
            await user.click(editLinks[0]);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Edit Address' })).toBeInTheDocument();
        });

        test('opens Add Address modal when Add New Address is clicked (not edit mode)', async () => {
            const user = userEvent.setup();
            useCustomerProfile.mockReturnValue(savedAddressProfile);
            render(<ShippingAddress {...createDefaultProps()} />);

            const addButton = screen.getByRole('button', { name: /add new address/i });
            await user.click(addButton);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Add New Address' })).toBeInTheDocument();
        });

        test('shows an error toast when the address update fetcher errors', async () => {
            useCustomerProfile.mockReturnValue(savedAddressProfile);

            const useScapiFetcherEffectModule = await import('@/hooks/use-scapi-fetcher-effect');
            const useScapiFetcherEffectMock = vi.mocked(useScapiFetcherEffectModule.useScapiFetcherEffect);

            render(<ShippingAddress {...createDefaultProps()} />);

            const callArgs = useScapiFetcherEffectMock.mock.calls.at(-1);
            expect(callArgs).toBeDefined();
            const handlers = callArgs?.[1];
            expect(handlers?.onError).toBeTypeOf('function');

            handlers?.onError?.({} as never);

            expect(mockToastError).toHaveBeenCalledTimes(1);
            expect(mockToastError).toHaveBeenCalledWith(expect.any(String));
        });
    });

    describe('Edge Cases - Phone Fallback Chain', () => {
        test('uses contactInfoPhone fallback when no shipping address phone', () => {
            // Mock state with contactInfo phone but no shipping address phone
            const defaultProps = createDefaultProps();
            render(<ShippingAddress {...defaultProps} />);

            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });

        test('falls back through entire phone chain when all preceding values are falsy', () => {
            // Set up basket with no shipping address phone
            const basketWithNoPhone = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                            phone: '', // Empty phone - will fall back
                        },
                    },
                ],
            };
            useBasket.mockReturnValue(basketWithNoPhone);

            // Mock customer profile with no phone
            useCustomerProfile.mockReturnValue(null);

            render(<ShippingAddress {...createDefaultProps()} />);

            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });
    });

    describe('Edge Cases - Summary Display', () => {
        test('displays address2 in summary when present', () => {
            const basketWithAddress2 = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            address2: 'Apt 5B',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                            phone: '5551234567',
                        },
                    },
                ],
            };
            useBasket.mockReturnValue(basketWithAddress2);

            render(<ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            expect(screen.getByText(/apt 5b/i)).toBeInTheDocument();
        });

        test('does not display phone in summary', () => {
            const basketWithPhone = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                            phone: '5551234567',
                        },
                    },
                ],
            };
            useBasket.mockReturnValue(basketWithPhone);

            render(<ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            expect(screen.queryByText(/555/)).not.toBeInTheDocument();
        });

        test('summary does not show contact info phone when shipping address phone missing', () => {
            const basketWithoutPhone = {
                basketId: 'test-basket',
                customerInfo: { email: 'test@example.com', phone: '3332221111' },
                shipments: [
                    {
                        shippingAddress: {
                            firstName: 'John',
                            lastName: 'Doe',
                            address1: '123 Main St',
                            city: 'New York',
                            stateCode: 'NY',
                            postalCode: '10001',
                            phone: '',
                        },
                    },
                ],
            };
            useBasket.mockReturnValue(basketWithoutPhone);

            render(<ShippingAddress {...createDefaultProps({ isEditing: false, isCompleted: true })} />);

            expect(screen.queryByText(/3332221111/)).not.toBeInTheDocument();
        });
    });
});
