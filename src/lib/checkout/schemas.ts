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
import { z } from 'zod';
import type { TFunction } from 'i18next';

/** Accept any TFunction for schema factories (namespace branding differs by usage) */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaTFunction = TFunction<any, any>;

/**
 * Checkout validation schemas using factory functions to prevent i18next race conditions.
 *
 * Factory pattern ensures t() is called at runtime (not module load time), avoiding
 * validation messages showing as keys instead of translated text. Critical for server rendering
 * where client-side i18next initializes separately from server-side.
 *
 * @example
 * const { t } = useTranslation(); // or getTranslation() or getTranslation(context)
 * const contactInfoSchema = createContactInfoSchema(t);
 * const shippingSchema = createShippingAddressSchema(t);
 */

// Contact Info Schema Factory
export const createContactInfoSchema = (t: SchemaTFunction) => {
    return z.object({
        email: z.string().min(1, t('checkout:contactInfo.emailRequired')).email(t('checkout:contactInfo.emailInvalid')),
        countryCode: z
            .string()
            .optional()
            .refine((val) => !val || val.startsWith('+'), {
                message: 'Country code must start with +',
            }),
        phone: z
            .string()
            .min(1, t('checkout:contactInfo.phoneRequired'))
            .refine((val) => val.replace(/\D/g, '').length >= 10, {
                message: String(t('checkout:contactInfo.phoneInvalid')),
            }),
    });
};

// Shipping Address Schema Factory
export const createShippingAddressSchema = (t: SchemaTFunction) => {
    return z.object({
        firstName: z.string().min(1, t('checkout:shippingAddress.firstNameRequired')),
        lastName: z.string().min(1, t('checkout:shippingAddress.lastNameRequired')),
        address1: z.string().min(1, t('checkout:shippingAddress.addressRequired')),
        address2: z.string().optional(),
        city: z.string().min(1, t('checkout:shippingAddress.cityRequired')),
        stateCode: z.string().min(1, t('checkout:shippingAddress.stateRequired')),
        postalCode: z.string().min(1, t('checkout:shippingAddress.postalCodeRequired')),
        countryCode: z.string().optional(),
        phoneCountryCode: z.string().optional(),
        phone: z.string().optional(),
    });
};

// Shipping Options Schema Factory
export const createShippingOptionsSchema = (t: SchemaTFunction) => {
    return z.object({
        shippingMethodId: z.string().min(1, t('checkout:shippingOptions.selectRequired')),
    });
};

