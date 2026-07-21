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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePasswordValidation } from '@/hooks/use-password-validation';
import { PasswordRequirement } from '@/components/password-requirements';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { action as postOrderRegisterAction } from '@/routes/action.post-order-register';
import { resourceRoutes } from '@/route-paths';

type PostOrderRegistrationProps = {
    email: string;
    firstName?: string;
    lastName?: string;
    orderNo?: string;
    /** Initial success state — used in Storybook to show the confirmation view without triggering fetcher logic */
    defaultSuccess?: boolean;
    /** Initial error message — used in Storybook to show the error state without triggering fetcher logic */
    defaultError?: string;
    /** Initial submitting state — used in Storybook to show the creating account state without triggering fetcher logic */
    defaultSubmitting?: boolean;
    /** Initial password value — used in Storybook to pre-fill the password field */
    defaultPassword?: string;
    /** Initial confirm password value — used in Storybook to pre-fill the confirm password field */
    defaultConfirmPassword?: string;
};

/**
 * Inline registration card shown on order confirmation for guest shoppers
 * when email verification is disabled. Allows the shopper to create an account
 * using their order email and a password.
 */
export function PostOrderRegistration({
    email,
    firstName,
    lastName,
    orderNo,
    defaultSuccess = false,
    defaultError,
    defaultSubmitting = false,
    defaultPassword = '',
    defaultConfirmPassword = '',
}: PostOrderRegistrationProps) {
    const { t } = useTranslation('checkout');
    const {
        password,
        confirmPassword,
        showPasswordMismatch,
        handlePasswordChange,
        handleConfirmPasswordChange,
        isFormValid,
    } = usePasswordValidation({ defaultPassword, defaultConfirmPassword });

    const fetcher = useFetcher<typeof postOrderRegisterAction>({ key: 'post-order-register' });
    const isSubmitting = fetcher.state !== 'idle' || defaultSubmitting;
    const registrationSuccess = fetcher.data?.success === true || defaultSuccess;
    const error = fetcher.data?.error ?? defaultError;

    if (registrationSuccess) {
        return (
            <Card className="border border-border/70">
                <CardHeader>
                    <CardTitle>{t('confirmation.postOrderRegistration.title')}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-10 space-y-3">
                    <div className="flex items-center justify-center size-12 rounded-full bg-primary/10">
                        <Check className="size-6 text-primary" />
                    </div>
                    <p className="text-lg font-semibold text-foreground text-center">
                        {t('confirmation.postOrderRegistration.successTitle')}
                    </p>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                        {t('confirmation.postOrderRegistration.successDescription', { email })}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border border-border/70">
            <CardHeader>
                <CardTitle>{t('confirmation.postOrderRegistration.title')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('confirmation.postOrderRegistration.subtitle')}</p>
            </CardHeader>
            <CardContent>
                {error && (
                    <div className="mb-4 p-3 rounded-ui bg-destructive/10 border border-destructive/20">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                <fetcher.Form method="POST" action={resourceRoutes.postOrderRegister}>
                    <div className="space-y-6">
                        <input type="hidden" name="email" value={email} />
                        <input type="hidden" name="firstName" value={firstName || ''} />
                        <input type="hidden" name="lastName" value={lastName || ''} />
                        {orderNo && <input type="hidden" name="orderNo" value={orderNo} />}

                        <div>
                            <label htmlFor="post-order-email" className="block text-sm font-medium text-foreground">
                                {t('confirmation.postOrderRegistration.emailLabel')}
                            </label>
                            <Input
                                id="post-order-email"
                                type="email"
                                value={email}
                                disabled
                                className="mt-1 bg-muted"
                            />
                        </div>

                        <div>
                            <label htmlFor="post-order-password" className="block text-sm font-medium text-foreground">
                                {t('confirmation.postOrderRegistration.passwordLabel')}
                            </label>
                            <Input
                                id="post-order-password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={handlePasswordChange}
                                className="mt-1"
                                placeholder={t('confirmation.postOrderRegistration.passwordPlaceholder')}
                                aria-describedby="post-order-password-requirements"
                            />
                            <PasswordRequirement
                                password={password}
                                className="mt-2"
                                id="post-order-password-requirements"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="post-order-confirm-password"
                                className="block text-sm font-medium text-foreground">
                                {t('confirmation.postOrderRegistration.confirmPasswordLabel')}
                            </label>
                            <Input
                                id="post-order-confirm-password"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={handleConfirmPasswordChange}
                                className="mt-1"
                                aria-invalid={showPasswordMismatch && confirmPassword ? true : undefined}
                                aria-describedby={
                                    showPasswordMismatch && confirmPassword
                                        ? 'post-order-confirm-password-error'
                                        : undefined
                                }
                                placeholder={t('confirmation.postOrderRegistration.confirmPasswordPlaceholder')}
                            />
                            {showPasswordMismatch && confirmPassword && (
                                <p
                                    id="post-order-confirm-password-error"
                                    role="alert"
                                    className="mt-1 text-sm text-destructive">
                                    {t('confirmation.postOrderRegistration.passwordMismatch')}
                                </p>
                            )}
                        </div>

                        <div>
                            <Button
                                type="submit"
                                disabled={!isFormValid || isSubmitting}
                                className="w-full"
                                variant={isFormValid ? 'default' : 'secondary'}>
                                {isSubmitting
                                    ? t('confirmation.postOrderRegistration.creating')
                                    : t('confirmation.postOrderRegistration.createAccountButton')}
                            </Button>
                        </div>
                    </div>
                </fetcher.Form>
            </CardContent>
        </Card>
    );
}
