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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';
import { AddressFormFields } from './index';

// Mock the address autocomplete hooks
vi.mock('@/hooks/use-autocomplete-suggestions', () => ({
    useAutocompleteSuggestions: vi.fn(() => ({
        suggestions: [],
        isLoading: false,
        resetSession: vi.fn(),
        fetchSuggestions: vi.fn(),
    })),
    MIN_INPUT_LENGTH: 3,
}));

vi.mock('@/lib/address/address-suggestions', () => ({
    processAddressSuggestion: vi.fn(),
}));

// Test form data structure
interface TestFormData {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    stateCode: string;
    postalCode: string;
    phone: string;
}

// Test form data with billing prefix
interface TestBillingFormData {
    billingFirstName: string;
    billingLastName: string;
    billingAddress1: string;
    billingAddress2: string;
    billingCity: string;
    billingStateCode: string;
    billingPostalCode: string;
}

// Wrapper component to provide form context
function TestWrapper({
    children,
    defaultValues = {},
}: {
    children: (form: ReturnType<typeof useForm<TestFormData>>) => React.ReactNode;
    defaultValues?: Partial<TestFormData>;
}) {
    const form = useForm<TestFormData>({
        defaultValues: {
            firstName: '',
            lastName: '',
            address1: '',
            address2: '',
            city: '',
            stateCode: '',
            postalCode: '',
            phone: '',
            ...defaultValues,
        },
    });

    return <FormProvider {...form}>{children(form)}</FormProvider>;
}

// Wrapper for billing address form with prefix
function TestBillingWrapper({
    children,
    defaultValues = {},
}: {
    children: (form: ReturnType<typeof useForm<TestBillingFormData>>) => React.ReactNode;
    defaultValues?: Partial<TestBillingFormData>;
}) {
    const form = useForm<TestBillingFormData>({
        defaultValues: {
            billingFirstName: '',
            billingLastName: '',
            billingAddress1: '',
            billingAddress2: '',
            billingCity: '',
            billingStateCode: '',
            billingPostalCode: '',
            ...defaultValues,
        },
    });

    return <FormProvider {...form}>{children(form)}</FormProvider>;
}