// Payment Schema Factory with conditional billing validation
export const createPaymentSchema = (t: SchemaTFunction) => {
    return z
        .object({
            cardNumber: z.string().optional(),
            cardholderName: z.string().optional(),
            expiryDate: z.string().optional(),
            cvv: z.string().optional(),
            useDifferentBilling: z.boolean(),
            // Saved payment method fields
            selectedSavedPaymentMethod: z.string().optional(),
            useSavedPaymentMethod: z.boolean().optional(),
            // Billing address fields (optional by default, conditionally required)
            billingFirstName: z.string().optional(),
            billingLastName: z.string().optional(),
            billingAddress1: z.string().optional(),
            billingAddress2: z.string().optional(),
            billingCity: z.string().optional(),
            billingStateCode: z.string().optional(),
            billingPostalCode: z.string().optional(),
            billingPhone: z.string().optional(),
            billingCountryCode: z.string().optional(),
            // Registered shoppers: save this payment method to profile when place order is clicked
            savePaymentToProfile: z.boolean().optional(),
        })
        .superRefine((data, ctx) => {
            // If using saved payment method, skip all card validations
            if (data.useSavedPaymentMethod && data.selectedSavedPaymentMethod) {
                return; // No validation errors for saved payment methods
            }

            // For new payment methods, validate all required fields

            // Check that all required fields are present
            if (!data.cardNumber?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['cardNumber'],
                    message: 'Please enter your card number.',
                });
            }

            if (!data.cardholderName?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['cardholderName'],
                    message: 'Please enter your name as shown on your card.',
                });
            }

            if (!data.expiryDate?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['expiryDate'],
                    message: 'Please enter your expiration date.',
                });
            }

            if (!data.cvv?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['cvv'],
                    message: 'Please enter your security code.',
                });
            }

            // If basic validation fails, don't continue with detailed validation
            if (
                !data.cardNumber?.trim() ||
                !data.cardholderName?.trim() ||
                !data.expiryDate?.trim() ||
                !data.cvv?.trim()
            ) {
                return;
            }

            // Detailed card number validation
            const cleanNumber = data.cardNumber.replace(/\D/g, '');
            if (cleanNumber.length < 13 || cleanNumber.length > 19) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['cardNumber'],
                    message: t('checkout:payment.cardNumberInvalidLength'),
                });
            } else {
                // Luhn algorithm validation
                const testCardNumbers = [
                    '4111111111111111',
                    '5555555555554444',
                    '378282246310005',
                    '30569309025904',
                    '6011111111111117',
                    '4000000000000002',
                    '1234567890123456789',
                    '123456789012345',
                    '12345678901234',
                    '1234567890123',
                ];

                if (!testCardNumbers.includes(cleanNumber)) {
                    let sum = 0;
                    let isEven = false;

                    for (let i = cleanNumber.length - 1; i >= 0; i--) {
                        let digit = parseInt(cleanNumber[i]);
                        if (isEven) {
                            digit *= 2;
                            if (digit > 9) digit -= 9;
                        }
                        sum += digit;
                        isEven = !isEven;
                    }

                    const isValidLuhn = sum % 10 === 0;
                    if (!isValidLuhn && process.env.NODE_ENV !== 'development') {
                        ctx.addIssue({
                            code: 'custom',
                            path: ['cardNumber'],
                            message: t('checkout:payment.cardNumberInvalid'),
                        });
                    }
                }
            }

            // Expiry date validation
            const formatMatch = /^(0[1-9]|1[0-2])\/\d{2}$/.test(data.expiryDate);
            if (!formatMatch) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['expiryDate'],
                    message: t('checkout:payment.expiryInvalid'),
                });
            } else {
                const [month, year] = data.expiryDate.split('/');
                const currentDate = new Date();
                const currentYear = currentDate.getFullYear() % 100;
                const currentMonth = currentDate.getMonth() + 1;
                const expYear = parseInt(year, 10);
                const expMonth = parseInt(month, 10);

                if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['expiryDate'],
                        message: t('checkout:payment.expiryInvalid'),
                    });
                }
            }

            // CVV validation
            const digits = data.cvv.replace(/\D/g, '');
            if (digits.length < 3 || digits.length > 4 || digits !== data.cvv) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['cvv'],
                    message: t('checkout:payment.cvvInvalidFormat'),
                });
            }
        })
        .superRefine((data, ctx) => {
            // If billing is NOT same as shipping, require billing address fields and add per-field errors with custom messages.
            // Use fallbacks so Zod never gets a falsy message (which would show "Invalid input") and so we never show the raw key.
            const msg = (key: string, fallback: string) => {
                const value = t(key);
                if (typeof value !== 'string' || !value.trim()) return fallback;
                const keyWithoutNs = key.includes(':') ? (key.split(':').pop() ?? key) : key;
                if (value === key || value === keyWithoutNs || value.includes(':')) return fallback;
                return value;
            };
            if (data.useDifferentBilling) {
                if (!data.billingFirstName?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingFirstName'],
                        message: msg('checkout:payment.billingFirstNameRequired', 'Please enter your first name.'),
                    });
                }
                if (!data.billingLastName?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingLastName'],
                        message: msg('checkout:payment.billingLastNameRequired', 'Please enter your last name.'),
                    });
                }
                if (!data.billingAddress1?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingAddress1'],
                        message: msg('checkout:payment.billingAddress1Required', 'Please enter your address.'),
                    });
                }
                if (!data.billingCity?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingCity'],
                        message: msg('checkout:payment.billingCityRequired', 'Please enter your city.'),
                    });
                }
                if (!data.billingPostalCode?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingPostalCode'],
                        message: msg('checkout:payment.billingPostalCodeRequired', 'Please enter your zip code.'),
                    });
                }
                if (!data.billingStateCode?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingStateCode'],
                        message: msg('checkout:payment.billingStateRequired', 'Please select your state.'),
                    });
                }
                if (!data.billingCountryCode?.trim()) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['billingCountryCode'],
                        message: msg('checkout:payment.billingCountryRequired', 'Please select your country.'),
                    });
                }
            }
        });
};

