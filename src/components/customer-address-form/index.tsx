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

import { canadianPostalCodeRegex, usPostalCodeRegex } from './constants';

/**
 * Factory function to create customer address validation schema with i18next translations.
 * Returns a schema at runtime to avoid race conditions where t() would be called
 * before i18next is initialized, causing validation messages to show as keys instead of translated text.
 *
 * @example const schema = createCustomerAddressFormSchema(t);
 */

// oxlint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export const createCustomerAddressFormSchema = (t: TFunction<any, any>) => {
    return z
        .object({
            addressId: z.string().optional(),
            firstName: z
                .string()
                .min(1, {
                    message: t('errors:customer.firstNameRequired'),
                })
                .max(256),
            lastName: z
                .string()
                .min(1, {
                    message: t('errors:customer.lastNameRequired'),
                })
                .max(256),
            phone: z
                .string()
                .min(1, {
                    message: t('account:addressForm.validation.phoneRequired'),
                })
                .max(32),
            countryCode: z.enum(['US', 'CA'], {
                message: `${t('account:addressForm.countryLabel')} is required`,
            }),
            address1: z
                .string()
                .min(1, {
                    message: t('errors:customer.addressLine1Required'),
                })
                .max(256),
            address2: z.string().max(256).optional(),
            city: z
                .string()
                .min(1, {
                    message: t('errors:customer.cityRequired'),
                })
                .max(256),
            stateCode: z
                .string()
                .min(1, {
                    message: t('account:addressForm.validation.stateRequired'),
                })
                .max(256),
            postalCode: z
                .string()
                .min(1, {
                    message: t('errors:customer.postalCodeRequired'),
                })
                .max(256),
            preferred: z.boolean().optional().default(false),
        })
        .refine(
            (data) => {
                // Validate postal code format based on country
                if (data.countryCode === 'US') {
                    return usPostalCodeRegex.test(data.postalCode);
                }
                if (data.countryCode === 'CA') {
                    return canadianPostalCodeRegex.test(data.postalCode);
                }
                return true;
            },
            {
                message: t('errors:validation.invalidPostalCode'),
                path: ['postalCode'],
            }
        );
};

// Type export
// CustomerAddressFormData is the parsed/output shape (after .default() runs).
// CustomerAddressFormInput is the input shape (preferred is optional).
// Both are also exported from ./types — kept here for backward compatibility with
// existing imports from './index'.
export type CustomerAddressFormData = z.output<ReturnType<typeof createCustomerAddressFormSchema>>;
export type CustomerAddressFormInput = z.input<ReturnType<typeof createCustomerAddressFormSchema>>;

// Export main component
export { CustomerAddressForm } from './form';

// Export sub-components
export { CustomerAddressFields } from './customer-address-fields';

// Export types
export { type CustomerAddressFormProps, type CustomerAddressFieldsProps } from './types';

// Export constants and types
export { COUNTRY_CODES } from './constants';
// oxlint-disable-next-line react-refresh/only-export-components
export { getStatesForCountry, getCountryName, getStateName } from './utils';

export type { CountryCode, StateCode } from './constants';

// Default export for backward compatibility
export { CustomerAddressForm as default } from './form';
