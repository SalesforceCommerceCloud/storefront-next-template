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
import { Form } from '@/components/form';
import { Link } from '@/components/link';
import { Input } from '@/components/ui/input';
import { FormSubmitButton } from '@/components/buttons/form-submit-button';
import { type ForgotPasswordFormProps } from './types';
import { useTranslation } from 'react-i18next';
import { routes } from '@/route-paths';

export function ForgotPasswordForm({ error }: ForgotPasswordFormProps) {
    const { t } = useTranslation('resetPassword');
    return (
        <Form method="post" className="space-y-6">
            {error && (
                <div className="mb-4 p-3 bg-destructive/10 rounded-ui border border-destructive/20">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                    {t('emailLabel')}
                </label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="mt-1"
                    placeholder={t('emailPlaceholder')}
                />
            </div>

            <FormSubmitButton defaultText={t('resetButton')} submittingText={t('sendingEmail')} />

            <div className="text-center">
                <span className="text-sm text-muted-foreground">{t('or')}</span>
                <Link to={routes.login} className="text-sm text-primary hover:text-primary/80">
                    {t('goBackToLogin')}
                </Link>
            </div>
        </Form>
    );
}
