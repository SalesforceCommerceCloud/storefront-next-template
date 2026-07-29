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
 * Factory function to create email update validation schema with i18next translations.
 * Returns a schema at runtime to avoid race conditions where t() would be called
 * before i18next is initialized, causing validation messages to show as keys instead of translated text.
 *
 * @example const schema = createEmailUpdateFormSchema(t);
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export const createEmailUpdateFormSchema = (t: TFunction<any, any>, requirePassword = true) => {
    return z.object({
        currentPassword: requirePassword
            ? z.string().min(1, { message: t('account:email.validation.passwordRequired') })
            : z.string().optional(),
        email: z
            .string()
            .min(1, {
                message: t('account:email.validation.emailRequired'),
            })
            .email({
                message: t('account:email.validation.emailInvalid'),
            }),
    });
};

// Type export
export type EmailUpdateFormData = z.infer<ReturnType<typeof createEmailUpdateFormSchema>>;

// Export main component
export { EmailUpdateForm } from './form';

// Export sub-components
export { EmailUpdateFields } from './email-update-fields';

// Export types
export {
    type EmailUpdateSubmissionData,
    type EmailUpdateFormProps,
    type EmailUpdateFieldsProps,
    type EmailUpdateFetcherData,
} from './types';

// Default export for backward compatibility
export { EmailUpdateForm as default } from './form';
