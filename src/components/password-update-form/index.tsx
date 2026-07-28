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
 * Factory function to create password update validation schema with i18next translations.
 * Returns a schema at runtime to avoid race conditions where t() would be called
 * before i18next is initialized, causing validation messages to show as keys instead of translated text.
 *
 * Note: confirmPassword is a "virtual" field used only for validation, not included in submission.
 *
 * @example const schema = createPasswordUpdateFormSchema(t);
 */

// oxlint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export const createPasswordUpdateFormSchema = (t: TFunction<any, any>) => {
    return z
        .object({
            currentPassword: z.string().min(1, {
                message: t('account:password.validation.currentPasswordRequired'),
            }),
            password: z.string().min(8, {
                message: t('account:password.validation.passwordTooShort'),
            }),
            confirmPassword: z.string().min(1, {
                message: t('account:password.validation.confirmPasswordRequired'),
            }),
        })
        .refine((data) => data.password === data.confirmPassword, {
            message: t('account:password.validation.passwordsDoNotMatch'),
            path: ['confirmPassword'],
        });
};

// Type export
export type PasswordUpdateFormData = z.infer<ReturnType<typeof createPasswordUpdateFormSchema>>;

// Export main component
export { PasswordUpdateForm } from './form';

// Export sub-components
export { PasswordUpdateFields } from './password-update-fields';

// Export types
export {
    type PasswordUpdateSubmissionData,
    type PasswordUpdateFormProps,
    type PasswordUpdateFieldsProps,
    type PasswordUpdateFetcherData,
} from './types';

// Default export for backward compatibility
export { PasswordUpdateForm as default } from './form';
