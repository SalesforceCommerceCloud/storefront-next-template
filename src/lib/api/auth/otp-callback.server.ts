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
import { type ActionFunctionArgs } from 'react-router';
import { sendNotification, validateSlasCallbackToken } from '@/lib/notify/notify.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { getLogger } from '@/lib/logger.server';
import { extractResponseError } from '@/lib/utils';

/**
 * Handles the OTP SLAS callback action.
 * Validates the SLAS JWT and sends the OTP code via the email cartridge.
 */
export async function handleOtpCallback({ request, context }: ActionFunctionArgs) {
    const logger = getLogger(context);
    const { t } = getTranslation(context);

    const config = getConfig(context);
    if (config?.features?.otpRequest?.mode !== 'callback') {
        return { success: false, error: t('errors:passwordless.missingCallbackToken') };
    }

    try {
        const slasCallbackToken = request.headers.get('x-slas-callback-token');

        if (!slasCallbackToken) {
            logger.warn('OtpCallback: missing SLAS callback token');
            return {
                success: false,
                error: t('errors:passwordless.missingCallbackToken'),
            };
        }

        await validateSlasCallbackToken(context, slasCallbackToken);

        const rawBody: unknown = await request.json();

        if (typeof rawBody !== 'object' || rawBody === null) {
            logger.warn('OtpCallback: malformed request body');
            return {
                success: false,
                error: t('errors:passwordless.missingRequiredFields'),
            };
        }

        const { email_id, token } = rawBody as Record<string, unknown>;

        if (typeof email_id !== 'string' || typeof token !== 'string' || !email_id || !token) {
            logger.warn('OtpCallback: missing required fields', {
                hasEmailId: Boolean(email_id),
                hasToken: Boolean(token),
            });
            return {
                success: false,
                error: t('errors:passwordless.missingRequiredFields'),
            };
        }

        await sendNotification(context, {
            type: 'otp',
            recipient: email_id,
            data: { token },
        });

        logger.info('OtpCallback: OTP notification sent');
        return { success: true };
    } catch (error) {
        const { responseMessage } = await extractResponseError(error);
        logger.error('OtpCallback: failed', { error });
        return {
            success: false,
            error: responseMessage,
        };
    }
}
