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
import { FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

import { FETCHER_STATES } from '@/lib/fetcher-states';
import { type CustomerProfileFieldsProps } from './types';
import { useTranslation } from 'react-i18next';

// Gender values for SFCC API: 1 = Male, 2 = Female
const GENDER_OPTIONS = [
    { value: '1', labelKey: 'profile.genderOptions.male' },
    { value: '2', labelKey: 'profile.genderOptions.female' },
] as const;

/**
 * CustomerProfileFields component that renders the form fields for editing customer profile.
 *
 * @param form - React Hook Form instance for managing form state and validation
 * @param updateFetcher - React Router fetcher for handling profile update requests
 * @param onCancel - Optional callback function to handle cancel action
 */
export function CustomerProfileFields({
    form,
    updateFetcher,
    onCancel,
    hideActions = false,
}: CustomerProfileFieldsProps) {
    const { t } = useTranslation('account');
    const isSubmitting = updateFetcher.state === FETCHER_STATES.SUBMITTING;

    return (
        <div className="space-y-4">
            {/* First Name and Last Name Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Name Field */}
                <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm font-medium text-foreground">
                                {t('profile.firstName')}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="text"
                                    autoComplete="given-name"
                                    placeholder={t('profile.firstNamePlaceholder')}
                                    className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Last Name Field */}
                <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm font-medium text-foreground">
                                {t('profile.lastName')}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="text"
                                    autoComplete="family-name"
                                    placeholder={t('profile.lastNamePlaceholder')}
                                    className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Phone and Gender Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Phone Number Field */}
                <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm font-medium text-foreground">
                                {t('profile.phoneNumber')}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="tel"
                                    autoComplete="tel"
                                    placeholder={t('profile.phonePlaceholder')}
                                    className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>{t('profile.phoneDescription')}</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Gender Field */}
                <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                        <FormItem className="[&_[data-slot=native-select-wrapper]]:w-full">
                            <FormLabel className="text-sm font-medium text-foreground">{t('profile.gender')}</FormLabel>
                            <FormControl>
                                <NativeSelect
                                    className="w-full border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                    value={field.value || ''}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    name={field.name}>
                                    <option value="">{t('profile.genderPlaceholder')}</option>
                                    {GENDER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {t(option.labelKey)}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Date of Birth Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date of Birth Field */}
                <FormField
                    control={form.control}
                    name="birthday"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm font-medium text-foreground">
                                {t('profile.dateOfBirth')}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="date"
                                    autoComplete="bday"
                                    className="border-border focus:ring-2 focus:ring-ring focus:border-transparent"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Action Buttons (omit when hideActions for header placement) */}
            {!hideActions && (
                <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={isSubmitting} className="">
                        {isSubmitting ? t('profile.savingButton') : t('profile.saveButton')}
                    </Button>
                    {onCancel && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                            {t('profile.cancelButton')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
