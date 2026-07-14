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
import { renderHook, render, act, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { usePayment, isSameBillingAndShippingAddress } from './use-payment';

vi.mock('@/providers/basket', () => ({ useBasket: vi.fn() }));
vi.mock('@/hooks/checkout/use-customer-profile', () => ({
    useCustomerProfile: vi.fn(() => null),
}));

const createMockBasket = (overrides = {}) => ({
    basketId: 'test-basket-123',
    currency: 'USD',
    customerInfo: { email: 'test@example.com', customerId: 'test-customer' },
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
                countryCode: 'US',
            },
        },
    ],
    paymentInstruments: [],
    ...overrides,
});

const createDefaultParams = (overrides = {}) => ({
    onSubmit: vi.fn(),
    actionData: undefined,
    isEditing: true,
    disabled: false,
    showUseDifferentBilling: true,
    ...overrides,
});

describe('isSameBillingAndShippingAddress', () => {
    test('returns true when all fields match', () => {
        const addr = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'New York',
            stateCode: 'NY',
            postalCode: '10001',
        };
        expect(isSameBillingAndShippingAddress(addr, { ...addr })).toBe(true);
    });

    test('returns false when firstName differs', () => {
        const billing = {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'NY',
            stateCode: 'NY',
            postalCode: '10001',
        };
        const shipping = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'NY',
            stateCode: 'NY',
            postalCode: '10001',
        };
        expect(isSameBillingAndShippingAddress(billing, shipping)).toBe(false);
    });

    test('returns false when billingAddr is undefined', () => {
        const shipping = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'NY',
            stateCode: 'NY',
            postalCode: '10001',
        };
        expect(isSameBillingAndShippingAddress(undefined, shipping)).toBe(false);
    });

    test('returns false when shippingAddr is undefined', () => {
        const billing = {
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'NY',
            stateCode: 'NY',
            postalCode: '10001',
        };
        expect(isSameBillingAndShippingAddress(billing, undefined)).toBe(false);
    });

    test('returns false when both are undefined', () => {
        expect(isSameBillingAndShippingAddress(undefined, undefined)).toBe(false);
    });
});

