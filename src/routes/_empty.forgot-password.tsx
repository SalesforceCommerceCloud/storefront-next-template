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
import type { ReactElement } from 'react';
import { redirect, useActionData } from 'react-router';
import type { Route } from './+types/_empty.forgot-password';
import { useTranslation } from 'react-i18next';
import { getPasswordResetErrorMessageKey, extractErrorMessage } from '@/lib/auth/error-handler';

// Components
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

// Lib
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { buildUrlFromContext } from '@/lib/url.server';
import { routes } from '@/route-paths';

// Middleware
import { getAuth, getPasswordResetToken } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';

type ForgotPasswordActionData = {
    error?: string;
    success?: boolean;
    email?: string;
};

export function loader({ context }: Route.LoaderArgs): Response | void {
    // If user is already logged in as registered user, redirect to login page
    const session = getAuth(context);
    if (session.userType === 'registered') {
        return redirect(buildUrlFromContext(routes.login, context));
    }
}

// Server action required for authentication - password reset token generation must be handled
// server-side to maintain security and proper integration with SFCC's authentication system
export async function action({ request, context }: Route.ActionArgs): Promise<ForgotPasswordActionData> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);
    const formData = await request.formData();
    const email = formData.get('email')?.toString();
    if (!email) {
        return { error: t('resetPassword:emailRequired') };
    }

    try {
        //Send password reset token using SLAS and Marketing Cloud
        await getPasswordResetToken(context, { email });
        logger.info('ForgotPassword: reset token sent');
        return { success: true, email };
    } catch (error) {
        logger.error('ForgotPassword: failed', { error });
        const errorMessage = extractErrorMessage(error);
        const errorKey = getPasswordResetErrorMessageKey(errorMessage);
        return { error: t(errorKey) };
    }
}

export default function ForgotPassword(): ReactElement {
    const actionData = useActionData<typeof action>();
    const { t } = useTranslation('resetPassword');

    if (actionData?.success && actionData?.email) {
        return (
            <div data-section="auth" className="flex items-center justify-center bg-background py-12 section-container">
                <div className="max-w-md w-full space-y-8">
                    <div className="text-center">
                        <h2 className="mt-6 text-center text-3xl font-bold text-foreground">{t('checkEmailTitle')}</h2>
                        <p className="mt-2 text-center text-sm text-muted-foreground">
                            {t('checkEmailDescription', { email: actionData.email })}
                        </p>
                    </div>

                    <Card className="p-8">
                        <div className="space-y-6">
                            <Link to={routes.login}>
                                <Button className="w-full cursor-pointer">{t('backToSignIn')}</Button>
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    // Initial form state
    return (
        <div data-section="auth" className="flex items-center justify-center bg-background py-12 section-container">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold text-foreground">{t('title')}</h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">{t('subtitle')}</p>
                </div>

                <Card className="p-8">
                    <ForgotPasswordForm error={actionData?.error} />
                </Card>
            </div>
        </div>
    );
}
