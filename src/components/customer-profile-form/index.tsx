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
import type { TFunction } from 'i18next';
import { z } from 'zod';

/**
 * Factory function to create customer profile validation schema with i18next translations.
 * Returns a schema at runtime to avoid race conditions where t() would be called
 * before i18next is initialized, causing validation messages to show as keys instead of translated text.
 *
 * @example const schema = createCustomerProfileFormSchema(t);
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const createCustomerProfileFormSchema = (t: TFunction) => {
    return z.object({
        firstName: z.string().min(1, {
            message: t('account:profile.validation.firstNameRequired'),
        }),
        lastName: z.string().min(1, {
            message: t('account:profile.validation.lastNameRequired'),
        }),
        phone: z
            .string()
            .optional()
            .refine(
                (value) => {
                    if (!value || value.trim() === '') return true; // Allow empty phone
                    // Basic phone validation - can be enhanced
                    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
                    return phoneRegex.test(value.replace(/[\s\-()]/g, ''));
                },
                {
                    message: t('account:profile.validation.phoneInvalid'),
                }
            ),
        gender: z.string().optional(),
        birthday: z
            .string()
            .optional()
            .refine(
                (value) => {
                    if (!value || value.trim() === '') return true; // Allow empty birthday
                    // Parse as local date: new Date("YYYY-MM-DD") is interpreted as UTC midnight,
                    // which in positive UTC offsets (e.g. UTC+1) becomes tomorrow locally.
                    const [year, month, day] = value.split('-').map(Number);
                    const birthDate = new Date(year, month - 1, day);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Reset to start of day for comparison
                    return birthDate <= today;
                },
                {
                    message: t('account:profile.validation.birthdayFuture'),
                }
            ),
    });
};

// Type export
export type CustomerProfileFormData = z.infer<ReturnType<typeof createCustomerProfileFormSchema>>;

// Export main component
export { CustomerProfileForm } from './form';

// Export sub-components
export { CustomerProfileFields } from './customer-profile-fields';

// Export types
export {
    type CustomerProfileFormProps,
    type CustomerProfileFieldsProps,
    type CustomerProfileFetcherData,
} from './types';

// Default export for backward compatibility
export { CustomerProfileForm as default } from './form';
