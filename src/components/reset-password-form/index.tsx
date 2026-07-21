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
import { Form } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { PasswordRequirement } from '@/components/password-requirements';
import { FormSubmitButton } from '@/components/buttons/form-submit-button';
import { usePasswordValidation } from '@/hooks/use-password-validation';

interface ResetPasswordFormProps {
    error?: string;
    token: string;
    email: string;
}

export function ResetPasswordForm({ error, token, email }: ResetPasswordFormProps) {
    const { t } = useTranslation('resetPassword');
    const {
        password,
        confirmPassword,
        showPasswordMismatch,
        handlePasswordChange,
        handleConfirmPasswordChange,
        isFormValid,
    } = usePasswordValidation();

    return (
        <Form method="POST">
            {error && (
                <div className="mb-4 p-3 bg-destructive/10 rounded-ui border border-destructive/20">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="email" value={email} />

            <div className="space-y-6">
                <div>
                    <label htmlFor="email-display" className="block text-sm font-medium text-foreground">
                        {t('emailLabel')}
                    </label>
                    <Input
                        id="email-display"
                        type="email"
                        value={email}
                        disabled
                        className="mt-1 bg-muted cursor-not-allowed"
                    />
                </div>

                <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
                        {t('newPasswordLabel')}
                    </label>
                    <Input
                        id="newPassword"
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={handlePasswordChange}
                        className="mt-1"
                        placeholder={t('newPasswordPlaceholder')}
                        aria-describedby="reset-password-requirements"
                    />
                    <PasswordRequirement password={password} id="reset-password-requirements" />
                </div>

                <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                        {t('confirmPasswordLabel')}
                    </label>
                    <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={handleConfirmPasswordChange}
                        className="mt-1"
                        aria-invalid={showPasswordMismatch && confirmPassword ? true : undefined}
                        placeholder={t('confirmPasswordPlaceholder')}
                    />
                    {showPasswordMismatch && confirmPassword && (
                        <p className="mt-1 text-sm text-destructive">{t('passwordsMustMatch')}</p>
                    )}
                </div>

                <div>
                    <FormSubmitButton
                        defaultText={t('resetPasswordButton')}
                        submittingText={t('resettingPassword')}
                        disabled={!isFormValid}
                    />
                </div>
            </div>
        </Form>
    );
}
