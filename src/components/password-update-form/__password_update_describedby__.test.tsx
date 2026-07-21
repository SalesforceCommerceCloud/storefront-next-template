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

import { render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { useEffect, createElement, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Form } from '@/components/ui/form';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { PasswordUpdateFields } from './password-update-fields';
import type { PasswordUpdateFormData } from './types';

void i18next.init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: {
        'en-US': {
            account: {
                password: {
                    currentPassword: 'Current Password',
                    currentPasswordPlaceholder: 'Enter current password',
                    newPassword: 'New Password',
                    newPasswordPlaceholder: 'Enter new password',
                    confirmPassword: 'Confirm New Password',
                    confirmPasswordPlaceholder: 'Re-enter new password',
                    saveButton: 'Save',
                    cancelButton: 'Cancel',
                },
            },
        },
    },
});

const wrapper = ({ children }: { children: ReactNode }) => createElement(I18nextProvider, { i18n: i18next }, children);

/**
 * Test that the password update form's new-password field properly composes
 * aria-describedby to include both the requirements ID and the error message ID.
 * This prevents BUG 2: consumer aria-describedby clobbering the error link.
 */
describe('PasswordUpdateFields aria-describedby composition', () => {
    it('includes both requirements ID and error message ID on validation error', async () => {
        function TestWrapper() {
            const form = useForm<PasswordUpdateFormData>({
                defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
            });

            const updateFetcher = {
                state: 'idle' as const,
                data: undefined,
                formData: undefined,
                formMethod: undefined,
                formAction: undefined,
                submit: vi.fn(),
                load: vi.fn(),
            } as any;

            useEffect(() => {
                // Simulate a validation error on the password field
                form.setError('password', { type: 'manual', message: 'Password too weak' });
            }, [form]);

            // Mirror production: the fields render inside the RHF FormProvider (form.tsx wraps
            // PasswordUpdateFields in <Form>), which useFormField / FormLabel require.
            return (
                <Form {...form}>
                    <PasswordUpdateFields form={form} updateFetcher={updateFetcher} />
                </Form>
            );
        }

        render(<TestWrapper />, { wrapper });

        // Wait for the error to be set
        await waitFor(() => {
            expect(screen.getByText('Password too weak')).toBeInTheDocument();
        });

        // Find the new password input (the second password input)
        const passwordInputs = screen.getAllByPlaceholderText(/new password/i);
        const newPasswordInput = passwordInputs[0];

        const describedBy = newPasswordInput.getAttribute('aria-describedby');

        // The input must reference both the requirements ID and the error message
        expect(describedBy).toBeTruthy();
        expect(describedBy).toContain('password-update-requirements');

        // Find the error message element
        const errorMessage = screen.getByText('Password too weak');
        expect(describedBy).toContain(errorMessage.id);

        // Both IDs must resolve to real elements
        expect(document.getElementById('password-update-requirements')).toBeInTheDocument();
        expect(document.getElementById(errorMessage.id)).toBe(errorMessage);
    });

    it('includes only requirements ID when no validation error', () => {
        function TestWrapper() {
            const form = useForm<PasswordUpdateFormData>({
                defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
            });

            const updateFetcher = {
                state: 'idle' as const,
                data: undefined,
                formData: undefined,
                formMethod: undefined,
                formAction: undefined,
                submit: vi.fn(),
                load: vi.fn(),
            } as any;

            return (
                <Form {...form}>
                    <PasswordUpdateFields form={form} updateFetcher={updateFetcher} />
                </Form>
            );
        }

        render(<TestWrapper />, { wrapper });

        // Find the new password input (the second password input)
        const passwordInputs = screen.getAllByPlaceholderText(/new password/i);
        const newPasswordInput = passwordInputs[0];

        const describedBy = newPasswordInput.getAttribute('aria-describedby');

        // The input must reference only the requirements ID
        expect(describedBy).toBe('password-update-requirements');

        // The requirements ID must resolve to a real element
        expect(document.getElementById('password-update-requirements')).toBeInTheDocument();
    });
});
