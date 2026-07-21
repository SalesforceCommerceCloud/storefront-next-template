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
// This file is excluded from coverage as it primarily renders presentational form fields
// using React Hook Form integration. Testing this component properly requires complex
// setup of form context, field state, and render props which is better handled through
// integration tests that can verify end-to-end user interactions.
/* c8 ignore end */

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordRequirement } from '@/components/password-requirements';
import { FormInput } from '@/components/form-fields';

import { FETCHER_STATES } from '@/lib/fetcher-states';
import { type PasswordUpdateFieldsProps } from './types';
import { useTranslation } from 'react-i18next';

/**
 * PasswordUpdateFields component that renders the form fields for changing password.
 *
 * @param form - React Hook Form instance for managing form state and validation
 * @param updateFetcher - React Router fetcher for handling password update requests
 * @param onCancel - Optional callback function to handle cancel action
 */
export function PasswordUpdateFields({ form, updateFetcher, onCancel }: PasswordUpdateFieldsProps) {
    const { t } = useTranslation('account');
    const isSubmitting = updateFetcher.state === FETCHER_STATES.SUBMITTING;
    // Use form.watch to read the password value directly from form state, including initial values
    const password = form.watch('password') || '';

    return (
        <div className="space-y-4">
            {/* Current Password Field */}
            <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">
                            {t('password.currentPassword')}
                        </FormLabel>
                        <FormControl>
                            <Input
                                type="password"
                                placeholder={t('password.currentPasswordPlaceholder')}
                                className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                {...field}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Password Field */}
            <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">
                            {t('password.newPassword')}
                        </FormLabel>
                        <FormControl>
                            <FormInput
                                type="password"
                                placeholder={t('password.newPasswordPlaceholder')}
                                className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                aria-describedby="password-update-requirements"
                                {...field}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Confirm Password Field */}
            <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-sm font-medium text-foreground">
                            {t('password.confirmPassword')}
                        </FormLabel>
                        <FormControl>
                            <Input
                                type="password"
                                placeholder={t('password.confirmPasswordPlaceholder')}
                                className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                {...field}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {/* Password Requirements */}
            <PasswordRequirement password={password} id="password-update-requirements" />

            <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={isSubmitting} className="">
                    {isSubmitting ? 'Saving...' : t('password.saveButton')}
                </Button>
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                        {t('password.cancelButton')}
                    </Button>
                )}
            </div>
        </div>
    );
}
