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
import { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { FormSearchParams } from '@/extensions/store-locator/stores/store-locator-store';

const createFormSchema = (t: TFunction) => {
    return z
        .object({
            searchType: z.enum(['postalCode', 'city']).optional(),
            countryCode: z.string().min(1, t('extStoreLocator:storeLocator.form.selectCountryValidation')),
            postalCode: z.string().trim(),
        })
        .superRefine((value, context) => {
            if (!value.postalCode)
                context.addIssue({
                    code: 'custom',
                    path: ['postalCode'],
                    message: t(
                        value.searchType === 'city'
                            ? 'extStoreLocator:storeLocator.entry.cityValidation'
                            : 'extStoreLocator:storeLocator.form.postalCodeValidation'
                    ),
                });
        });
};

/**
 * Hook to manage store locator form.
 * The form state is backed by the store locator store.
 *
 * @returns An object with `form` (react-hook-form methods) and `onSubmit` handler
 *
 * @example
 * const { form, onSubmit } = useStoreLocatorForm();
 * return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>
 */
export function useStoreLocatorForm() {
    const { t } = useTranslation();
    const searchByForm = useStoreLocator((s) => s.searchByForm);
    const storeSearchParams = useStoreLocator((s) => s.searchParams);

    // Use searchParams or default empty values for form initialization
    const defaultValues = storeSearchParams || { countryCode: '', postalCode: '' };

    const formSchema = useMemo(() => createFormSchema(t), [t]);

    const form = useForm<FormSearchParams>({
        resolver: zodResolver(formSchema),
        defaultValues,
    });

    // Reset form when store values change externally
    useEffect(() => {
        const newDefaults = storeSearchParams || { countryCode: '', postalCode: '' };
        form.reset(newDefaults);
    }, [storeSearchParams, form]);

    const onSubmit = useCallback(
        (data: FormSearchParams) => {
            searchByForm(data);
        },
        [searchByForm]
    );

    return {
        form,
        onSubmit,
    };
}
