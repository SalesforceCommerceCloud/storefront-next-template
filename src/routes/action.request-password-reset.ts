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
import { getAuth, getPasswordResetToken } from '@/middlewares/auth.server';
import { getLogger } from '@/lib/logger.server';
import {
    extractErrorMessage,
    getPasswordResetErrorMessageKey,
    getSurfacedPasswordResetErrorMessageKey,
} from '@/lib/auth/error-handler';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { serializePasswordResetEmailCookie } from '@/lib/auth/remembered-email-cookie.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { getVerifiedLoginFromAccessToken } from '@/lib/auth/verified-session-login.server';
import { PASSWORD_RESET_MIN_RESPONSE_MS, withMinimumDuration } from '@/lib/auth/response-time-floor.server';

/**
 * True when the caller is a registered shopper asking to reset the password of the account they
 * are signed in to.
 *
 * The session's access token is NOT trusted to say who the shopper is: it arrives in a cookie and
 * the rest of the app only base64-decodes it (no signature check), so an attacker can mint a token
 * that names any email. The token's signature is therefore verified against the SLAS JWKS before
 * its login is read. That check is local (no SCAPI call), so a forged token can't trigger SLAS
 * auth recovery, and a forged, expired or other-tenant token simply isn't "own account".
 *
 * The comparison is against the login, which is what SLAS keys a password reset on. The profile
 * `email` is not used: it is editable and need not equal the login.
 *
 * The result depends only on the session and the submitted value, never on whether that value has
 * an account, so it adds no known-vs-unknown difference to the response.
 */
const isResettingOwnPassword = async (context: ActionFunctionArgs['context'], email: string): Promise<boolean> => {
    const session = getAuth(context);
    if (session.userType !== 'registered' || !session.accessToken) return false;
    const login = await getVerifiedLoginFromAccessToken(context, session.accessToken);
    return login !== null && login.toLowerCase() === email.trim().toLowerCase();
};

/**
 * Action endpoint for requesting a password reset email.
 * Used by account page when user without password clicks "Reset password".
 *
 * Signed-in shoppers resetting their own password see real errors (rate limit, backend failure),
 * since the account page toasts success otherwise. Every other caller gets a response that is
 * identical for known and unknown emails, in body, headers and (above a floor) response time, so
 * this endpoint is not an account-enumeration oracle.
 */
export async function action({ request, context }: ActionFunctionArgs): Promise<Response> {
    const logger = getLogger(context);
    const { t } = getTranslation(context);
    const formData = await request.formData();
    const email = formData.get('email')?.toString();

    if (!email) {
        return Response.json({ error: t('resetPassword:emailRequired') });
    }

    // Everything below depends on the submitted email, so it all takes at least the floor: a
    // rate-limited known account otherwise answers measurably slower than an unknown one.
    return withMinimumDuration(PASSWORD_RESET_MIN_RESPONSE_MS, async () => {
        // The ownership check only needs the session, so it runs alongside the send rather than
        // adding its own round trip to the request.
        const [ownAccount, sendFailure] = await Promise.all([
            isResettingOwnPassword(context, email),
            // Send password reset token using SLAS and Marketing Cloud
            getPasswordResetToken(context, { email }).then(
                () => null,
                (error: unknown) => ({ error })
            ),
        ]);

        if (sendFailure) {
            logger.error('RequestPasswordReset: failed', { error: sendFailure.error, email: redactEmailForLog(email) });
            const errorMessage = extractErrorMessage(sendFailure.error);
            if (ownAccount) {
                return Response.json({ error: t(getPasswordResetErrorMessageKey(errorMessage)) });
            }
            // Any failure other than client configuration is suppressed so the response doesn't
            // depend on whether the email has an account.
            const errorKey = getSurfacedPasswordResetErrorMessageKey(errorMessage);
            if (errorKey) {
                return Response.json({ error: t(errorKey) });
            }
        } else {
            logger.info('RequestPasswordReset: reset token sent', { email: redactEmailForLog(email) });
        }

        // Remember the email for the reset page; the reset link doesn't carry it. Set on every
        // non-error outcome so the response headers can't distinguish known from unknown emails.
        return Response.json(
            { success: true },
            { headers: { 'Set-Cookie': await serializePasswordResetEmailCookie(context, email) } }
        );
    });
}