describe('AddressFormFields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        test('renders all address fields without prefix', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/address line 2|apartment|suite/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /city/i })).toBeInTheDocument();
            // State is a combobox (NativeSelect) when countryCode is US (default)
            expect(screen.getByRole('combobox', { name: /state/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/\(000\) 000-0000/)).toBeInTheDocument();
        });

        test('renders all address fields with billing prefix', () => {
            render(
                <TestBillingWrapper>
                    {(form) => <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />}
                </TestBillingWrapper>
            );

            expect(screen.getByPlaceholderText(/first name/i)).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/last name/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toBeInTheDocument();
            expect(screen.getByPlaceholderText(/address line 2|apartment|suite/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /city/i })).toBeInTheDocument();
            // State is a combobox when countryCode is US (default)
            expect(screen.getByRole('combobox', { name: /state/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toBeInTheDocument();
        });

        test('hides phone field when showPhone is false', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} showPhone={false} />}</TestWrapper>);

            expect(screen.queryByPlaceholderText(/\(000\) 000-0000/)).not.toBeInTheDocument();
        });

        test('shows phone field when showPhone is true', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} showPhone={true} />}</TestWrapper>);

            expect(screen.getByPlaceholderText(/\(000\) 000-0000/)).toBeInTheDocument();
        });

        test('applies custom className to container', () => {
            const { container } = render(
                <TestWrapper>{(form) => <AddressFormFields form={form} className="custom-class" />}</TestWrapper>
            );

            expect(container.querySelector('.custom-class')).toBeInTheDocument();
        });
    });

    describe('Form Labels', () => {
        test('renders correct labels for address fields', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            expect(screen.getByText(/first name/i)).toBeInTheDocument();
            expect(screen.getByText(/last name/i)).toBeInTheDocument();
            expect(screen.getByText(/address line 1|^address$/i)).toBeInTheDocument();
            expect(screen.getByText(/address line 2/i)).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /city/i })).toBeInTheDocument();
            expect(screen.getByRole('combobox', { name: /state/i })).toBeInTheDocument();
            expect(screen.getByText(/zip code|postal code/i)).toBeInTheDocument();
            expect(screen.getByText(/phone number/i)).toBeInTheDocument();
        });
    });

    describe('AutoComplete Attributes', () => {
        test('sets shipping autoComplete values when no prefix', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            expect(screen.getByPlaceholderText(/first name/i)).toHaveAttribute('autocomplete', 'shipping given-name');
            expect(screen.getByPlaceholderText(/last name/i)).toHaveAttribute('autocomplete', 'shipping family-name');
            expect(screen.getByPlaceholderText(/address line 2|apartment|suite/i)).toHaveAttribute(
                'autocomplete',
                'shipping address-line2'
            );
            expect(screen.getByRole('textbox', { name: /city/i })).toHaveAttribute(
                'autocomplete',
                'shipping address-level2'
            );
            // State is a combobox when countryCode is US
            expect(screen.getByRole('combobox', { name: /state/i })).toHaveAttribute(
                'autocomplete',
                'shipping address-level1'
            );
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toHaveAttribute(
                'autocomplete',
                'shipping postal-code'
            );
        });

        test('sets billing autoComplete values when billing prefix', () => {
            render(
                <TestBillingWrapper>
                    {(form) => <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />}
                </TestBillingWrapper>
            );

            expect(screen.getByPlaceholderText(/first name/i)).toHaveAttribute('autocomplete', 'billing given-name');
            expect(screen.getByPlaceholderText(/last name/i)).toHaveAttribute('autocomplete', 'billing family-name');
            expect(screen.getByPlaceholderText(/address line 2|apartment|suite/i)).toHaveAttribute(
                'autocomplete',
                'billing address-line2'
            );
            expect(screen.getByRole('textbox', { name: /city/i })).toHaveAttribute(
                'autocomplete',
                'billing address-level2'
            );
            // State is a combobox when countryCode is US
            expect(screen.getByRole('combobox', { name: /state/i })).toHaveAttribute(
                'autocomplete',
                'billing address-level1'
            );
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toHaveAttribute(
                'autocomplete',
                'billing postal-code'
            );
        });

        test('sets autocomplete street-address for address1 field', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toHaveAttribute(
                'autocomplete',
                'shipping street-address'
            );
        });

        test('sets autocomplete street-address for address1 field with billing prefix', () => {
            render(
                <TestBillingWrapper>
                    {(form) => <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />}
                </TestBillingWrapper>
            );

            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toHaveAttribute(
                'autocomplete',
                'billing street-address'
            );
        });
    });

    describe('User Input', () => {
        test('allows typing in all fields', async () => {
            const user = userEvent.setup();

            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            const firstNameInput = screen.getByPlaceholderText(/first name/i);
            await user.type(firstNameInput, 'John');
            expect(firstNameInput).toHaveValue('John');

            const lastNameInput = screen.getByPlaceholderText(/last name/i);
            await user.type(lastNameInput, 'Doe');
            expect(lastNameInput).toHaveValue('Doe');

            const addressInput = screen.getByRole('textbox', { name: /address line 1|^address$/i });
            await user.type(addressInput, '123 Main St');
            expect(addressInput).toHaveValue('123 Main St');

            const cityInput = screen.getByRole('textbox', { name: /city/i });
            await user.type(cityInput, 'New York');
            expect(cityInput).toHaveValue('New York');
        });

        test('updates form values when typing', async () => {
            const user = userEvent.setup();

            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            const firstNameInput = screen.getByPlaceholderText(/first name/i);
            await user.type(firstNameInput, 'Jane');

            await waitFor(() => {
                expect(firstNameInput).toHaveValue('Jane');
            });
        });
    });

    describe('Pre-filled Values', () => {
        test('displays pre-filled values from form defaultValues', () => {
            render(
                <TestWrapper
                    defaultValues={{
                        firstName: 'Alice',
                        lastName: 'Smith',
                        address1: '456 Oak Ave',
                        city: 'Boston',
                        stateCode: 'MA',
                        postalCode: '02101',
                        phone: '5551234567',
                    }}>
                    {(form) => <AddressFormFields form={form} />}
                </TestWrapper>
            );

            expect(screen.getByPlaceholderText(/first name/i)).toHaveValue('Alice');
            expect(screen.getByPlaceholderText(/last name/i)).toHaveValue('Smith');
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toHaveValue('456 Oak Ave');
            expect(screen.getByRole('textbox', { name: /city/i })).toHaveValue('Boston');
            expect(screen.getByRole('combobox', { name: /state/i })).toHaveValue('MA');
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toHaveValue('02101');
            expect(screen.getByPlaceholderText(/\(000\) 000-0000/)).toHaveValue('5551234567');
        });

        test('displays pre-filled billing address values', () => {
            render(
                <TestBillingWrapper
                    defaultValues={{
                        billingFirstName: 'Bob',
                        billingLastName: 'Johnson',
                        billingAddress1: '789 Pine St',
                        billingCity: 'Chicago',
                        billingStateCode: 'IL',
                        billingPostalCode: '60601',
                    }}>
                    {(form) => <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />}
                </TestBillingWrapper>
            );

            expect(screen.getByPlaceholderText(/first name/i)).toHaveValue('Bob');
            expect(screen.getByPlaceholderText(/last name/i)).toHaveValue('Johnson');
            expect(screen.getByRole('textbox', { name: /address line 1|^address$/i })).toHaveValue('789 Pine St');
            expect(screen.getByRole('textbox', { name: /city/i })).toHaveValue('Chicago');
            expect(screen.getByRole('combobox', { name: /state/i })).toHaveValue('IL');
            expect(screen.getByRole('textbox', { name: /zip|postal/i })).toHaveValue('60601');
        });
    });

    describe('Address Autocomplete', () => {
        test('shows suggestions dropdown when typing in address field', async () => {
            const user = userEvent.setup();
            const mockSuggestions = [
                {
                    description: '123 Test Street, City, ST 12345',
                    place_id: 'place-1',
                    structured_formatting: {
                        main_text: '123 Test Street',
                        secondary_text: 'City, ST 12345',
                    },
                },
            ];

            const { useAutocompleteSuggestions } = await import('@/hooks/use-autocomplete-suggestions');
            (useAutocompleteSuggestions as ReturnType<typeof vi.fn>).mockReturnValue({
                suggestions: mockSuggestions,
                isLoading: false,
                resetSession: vi.fn(),
                fetchSuggestions: vi.fn(),
            });

            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            const addressInput = screen.getByRole('textbox', { name: /address line 1|^address$/i });
            await user.type(addressInput, '123 Test');

            // The dropdown should appear when suggestions are present
            await waitFor(() => {
                expect(screen.getByTestId('address-suggestion-dropdown')).toBeInTheDocument();
            });
        });

        test('does not show suggestions when input is less than MIN_INPUT_LENGTH', async () => {
            const user = userEvent.setup();

            const { useAutocompleteSuggestions } = await import('@/hooks/use-autocomplete-suggestions');
            (useAutocompleteSuggestions as ReturnType<typeof vi.fn>).mockReturnValue({
                suggestions: [],
                isLoading: false,
                resetSession: vi.fn(),
                fetchSuggestions: vi.fn(),
            });

            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            const addressInput = screen.getByRole('textbox', { name: /address line 1|^address$/i });
            await user.type(addressInput, '12'); // Only 2 characters

            // Dropdown should not be visible
            expect(screen.queryByTestId('address-suggestion-dropdown')).not.toBeInTheDocument();
        });
    });

    describe('AutoFocus', () => {
        test('does not autofocus address1 when autoFocus is false', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} autoFocus={false} />}</TestWrapper>);

            const addressInput = screen.getByRole('textbox', { name: /address line 1|^address$/i });
            expect(document.activeElement).not.toBe(addressInput);
        });

        test('sets autoFocus on address1 when autoFocus is true', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} autoFocus={true} />}</TestWrapper>);

            const addressInput = screen.getByRole('textbox', { name: /address line 1|^address$/i });
            // React handles autoFocus as a prop, the element should be focused after render
            expect(document.activeElement).toBe(addressInput);
        });
    });

    describe('Phone Field Formatting', () => {
        test('shows raw digits while typing and formats on blur', async () => {
            const user = userEvent.setup();
            render(<TestWrapper>{(form) => <AddressFormFields form={form} showPhone />}</TestWrapper>);

            const phoneInput = screen.getByPlaceholderText(/\(000\) 000-0000/);
            await user.type(phoneInput, '5551234567');
            expect(phoneInput).toHaveValue('5551234567');

            await user.tab();
            expect(phoneInput).toHaveValue('(555) 123-4567');
        });

        test('strips formatting on focus for editing', async () => {
            const user = userEvent.setup();
            render(
                <TestWrapper defaultValues={{ phone: '(555) 123-4567' }}>
                    {(form) => <AddressFormFields form={form} showPhone />}
                </TestWrapper>
            );

            const phoneInput = screen.getByPlaceholderText(/\(000\) 000-0000/);
            await user.click(phoneInput);
            expect(phoneInput).toHaveValue('5551234567');
        });

        test('limits phone input to 10 digits', async () => {
            const user = userEvent.setup();
            render(<TestWrapper>{(form) => <AddressFormFields form={form} showPhone />}</TestWrapper>);

            const phoneInput = screen.getByPlaceholderText(/\(000\) 000-0000/);
            await user.type(phoneInput, '12345678901234');
            expect(phoneInput).toHaveValue('1234567890');
        });
    });

    describe('Field Name Prefixing', () => {
        test('generates correct field names without prefix', () => {
            render(<TestWrapper>{(form) => <AddressFormFields form={form} />}</TestWrapper>);

            // Check that input names are correct (no prefix)
            const firstNameInput = screen.getByPlaceholderText(/first name/i);
            expect(firstNameInput).toHaveAttribute('name', 'firstName');
        });

        test('generates correct field names with billing prefix', () => {
            render(
                <TestBillingWrapper>
                    {(form) => <AddressFormFields form={form} fieldPrefix="billing" showPhone={false} />}
                </TestBillingWrapper>
            );

            // Check that input names include billing prefix
            const firstNameInput = screen.getByPlaceholderText(/first name/i);
            expect(firstNameInput).toHaveAttribute('name', 'billingFirstName');
        });
    });
});