describe('usePayment hook', () => {
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
    });

    describe('payment method selection', () => {
        test('defaults to "new" when no saved payment methods', () => {
            const { result } = renderHook(() => usePayment(createDefaultParams()));
            expect(result.current.paymentRadioValue).toBe('new');
        });

        test('selects preferred saved payment method', async () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Visa', maskedNumber: '****1234' },
                        preferred: true,
                    },
                    {
                        paymentInstrumentId: 'card-2',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Mastercard', maskedNumber: '****5678' },
                        preferred: false,
                    },
                ],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            await waitFor(() => {
                expect(result.current.paymentRadioValue).toBe('card-1');
            });
        });

        test('selects first saved method when no preferred', async () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Visa', maskedNumber: '****1234' },
                        preferred: false,
                    },
                    {
                        paymentInstrumentId: 'card-2',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Mastercard', maskedNumber: '****5678' },
                        preferred: false,
                    },
                ],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            await waitFor(() => {
                expect(result.current.paymentRadioValue).toBe('card-1');
            });
        });

        test('handlePaymentMethodSelectionChange updates selection', async () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Visa', maskedNumber: '****1234' },
                        preferred: true,
                    },
                    {
                        paymentInstrumentId: 'card-2',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Mastercard', maskedNumber: '****5678' },
                        preferred: false,
                    },
                ],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            await waitFor(() => {
                expect(result.current.paymentRadioValue).toBe('card-1');
            });

            act(() => {
                result.current.handlePaymentMethodSelectionChange('card-2');
            });

            expect(result.current.paymentRadioValue).toBe('card-2');
        });

        test('preserves user-chosen method when saved methods effect re-runs', async () => {
            const profileData = {
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'card-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Visa', maskedNumber: '****1234' },
                        preferred: true,
                    },
                    {
                        paymentInstrumentId: 'card-2',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Mastercard', maskedNumber: '****5678' },
                        preferred: false,
                    },
                ],
            };

            useCustomerProfile.mockReturnValue(profileData);

            const { result, rerender } = renderHook(() => usePayment(createDefaultParams()));

            await waitFor(() => {
                expect(result.current.paymentRadioValue).toBe('card-1');
            });

            act(() => {
                result.current.handlePaymentMethodSelectionChange('card-2');
            });

            expect(result.current.paymentRadioValue).toBe('card-2');

            useCustomerProfile.mockReturnValue({ ...profileData });
            rerender();

            expect(result.current.paymentRadioValue).toBe('card-2');
        });
    });

    describe('view more / view less', () => {
        test('hides options beyond 3 by default and includes selected option in visible set', () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: Array.from({ length: 5 }, (_, i) => ({
                    paymentInstrumentId: `card-${i + 1}`,
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { cardType: 'Visa', maskedNumber: `****${1000 + i}` },
                    preferred: i === 0,
                })),
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            expect(result.current.allPaymentOptionIds).toHaveLength(6);
            expect(result.current.visiblePaymentOptionIds.length).toBeLessThan(6);
            expect(result.current.visiblePaymentOptionIds).toContain(result.current.paymentRadioValue);
        });

        test('handleViewLess collapses to 3 visible and triggers scroll', () => {
            const scrollIntoViewMock = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoViewMock;
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: Array.from({ length: 5 }, (_, i) => ({
                    paymentInstrumentId: `card-${i + 1}`,
                    paymentMethodId: 'CREDIT_CARD',
                    paymentCard: { cardType: 'Visa', maskedNumber: `****${1000 + i}` },
                    preferred: i === 0,
                })),
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            act(() => {
                result.current.setShowAllPaymentOptions(true);
            });

            expect(result.current.visiblePaymentOptionIds).toEqual(result.current.allPaymentOptionIds);

            act(() => {
                result.current.handleViewLess();
            });

            expect(result.current.visiblePaymentOptionIds.length).toBeLessThanOrEqual(4);
            expect(result.current.hiddenPaymentCount).toBeGreaterThan(0);
        });
    });

    describe('summary values', () => {
        test('derives summary from basket payment instrument', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    paymentInstruments: [
                        {
                            paymentMethodId: 'CREDIT_CARD',
                            paymentCard: {
                                cardType: 'Visa',
                                numberLastDigits: '1234',
                                expirationMonth: 12,
                                expirationYear: 2027,
                            },
                        },
                    ],
                })
            );

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            expect(result.current.hasSummaryPaymentMethod).toBe(true);
            expect(result.current.summaryLastFour).toBe('1234');
            expect(result.current.summaryExpiryMonth).toBe('12');
            expect(result.current.summaryExpiryYear).toBe('2027');
            expect(result.current.hasSummaryExpiry).toBe(true);
        });

        test('pads single-digit month with leading zero', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    paymentInstruments: [
                        {
                            paymentMethodId: 'CREDIT_CARD',
                            paymentCard: {
                                cardType: 'Visa',
                                numberLastDigits: '1234',
                                expirationMonth: 3,
                                expirationYear: 2028,
                            },
                        },
                    ],
                })
            );

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            expect(result.current.summaryExpiryMonth).toBe('03');
        });

        test('returns empty summary when no payment instrument or saved method', () => {
            const { result } = renderHook(() => usePayment(createDefaultParams()));

            expect(result.current.hasSummaryPaymentMethod).toBe(false);
            expect(result.current.summaryMethodLabel).toBe('');
        });
    });

    describe('billing address', () => {
        test('filters out billing addresses that match shipping', () => {
            const shippingAddr = {
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'New York',
                stateCode: 'NY',
                postalCode: '10001',
                countryCode: 'US',
            };

            useBasket.mockReturnValue(
                createMockBasket({
                    shipments: [{ shipmentId: 'shipment-1', shippingAddress: shippingAddr }],
                })
            );

            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-same',
                        ...shippingAddr,
                        preferred: false,
                    },
                    {
                        addressId: 'addr-different',
                        firstName: 'Jane',
                        lastName: 'Smith',
                        address1: '456 Oak Ave',
                        city: 'Boston',
                        stateCode: 'MA',
                        postalCode: '02101',
                        countryCode: 'US',
                        preferred: false,
                    },
                ],
                paymentInstruments: [],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            expect(result.current.billingAddressOptions).toHaveLength(1);
            expect(result.current.billingAddressOptions[0].firstName).toBe('Jane');
        });

        test('handleBillingAddressChange sets all billing fields', () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-1',
                        firstName: 'Alice',
                        lastName: 'Wonder',
                        address1: '789 Elm St',
                        address2: 'Apt 4',
                        city: 'Chicago',
                        stateCode: 'IL',
                        postalCode: '60601',
                        countryCode: 'US',
                        phone: '555-1234',
                        preferred: false,
                    },
                ],
                paymentInstruments: [],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            act(() => {
                result.current.handleBillingAddressChange('addr-1');
            });

            expect(result.current.selectedBillingAddressId).toBe('addr-1');
            const formValues = result.current.form.getValues();
            expect(formValues.billingFirstName).toBe('Alice');
            expect(formValues.billingLastName).toBe('Wonder');
            expect(formValues.billingAddress1).toBe('789 Elm St');
            expect(formValues.billingCity).toBe('Chicago');
            expect(formValues.billingStateCode).toBe('IL');
            expect(formValues.billingPostalCode).toBe('60601');
            expect(formValues.billingCountryCode).toBe('US');
        });

        test('handleBillingAddressChange clears fields for "new"', () => {
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [
                    {
                        addressId: 'addr-1',
                        firstName: 'Alice',
                        lastName: 'Wonder',
                        address1: '789 Elm St',
                        city: 'Chicago',
                        stateCode: 'IL',
                        postalCode: '60601',
                        countryCode: 'US',
                        preferred: false,
                    },
                ],
                paymentInstruments: [],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams()));

            act(() => {
                result.current.handleBillingAddressChange('addr-1');
            });

            act(() => {
                result.current.handleBillingAddressChange('new');
            });

            expect(result.current.selectedBillingAddressId).toBe('new');
            const formValues = result.current.form.getValues();
            expect(formValues.billingFirstName).toBe('');
            expect(formValues.billingCity).toBe('');
        });
    });

    describe('form submission', () => {
        test('handleFormSubmit calls onSubmit with saved payment data including form fields', async () => {
            const onSubmit = vi.fn();
            useCustomerProfile.mockReturnValue({
                customer: { email: 'test@example.com' },
                addresses: [],
                paymentInstruments: [
                    {
                        paymentInstrumentId: 'saved-1',
                        paymentMethodId: 'CREDIT_CARD',
                        paymentCard: { cardType: 'Visa', maskedNumber: '****1234' },
                        preferred: true,
                    },
                ],
            });

            const { result } = renderHook(() => usePayment(createDefaultParams({ onSubmit })));

            await waitFor(() => {
                expect(result.current.paymentRadioValue).toBe('saved-1');
            });

            act(() => {
                result.current.handleFormSubmit(result.current.form.getValues());
            });

            expect(onSubmit).toHaveBeenCalledTimes(1);
            const submittedData = onSubmit.mock.calls[0][0];
            expect(submittedData.useSavedPaymentMethod).toBe(true);
            expect(submittedData.selectedSavedPaymentMethod).toBe('saved-1');
            expect(submittedData).toHaveProperty('useDifferentBilling');
            expect(submittedData).toHaveProperty('billingFirstName');
        });

        test('handleFormSubmit calls onSubmit with new card data', () => {
            const onSubmit = vi.fn();
            const { result } = renderHook(() => usePayment(createDefaultParams({ onSubmit })));

            act(() => {
                result.current.handleFormSubmit(result.current.form.getValues());
            });

            expect(onSubmit).toHaveBeenCalledTimes(1);
            const submittedData = onSubmit.mock.calls[0][0];
            expect(submittedData.useSavedPaymentMethod).toBe(false);
            expect(submittedData.selectedSavedPaymentMethod).toBeUndefined();
            expect(submittedData).toHaveProperty('cardNumber');
            expect(submittedData).toHaveProperty('expiryDate');
        });
    });

    describe('payment submission ref', () => {
        const makeSubmissionRef = () => ({
            current: {
                formDataGetter: null as (() => unknown) | null,
                shouldPlaceOrderAfterPayment: false,
                options: null,
                setFormErrors: null as ((errors: Record<string, { type: string; message: string }>) => void) | null,
                billingAddressGetter: null as (() => unknown) | null,
            },
        });

        test('populates formDataGetter that returns complete payment data', () => {
            const submissionRef = makeSubmissionRef();

            renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            expect(submissionRef.current.formDataGetter).toBeInstanceOf(Function);
            expect(submissionRef.current.setFormErrors).toBeInstanceOf(Function);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const data = submissionRef.current.formDataGetter!() as Record<string, unknown>;
            expect(data.useSavedPaymentMethod).toBe(false);
            expect(data.selectedSavedPaymentMethod).toBeUndefined();
            expect(data).toHaveProperty('cardNumber');
            expect(data).toHaveProperty('useDifferentBilling');
        });

        test('setFormErrors propagates errors to form state', () => {
            const submissionRef = makeSubmissionRef();

            const { result } = renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            act(() => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                submissionRef.current.setFormErrors!({
                    cardNumber: { type: 'server', message: 'Card declined' },
                });
            });

            expect(result.current.form.formState.errors.cardNumber?.message).toBe('Card declined');
        });

        test('setFormErrors focuses the first invalid field', () => {
            const submissionRef = makeSubmissionRef();

            const { result } = renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            const setFocusSpy = vi.spyOn(result.current.form, 'setFocus');

            act(() => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                submissionRef.current.setFormErrors!({
                    cardNumber: { type: 'validation', message: 'Enter a valid card number.' },
                    cvv: { type: 'validation', message: 'CVV is required' },
                });
            });

            // First entry in visible-field order wins; setFocus should have been
            // called with cardNumber.
            expect(setFocusSpy).toHaveBeenCalledWith('cardNumber');
        });

        test('setFormErrors moves document.activeElement to the first invalid field', () => {
            const submissionRef = makeSubmissionRef();

            // Bind usePayment to real inputs so form.setFocus() has a target it can
            // actually move keyboard focus to. renderHook alone doesn't produce
            // registered DOM nodes, which would leave activeElement on <body>.
            const Harness = () => {
                const payment = usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                );
                return createElement(
                    'form',
                    null,
                    createElement('input', {
                        'data-testid': 'input-cardholderName',
                        ...payment.form.register('cardholderName'),
                    }),
                    createElement('input', {
                        'data-testid': 'input-cardNumber',
                        ...payment.form.register('cardNumber'),
                    }),
                    createElement('input', {
                        'data-testid': 'input-expiryDate',
                        ...payment.form.register('expiryDate'),
                    }),
                    createElement('input', {
                        'data-testid': 'input-cvv',
                        ...payment.form.register('cvv'),
                    })
                );
            };

            const { getByTestId } = render(createElement(Harness));

            act(() => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                submissionRef.current.setFormErrors!({
                    cvv: { type: 'validation', message: 'CVV is required' },
                    cardNumber: { type: 'validation', message: 'Enter a valid card number.' },
                });
            });

            // DOM order (cardNumber before cvv) beats object-key order (cvv first).
            expect(document.activeElement).toBe(getByTestId('input-cardNumber'));
        });

        test('cleans up ref callbacks on unmount', () => {
            const submissionRef = makeSubmissionRef();

            const { unmount } = renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            expect(submissionRef.current.formDataGetter).toBeInstanceOf(Function);
            unmount();
            expect(submissionRef.current.formDataGetter).toBeNull();
            expect(submissionRef.current.setFormErrors).toBeNull();
        });

        test('registers billingAddressGetter that returns null when useDifferentBilling is false', () => {
            const submissionRef = makeSubmissionRef();

            const { result } = renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            // Default form state has useDifferentBilling: false
            expect(result.current.form.getValues('useDifferentBilling')).toBe(false);
            expect(submissionRef.current.billingAddressGetter).toBeInstanceOf(Function);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            expect(submissionRef.current.billingAddressGetter!()).toBeNull();
        });

        test('getter returns an OrderAddress when useDifferentBilling is true and fields are set', () => {
            const submissionRef = makeSubmissionRef();

            // Pre-seed the basket with a distinct billing address so useDifferentBilling
            // starts as true in defaultValues, avoiding the toggle-sync effect that would
            // overwrite the billing fields with the shipping address.
            useBasket.mockReturnValue(
                createMockBasket({
                    billingAddress: {
                        firstName: 'Jane',
                        lastName: 'Smith',
                        address1: '456 Billing Ave',
                        city: 'Los Angeles',
                        stateCode: 'CA',
                        postalCode: '90001',
                        countryCode: 'US',
                    },
                })
            );

            renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            expect(submissionRef.current.billingAddressGetter).toBeInstanceOf(Function);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const address = submissionRef.current.billingAddressGetter!() as Record<string, unknown>;
            expect(address).toEqual(
                expect.objectContaining({
                    firstName: 'Jane',
                    lastName: 'Smith',
                    address1: '456 Billing Ave',
                    city: 'Los Angeles',
                    stateCode: 'CA',
                    postalCode: '90001',
                    countryCode: 'US',
                })
            );
        });

        test('clears billingAddressGetter on unmount', () => {
            const submissionRef = makeSubmissionRef();

            const { unmount } = renderHook(() =>
                usePayment(
                    createDefaultParams({
                        paymentSubmissionRef: submissionRef,
                    })
                )
            );

            expect(submissionRef.current.billingAddressGetter).toBeInstanceOf(Function);
            unmount();
            expect(submissionRef.current.billingAddressGetter).toBeNull();
        });
    });

    describe('default values', () => {
        test('sets useDifferentBilling true when basket has distinct billing', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    billingAddress: {
                        firstName: 'Jane',
                        lastName: 'Shopper',
                        address1: '456 Billing Ave',
                        city: 'Los Angeles',
                        stateCode: 'CA',
                        postalCode: '90001',
                        countryCode: 'US',
                    },
                })
            );

            const { result } = renderHook(() => usePayment(createDefaultParams()));
            expect(result.current.form.getValues('useDifferentBilling')).toBe(true);
        });

        test('sets useDifferentBilling false when billing matches shipping', () => {
            useBasket.mockReturnValue(
                createMockBasket({
                    billingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'New York',
                        stateCode: 'NY',
                        postalCode: '10001',
                        countryCode: 'US',
                    },
                })
            );

            const { result } = renderHook(() => usePayment(createDefaultParams()));
            expect(result.current.form.getValues('useDifferentBilling')).toBe(false);
        });

        test('BOPIS: clears billing/cardholder when showUseDifferentBilling is false', () => {
            const { result } = renderHook(() => usePayment(createDefaultParams({ showUseDifferentBilling: false })));

            const values = result.current.form.getValues();
            expect(values.cardholderName).toBe('');
            expect(values.billingFirstName).toBe('');
            expect(values.billingCity).toBe('');
        });
    });
});
