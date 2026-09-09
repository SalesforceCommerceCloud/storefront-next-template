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
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrlFromContext } from '@/lib/url.server';
import { sendNotification, validateSlasCallbackToken } from '@/lib/notify/notify.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';
import { routes } from '@/route-paths';

/** @deprecated No-op kept for test backwards compatibility */
// oxlint-disable-next-line no-empty-function
export function resetMarketingCloudTokenCache() {}

/**
 * Sends a magic link email for reset password.
 */
async function sendResetPasswordEmail(
    context: Readonly<RouterContextProvider>,
    email_id: string,
    token: string
): Promise<void> {
    const config = getConfig(context);
    const landingPath = buildUrlFromContext(config.features.resetPassword.landingUri ?? '/reset-password', context);
    const magicLinkPath = `${landingPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email_id)}`;

    await sendNotification(context, { type: 'password-reset', recipient: email_id, data: { magicLinkPath } });
}

/**
 * Handles reset password callback action
 * Processes SLAS callback token and sends magic link email
 */
export async function handleResetPasswordCallback({ request, context }: ActionFunctionArgs) {
    const logger = getLogger(context);
    const { t } = getTranslation(context);

    const config = getConfig(context);
    if (config?.features?.resetPassword?.mode !== 'callback') {
        return { success: false, error: t('errors:passwordless.missingCallbackToken') };
    }

    const url = new URL(request.url);
    logger.info('ResetPassword: callback received', {
        pathname: url.pathname,
        method: request.method,
        hasSlasCallbackToken: Boolean(request.headers.get('x-slas-callback-token')),
        contentType: request.headers.get('content-type'),
    });

    try {
        const slasCallbackToken = request.headers.get('x-slas-callback-token');

        if (!slasCallbackToken) {
            logger.warn('ResetPassword: missing SLAS callback token');
            return {
                success: false,
                error: t('errors:passwordless.missingCallbackToken'),
            };
        }

        try {
            await validateSlasCallbackToken(context, slasCallbackToken);
            logger.info('ResetPassword: SLAS callback token validated');
        } catch (tokenError) {
            const msg = tokenError instanceof Error ? tokenError.message : String(tokenError);
            logger.error('ResetPassword: SLAS callback token validation failed', { error: msg });
            throw tokenError;
        }

        const body = await request.json();
        const { email_id, token } = body as { email_id: string; token: string };

        logger.info('ResetPassword: parsed callback body', {
            hasEmailId: Boolean(email_id),
            hasToken: Boolean(token),
        });

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

        try {
            await sendResetPasswordEmail(context, email_id, token);
            logger.info('ResetPassword: email sent', { recipient: email_id });
        } catch (emailError) {
            const rawBody =
                emailError && typeof emailError === 'object' && 'rawBody' in emailError
                    ? emailError.rawBody
                    : undefined;
            logger.error('ResetPassword: sendNotification failed', { error: emailError, rawBody });
            throw emailError;
        }

        return {
            success: true,
            result: {},
        };
    } catch (error) {
        const { responseMessage } = await extractResponseError(error);
        logger.error('ResetPassword: callback failed', { error, responseMessage });

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

    return redirect(`${routes.resetPassword}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
}
