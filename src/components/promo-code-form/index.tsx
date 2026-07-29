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

/**
 * Factory function to create promo code validation schema with i18next translations.
 * Returns a schema at runtime to avoid race conditions where t() would be called
 * before i18next is initialized, causing validation messages to show as keys instead of translated text.
 *
 * @example const schema = createPromoCodeFormSchema(t);
 */

// oxlint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export const createPromoCodeFormSchema = (t: TFunction<any, any>) => {
    return z.object({
        code: z.string().min(2, {
            message: t('cart:promoCode.validation.minLength'),
        }),
    });
};

// Type export
export type PromoCodeFormData = z.infer<ReturnType<typeof createPromoCodeFormSchema>>;

// Export main component
export { PromoCodeForm } from './form';

// Export sub-components
export { PromoCodeFields } from './promo-code-field';

// Export types
export { type PromoCodeFormProps, type PromoCodeFieldsProps, type PromoCodeFetcherData } from './types';

// Default export for backward compatibility
export { PromoCodeForm as default } from './form';
