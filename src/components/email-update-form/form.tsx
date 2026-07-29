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

/* c8 ignore start */
/* istanbul ignore file */
// This file is excluded from coverage as it primarily handles React Hook Form integration,
// React Router fetcher coordination, and API submission logic. These aspects require complex
// mocking of hooks, context providers, and network requests that are better tested through
// integration tests. The core validation logic is thoroughly tested in index.test.tsx.
/* c8 ignore end */

import { useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// components
import { Form } from '@/components/ui/form';
import { EmailUpdateFields } from './email-update-fields';

// hooks
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';

// types
import { createEmailUpdateFormSchema, type EmailUpdateFormData } from './index';
import { type EmailUpdateFormProps } from './types';
import { useTranslation } from 'react-i18next';

/**
 * EmailUpdateForm component that provides a form interface for changing user email address.
 *
 * On submit, calls updateFetcher.submit() with the new email and login. Success and error
 * responses are handled via useScapiFetcherEffect, which calls onSuccess or onError accordingly.
 *
 * @param initialData - Optional initial data to populate the form fields (for consistency with other forms)
 * @param updateFetcher - The SCAPI fetcher for the updateCustomer endpoint
 * @param onSuccess - Optional callback function called when email is successfully updated
 * @param onError - Optional callback function called when email update fails
 * @param onCancel - Optional callback function called when user cancels the form
 * @param requirePassword - Whether to require and display the current password field (default: true).
 *   In storefront-next, email serves as both the loginId and the email. Updating the email
 *   therefore also updates the loginId field on the customer record. The PATCH /customers/{customerId}
 *   endpoint requires currentPassword when changing loginId, but only for password-registered users.
 *   Set to false for shoppers who registered via a social/external identity provider or passwordless
 *   login, as they do not have a stored password.
 */
export const EmailUpdateForm = ({
    initialData,
    updateFetcher,
    onSuccess,
    onError,
    onCancel,
    requirePassword = true,
}: EmailUpdateFormProps) => {
    const { t } = useTranslation('account');
    const schema = useMemo(() => createEmailUpdateFormSchema(t, requirePassword), [t, requirePassword]);

    const form = useForm<EmailUpdateFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: initialData?.email || '',
            currentPassword: initialData?.currentPassword || '',
        },
    });

    useScapiFetcherEffect(updateFetcher, {
        onSuccess: () => {
            const currentFormData = form.getValues();
            form.reset();
            onSuccess?.(currentFormData);
        },
        onError: () => {
            const errorMessage = t('email.errorMessage');
            onError?.(errorMessage);
        },
    });

    // Focus management: move focus to first error field on validation error (WCAG 3.3.1)
    useEffect(() => {
        const errors = form.formState.errors;
        const errorKeys = Object.keys(errors);
        if (errorKeys.length > 0) {
            const firstErrorField = errorKeys[0];
            if (firstErrorField !== 'root') {
                form.setFocus(firstErrorField as keyof EmailUpdateFormData);
            }
        }
    }, [form, form.formState.errors]);

    const handleSubmit = form.handleSubmit(async (data) => {
        const submitData = {
            email: data.email,
            login: data.email,
            ...(requirePassword && { currentPassword: data.currentPassword }),
        };

        try {
            await updateFetcher.submit(submitData);
        } catch {
            const errorMessage = t('email.errorMessage');
            onError?.(errorMessage);
        }
    });

    const handleCancel = () => {
        form.reset();
        onCancel?.();
    };

    return (
        <div className="w-full">
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-form" noValidate>
                    <EmailUpdateFields
                        form={form}
                        updateFetcher={updateFetcher}
                        onCancel={onCancel ? handleCancel : undefined}
                        requirePassword={requirePassword}
                    />
                </form>
            </Form>
        </div>
    );
};
