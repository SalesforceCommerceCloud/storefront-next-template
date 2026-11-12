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
import type { Route } from './+types/_empty.reset-password';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getPasswordResetErrorMessageKey, extractErrorMessage } from '@/lib/auth/error-handler';
import { buildUrlFromContext } from '@/lib/url.server';
import { isPasswordValid } from '@/lib/utils';
import { resetPasswordWithToken } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { clearPasswordResetEmailCookie, readPasswordResetEmailCookie } from '@/lib/auth/remembered-email-cookie.server';
import { routes } from '@/route-paths';

type ResetPasswordLoaderData = {
    token: string;
    /** Email remembered from the reset request; empty when the shopper must enter it */
    email: string;
};

type ResetPasswordActionData = {
    error?: string;
};

export async function loader({ request, context }: Route.LoaderArgs): Promise<ResetPasswordLoaderData | Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return redirect(buildUrlFromContext(routes.forgotPassword, context));
    }

    // Reset links don't carry the email (and an `email` param is ignored); use the one remembered
    // by this browser when it requested the link, otherwise the shopper enters it.
    const email = (await readPasswordResetEmailCookie(request, context)) || '';

    return {
        token,
        email,
    };
}

// Server action required for authentication - password reset must be handled
// server-side to maintain security and proper integration with SFCC's authentication system
export async function action({ request, context }: Route.ActionArgs): Promise<ResetPasswordActionData | Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);
    const formData = await request.formData();
    const token = formData.get('token')?.toString();
    const email = formData.get('email')?.toString()?.trim();
    const newPassword = formData.get('newPassword')?.toString();
    const confirmPassword = formData.get('confirmPassword')?.toString();

    // Separate validation for token - critical security field
    if (!token) {
        return redirect(buildUrlFromContext(routes.forgotPassword, context));
    }

    if (!email || !newPassword || !confirmPassword) {
        return { error: t('signup:allFieldsRequired') };
    }

    if (newPassword !== confirmPassword) {
        return { error: t('resetPassword:passwordsMustMatch') };
    }

    if (!isPasswordValid(newPassword)) {
        return { error: t('signup:passwordNotSecure') };
    }

    try {
        // Reset the password
        await resetPasswordWithToken(context, {
            email,
            token,
            newPassword,
        });

        logger.info('ResetPassword: password reset succeeded');
        // Auto-login the user with new password to maintain session validity
        // This matches the behavior when hasPassword={true} users change their password
        // and is especially important for users who previously had hasPassword=false
        const { loginRegisteredUser, updateAuth } = await import('@/middlewares/auth.server');
        const authResponse = await loginRegisteredUser(context, email, newPassword, { skipUsid: true });
        updateAuth(context, authResponse);

        // Password reset successful - redirect to login
        return redirect(buildUrlFromContext(routes.login, context), {
            headers: { 'Set-Cookie': await clearPasswordResetEmailCookie(context) },
        });
    } catch (error) {
        logger.error('ResetPassword: failed', { error });
        const errorMessage = extractErrorMessage(error);
        const errorKey = getPasswordResetErrorMessageKey(errorMessage);
        return { error: t(errorKey) };
    }
}

export default function ResetPassword({ loaderData }: { loaderData: ResetPasswordLoaderData }): ReactElement {
    const { token, email } = loaderData;
    const actionData = useActionData<typeof action>();
    const { t } = useTranslation('resetPassword');

    return (
        <div
            data-section="auth"
            className="min-h-screen flex items-center justify-center bg-background py-12 section-container">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-bold text-foreground">{t('title')}</h2>
                    <p className="mt-2 text-center text-sm text-muted-foreground">{t('enterNewPassword')}</p>
                </div>

                <Card className="p-8">
                    <ResetPasswordForm error={actionData?.error} token={token} email={email} />
                </Card>
            </div>
        </div>
    );
}
