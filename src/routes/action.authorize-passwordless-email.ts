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
import type { Route } from './+types/action.authorize-passwordless-email';
import { data } from 'react-router';
import { authorizePasswordless } from '@/middlewares/auth.server';
import { extractErrorMessage } from '@/lib/auth/error-handler';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLoginPreferences } from '@/lib/login-preferences.server';
import { enforceTurnstile } from '@/lib/turnstile/enforce.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { createCookie, getCookieConfig } from '@/lib/cookie-utils.server';
import { COOKIE_TURNSTILE_VERIFIED, TURNSTILE_VERIFIED_MAX_AGE } from '@/lib/turnstile/constants';
import { ApiError } from '@/scapi';

export type AuthorizePasswordlessEmailResponse = {
    success: boolean;
    error?: ActionError;
    email?: string;
    requiresLogin?: boolean;
};

/**
 * Server action to send OTP for passwordless login (mode=email).
 * Called when the shopper tabs or clicks out of the email field at checkout contact step.
 * Uses passwordless authorize with mode from config (email); does not register a customer.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<AuthorizePasswordlessEmailResponse>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Method not allowed' }),
            },
            { status: 405 }
        );
    }

    const formData = await request.formData();
    const email = formData.get('email')?.toString()?.trim();
    const turnstileToken = formData.get('turnstileToken')?.toString();
    // Caller-controlled: checkout sets 'true'; My Account reauth omits it.
    const strictVerify = formData.get('strictVerify')?.toString() === 'true';

    if (!email) {
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.REQUIRED_FIELD, message: 'Email is required' }),
            },
            { status: 400 }
        );
    }

    const appConfig = getConfig(context);

    // When email verification is disabled the request routes to standard (password) login,
    // which Turnstile does not protect; deciding this before enforcement prevents a
    // gated-off widget (no token) from producing a spurious 403. No cc-tv cookie is set
    // because no Turnstile gate was cleared.
    const { emailVerificationEnabled } = await getLoginPreferences(context);
    if (!emailVerificationEnabled) {
        logger.info('AuthorizePasswordlessEmail: email verification disabled, skipping SLAS', {
            email: redactEmailForLog(email),
        });
        return data({ success: false, requiresLogin: true, email });
    }

    const allowed = await enforceTurnstile({
        request,
        config: appConfig,
        turnstileToken,
        logger,
        actionName: 'authorize-passwordless-email',
        email,
    });
    if (!allowed) {
        return data(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.NOT_AUTHORIZED,
                    message: 'Turnstile verification failed',
                }),
            },
            { status: 403 }
        );
    }

    // The cc-tv cookie attests that this client cleared the Turnstile gate. We set it
    // here, immediately after enforceTurnstile returned true, so every response path
    // below carries it — success, 400, 404, 5xx, generic 500. The cookie's job is to
    // record "Turnstile passed" so other Turnstile-protected endpoints (e.g.
    // /initiate-checkout-registration) can skip a fresh challenge within the 30-minute
    // window. SCAPI's later verdict is about the email/account, not about whether the
    // client is a bot — conditioning the cookie on SCAPI success would force a fresh
    // challenge on legitimate shoppers for events (typed unrecognized email, transient
    // SLAS blip) that have nothing to do with bot detection.
    const tvCookie = createCookie<string>(
        COOKIE_TURNSTILE_VERIFIED,
        getCookieConfig({ httpOnly: true, maxAge: TURNSTILE_VERIFIED_MAX_AGE }, context),
        context
    );
    const setCookieHeader = await tvCookie.serialize('1');
    const headers = { 'Set-Cookie': setCookieHeader };

    try {
        await authorizePasswordless(context, { userid: email, strictVerify });

        logger.info('AuthorizePasswordlessEmail: OTP sent');

        return data({ success: true, email }, { headers });
    } catch (error) {
        // SLAS response routing:
        //   400 "email not verified" -> re-issue without strict_verify so SLAS dispatches the OTP;
        //                               /passwordless/token will then verify and sign in atomically.
        //                               Per SLAS contract, this status is only returned when the
        //                               email verification site pref is enabled.
        //   400 (other) | 5xx        -> standard login modal
        //   403 | 404                -> continue as guest
        //   other                    -> generic error
        if (error instanceof ApiError) {
            if (error.status === 400 && /email not verified/i.test(extractErrorMessage(error))) {
                try {
                    await authorizePasswordless(context, { userid: email, strictVerify: false });
                    logger.info('AuthorizePasswordlessEmail: OTP sent (verify-email recovery)');
                    return data({ success: true, email }, { headers });
                } catch (recoveryError) {
                    const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : 'unknown error';
                    const recoveryStatus = recoveryError instanceof ApiError ? recoveryError.status : undefined;
                    logger.error('AuthorizePasswordlessEmail: verify-email recovery dispatch failed', {
                        email: redactEmailForLog(email),
                        recoveryStatus,
                        recoveryMessage,
                    });
                    return data({ success: false, requiresLogin: true, email }, { headers });
                }
            }

            if (error.status === 400 || error.status >= 500) {
                logger.warn('AuthorizePasswordlessEmail: SLAS rejected, falling back to standard login', {
                    email: redactEmailForLog(email),
                    status: error.status,
                });
                return data({ success: false, requiresLogin: true, email }, { headers });
            }

            if (error.status === 403 || error.status === 404) {
                logger.debug('AuthorizePasswordlessEmail: SLAS will not authorize, proceed as guest', {
                    email: redactEmailForLog(email),
                    status: error.status,
                });
                return data({ success: false, email }, { headers });
            }
        }

        logger.error('AuthorizePasswordlessEmail: failed', { error });
        const errorMessage = extractErrorMessage(error);
        return data(
            {
                success: false,
                error: createActionError({ code: ErrorCode.OPERATION_FAILED, message: errorMessage }),
            },
            { status: 500, headers }
        );
    }
}
