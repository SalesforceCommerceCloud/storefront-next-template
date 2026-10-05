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
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect, type RouterContextProvider } from 'react-router';
import { extractResponseError } from '@/lib/utils';
import { getAppOrigin } from '@/lib/origin';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import {
    resetMarketingCloudTokenCache,
    sendMarketingCloudEmail,
    validateSlasCallbackToken,
} from '@/lib/marketing/marketing-cloud.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';

// Re-export for backwards compatibility with tests
export { resetMarketingCloudTokenCache };

/**
 * Sends a magic link email for reset password
 */
async function sendResetPasswordEmail(
    context: Readonly<RouterContextProvider>,
    email_id: string,
    token: string
): Promise<object> {
    const base = getAppOrigin(context);

    const config = getConfig(context);
    const landingPath = config.features.resetPassword.landingUri;
    const magicLink = `${base}${landingPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email_id)}`;

    const templateId = process.env.MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE;
    if (!templateId) {
        throw new Error('MARKETING_CLOUD_PASSWORDLESS_LOGIN_TEMPLATE is not set in the environment variables.');
    }
    return await sendMarketingCloudEmail(email_id, magicLink, templateId);
}

/**
 * Handles reset password callback action
 * Processes SLAS callback token and sends magic link email
 */
export async function handleResetPasswordCallback({ request, context }: ActionFunctionArgs) {
    const logger = getLogger(context);
    const { t } = getTranslation(context);

    try {
        const slasCallbackToken = request.headers.get('x-slas-callback-token');

        if (!slasCallbackToken) {
            logger.warn('ResetPassword: missing SLAS callback token');
            return {
                success: false,
                error: t('errors:passwordless.missingCallbackToken'),
            };
        }

        await validateSlasCallbackToken(context, slasCallbackToken);

        const body = await request.json();
        const { email_id, token } = body as { email_id: string; token: string };

        if (!email_id || !token) {
            logger.warn('ResetPassword: missing required fields', {
                hasEmailId: Boolean(email_id),
                hasToken: Boolean(token),
            });
            return {
                success: false,
                error: t('errors:passwordless.missingRequiredFields'),
            };
        }

        const result = await sendResetPasswordEmail(context, email_id, token);

        logger.info('ResetPassword: email sent');
        return {
            success: true,
            result,
        };
    } catch (error) {
        const { responseMessage } = await extractResponseError(error);
        logger.error('ResetPassword: callback failed', { error });

        return {
            success: false,
            error: responseMessage,
        };
    }
}

/**
 * Handles reset password landing page loader
 * Simply passes through to the reset-password route with query parameters
 * The reset-password route's loader will handle validation
 */
export function handleResetPasswordLanding({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const email = url.searchParams.get('email') || '';

    return redirect(`/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
}
