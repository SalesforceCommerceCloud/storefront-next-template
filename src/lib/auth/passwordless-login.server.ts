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
import { getErrorMessage } from '@/lib/utils';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { buildUrlFromContext } from '@/lib/url.server';
import { sendNotification, validateSlasCallbackToken } from '@/lib/notify/notify.server';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { routes } from '@/route-paths';

/** @deprecated No-op kept for test backwards compatibility */
// oxlint-disable-next-line no-empty-function
export function resetMarketingCloudTokenCache() {}

/**
 * Sends a magic link email for passwordless login.
 */
async function sendMagicLinkEmail(
    context: Readonly<RouterContextProvider>,
    email_id: string,
    token: string,
    redirectUrl?: string
): Promise<void> {
    const config = getConfig(context);
    const landingPath = buildUrlFromContext(config.features.passwordlessLogin.landingUri ?? '/login', context);
    let magicLinkPath = `${landingPath}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email_id)}`;

    if (redirectUrl) {
        // SLAS may double-encode query params in its callback; normalize before encoding
        let normalizedRedirectUrl: string;
        try {
            normalizedRedirectUrl = decodeURIComponent(redirectUrl);
        } catch {
            normalizedRedirectUrl = redirectUrl;
        }
        magicLinkPath += `&redirectUrl=${encodeURIComponent(normalizedRedirectUrl)}`;
    }

    await sendNotification(context, { type: 'passwordless-magic-link', recipient: email_id, data: { magicLinkPath } });
}

/**
 * Handles passwordless login callback action
 * Processes SLAS callback token and sends magic link email
 */
export async function handlePasswordlessCallback({ request, context }: ActionFunctionArgs) {
    const { t } = getTranslation(context);

    const config = getConfig(context);
    if (config?.features?.passwordlessLogin?.mode !== 'callback') {
        return { success: false, error: t('errors:passwordless.missingCallbackToken') };
    }

    try {
        // Extract SLAS callback token from headers
        const slasCallbackToken = request.headers.get('x-slas-callback-token');

        if (!slasCallbackToken) {
            return {
                success: false,
                error: t('errors:passwordless.missingCallbackToken'),
            };
        }

        const url = new URL(request.url);
        const redirectUrl = url.searchParams.get('redirectUrl') || undefined;

        await validateSlasCallbackToken(context, slasCallbackToken);

        // Parse request body to get email and token
        const { email_id, token } = await request.json();
        if (!email_id || !token) {
            return {
                success: false,
                error: t('errors:passwordless.missingRequiredFields'),
            };
        }

        await sendMagicLinkEmail(context, email_id, token, redirectUrl);

        return {
            success: true,
            data: {},
        };
    } catch (error) {
        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
}

/**
 * Handles passwordless login landing page
 * Processes magic link token and authenticates user
 */
export function handlePasswordlessLanding({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const email = url.searchParams.get('email') || '';
    const redirectUrl = url.searchParams.get('redirectUrl') || '';

    const params = new URLSearchParams();
    params.set('token', token);
    params.set('email', email);
    if (redirectUrl) params.set('returnUrl', redirectUrl);

    return redirect(`${routes.login}?${params.toString()}`);
}