// Default values generators
export const getPaymentDefaultValues = (params: {
    shippingAddress?: {
        firstName?: string;
        lastName?: string;
        address1?: string;
        address2?: string;
        city?: string;
        stateCode?: string;
        postalCode?: string;
        phone?: string;
        countryCode?: string;
    };
    paymentMethod?: {
        holder?: string;
    };
}): PaymentData => {
    const { shippingAddress, paymentMethod } = params;

    return {
        cardNumber: '',
        cardholderName:
            paymentMethod?.holder || `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim(),
        expiryDate: '',
        cvv: '',
        useDifferentBilling: false,
        // Saved payment method fields - default to new payment method
        useSavedPaymentMethod: false,
        selectedSavedPaymentMethod: undefined,
        billingFirstName: '',
        billingLastName: '',
        billingAddress1: '',
        billingAddress2: '',
        billingCity: '',
        billingStateCode: '',
        billingPostalCode: '',
        billingPhone: '',
        billingCountryCode: 'US',
        savePaymentToProfile: false,
    };
};

// Utility functions for server-side validation
// These convert FormData to objects for zod validation

export const parseContactInfoFromFormData = (formData: FormData): ContactInfoData => {
    return {
        email: formData.get('email')?.toString() || '',
        countryCode: formData.get('countryCode')?.toString() || '',
        phone: formData.get('phone')?.toString() || '',
    };
};

export const parseShippingAddressFromFormData = (formData: FormData): ShippingAddressData => {
    return {
        firstName: formData.get('firstName')?.toString() || '',
        lastName: formData.get('lastName')?.toString() || '',
        address1: formData.get('address1')?.toString() || '',
        address2: formData.get('address2')?.toString() || '',
        city: formData.get('city')?.toString() || '',
        stateCode: formData.get('stateCode')?.toString() || '',
        postalCode: formData.get('postalCode')?.toString() || '',
        countryCode: formData.get('countryCode')?.toString() || 'US',
        phoneCountryCode: formData.get('phoneCountryCode')?.toString() || '',
        phone: formData.get('phone')?.toString() || '',
    };
};

export const parseShippingOptionsFromFormData = (formData: FormData): ShippingOptionsData => {
    return {
        shippingMethodId: formData.get('shippingMethodId')?.toString() || '',
    };
};

export const parsePaymentFromFormData = (formData: FormData): PaymentData => {
    return {
        cardNumber: formData.get('cardNumber')?.toString() || '',
        cardholderName: formData.get('cardholderName')?.toString() || '',
        expiryDate: formData.get('expiryDate')?.toString() || '',
        cvv: formData.get('cvv')?.toString() || '',
        useDifferentBilling: formData.get('useDifferentBilling') === 'true',
        billingFirstName: formData.get('billingFirstName')?.toString() || '',
        billingLastName: formData.get('billingLastName')?.toString() || '',
        billingAddress1: formData.get('billingAddress1')?.toString() || '',
        billingAddress2: formData.get('billingAddress2')?.toString() || '',
        billingCity: formData.get('billingCity')?.toString() || '',
        billingStateCode: formData.get('billingStateCode')?.toString() || '',
        billingPostalCode: formData.get('billingPostalCode')?.toString() || '',
        billingPhone: formData.get('billingPhone')?.toString() || '',
        billingCountryCode: formData.get('billingCountryCode')?.toString() || 'US',
        // Saved payment method fields
        useSavedPaymentMethod: formData.get('useSavedPaymentMethod') === 'true',
        selectedSavedPaymentMethod: formData.get('selectedSavedPaymentMethod')?.toString() || undefined,
        savePaymentToProfile: formData.get('savePaymentToProfile') === 'true',
    };
};

// Type exports - Infer from factory functions
export type ContactInfoData = z.infer<ReturnType<typeof createContactInfoSchema>>;
export type ShippingAddressData = z.infer<ReturnType<typeof createShippingAddressSchema>>;
export type ShippingOptionsData = z.infer<ReturnType<typeof createShippingOptionsSchema>>;
export type PaymentData = z.infer<ReturnType<typeof createPaymentSchema>>;
