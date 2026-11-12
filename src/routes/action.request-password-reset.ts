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
import type { ActionFunctionArgs } from 'react-router';
import { getPasswordResetToken } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import { extractErrorMessage, getPasswordResetErrorMessageKey } from '@/lib/auth/error-handler';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { serializePasswordResetEmailCookie } from '@/lib/auth/remembered-email-cookie.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';

/**
 * Action endpoint for requesting a password reset email.
 * Used by account page when user without password clicks "Reset password".
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);
    const formData = await request.formData();
    const email = formData.get('email')?.toString();

    if (!email) {
        return Response.json({ error: t('resetPassword:emailRequired') });
    }

    try {
        // Send password reset token using SLAS and Marketing Cloud
        await getPasswordResetToken(context, { email });
        logger.info('RequestPasswordReset: reset token sent', { email: redactEmailForLog(email) });
        // Remember the email for the reset page; the reset link doesn't carry it
        return Response.json(
            { success: true },
            { headers: { 'Set-Cookie': await serializePasswordResetEmailCookie(context, email) } }
        );
    } catch (error) {
        logger.error('RequestPasswordReset: failed', { error, email: redactEmailForLog(email) });
        const errorMessage = extractErrorMessage(error);
        const errorKey = getPasswordResetErrorMessageKey(errorMessage);
        return Response.json({ error: t(errorKey) });
    }
}
