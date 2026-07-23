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
import { PasswordUpdateFields } from './password-update-fields';

//hooks
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';

//types
import { createPasswordUpdateFormSchema, type PasswordUpdateFormData } from './index';
import { type PasswordUpdateFormProps, type PasswordUpdateSubmissionData } from './types';
import { useTranslation } from 'react-i18next';

/**
 * PasswordUpdateForm component that provides a form interface for changing user password.
 *
 * This component renders a form for entering current password, new password, and confirmation.
 * It handles form validation, submission, and displays appropriate success/error feedback through toasts.
 * The form automatically resets on successful submission.
 *
 * @param initialData - Optional initial data to populate the form fields (for consistency with other forms)
 * @param onSuccess - Optional callback function called when password is successfully updated (receives form data)
 * @param onError - Optional callback function called when password update fails (receives error)
 * @param onCancel - Optional callback function called when user cancels the form
 *
 * @returns JSX element containing the password update form
 *
 * @example
 * ```tsx
 * // Basic usage with callbacks
 * <PasswordUpdateForm
 *   updateFetcher={updateFetcher}
 *   onSuccess={(formData) => console.log('Password updated!', formData)}
 *   onError={(error) => console.error('Update failed:', error)}
 *   onCancel={() => setEditing(false)}
 * />
 *
 * // Usage without callbacks
 * <PasswordUpdateForm updateFetcher={updateFetcher} />
 * ```
 */
export const PasswordUpdateForm = ({
    initialData,
    updateFetcher,
    onSuccess,
    onError,
    onCancel,
}: PasswordUpdateFormProps) => {
    const { t } = useTranslation('account');
    const schema = useMemo(() => createPasswordUpdateFormSchema(t), [t]);

    const form = useForm<PasswordUpdateFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            currentPassword: initialData?.currentPassword || '',
            password: initialData?.password || '',
            confirmPassword: initialData?.confirmPassword || '',
        },
    });

    // Use useScapiFetcherEffect to handle fetcher state changes
    // This handles form-specific concerns (reset, error state) and calls parent callbacks
    useScapiFetcherEffect(updateFetcher, {
        onSuccess: () => {
            // Get form data before resetting the form
            const currentFormData = form.getValues();

            // Reset the form to clear the input fields
            form.reset();

            // Call parent callback - parent will handle toasts and other UI feedback
            onSuccess?.(currentFormData);
        },
        onError: (errors) => {
            const errorMessage = errors && errors.length > 0 ? errors.join(', ') : t('password.errorMessage');
            // Set form error state
            form.setError('root', {
                type: 'manual',
                message: errorMessage,
            });
            // Call parent callback - parent will handle toasts
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
                form.setFocus(firstErrorField as keyof PasswordUpdateFormData);
            }
        }
    }, [form, form.formState.errors]);

    /**
     * Handles form submission for changing password.
     *
     * This function is called when the form is submitted and performs the following:
     * 1. Validates the form data using the Zod schema
     * 2. Calls the updateFetcher.submit with the validated data (excluding virtual fields)
     * 3. The API response is handled by the parent component's fetcher effect handlers
     *
     * @param data - The validated form data containing password information
     * @param data.currentPassword - The user's current password
     * @param data.password - The new password to set
     * @param data.confirmPassword - The confirmation of the new password (used for validation only, excluded from submission)
     */
    const handleSubmit = form.handleSubmit((data) => {
        // Prepare password data in the format expected by Commerce SDK
        // Exclude confirmPassword as it's a virtual field used only for validation
        const passwordUpdateData: PasswordUpdateSubmissionData = {
            currentPassword: data.currentPassword,
            password: data.password,
        };

        // Submit the update request - response will be handled by parent component's fetcher effect
        void updateFetcher.submit(passwordUpdateData);
    });

    /**
     * Handles cancel action.
     * Resets the form and calls the onCancel callback if provided.
     */
    const handleCancel = () => {
        form.reset();
        onCancel?.();
    };

    return (
        <div className="w-full">
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="password-update-form">
                    <PasswordUpdateFields
                        form={form}
                        updateFetcher={updateFetcher}
                        onCancel={onCancel ? handleCancel : undefined}
                    />
                </form>
            </Form>
        </div>
    );
};
