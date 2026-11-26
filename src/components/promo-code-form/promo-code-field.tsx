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
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormInput } from '@/components/form-fields';

import { FETCHER_STATES } from '@/lib/fetcher-states';
import { type PromoCodeFieldsProps } from './types';
import { useTranslation } from 'react-i18next';

/**
 * PromoCodeFields component that renders the form fields for entering and applying promo codes.
 *
 * @param form - React Hook Form instance for managing form state and validation
 * @param applyFetcher - React Router fetcher for handling promo code application requests
 */
export function PromoCodeFields({ form, applyFetcher }: PromoCodeFieldsProps) {
    const { t } = useTranslation('cart');
    return (
        <div className="space-y-2">
            <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="sr-only">{t('promoCode.label')}</FormLabel>
                        <div className="flex gap-2">
                            <FormInput
                                placeholder={t('promoCode.placeholder')}
                                className="focus-visible:ring-0"
                                {...field}
                            />
                            <Button
                                type="submit"
                                variant="secondary"
                                disabled={applyFetcher.state !== FETCHER_STATES.IDLE}
                                className="cursor-pointer px-4">
                                {applyFetcher.state !== FETCHER_STATES.IDLE
                                    ? t('promoCode.applying')
                                    : t('promoCode.apply')}
                            </Button>
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
