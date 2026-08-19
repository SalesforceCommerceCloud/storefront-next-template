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

import type { Route } from './+types/action.order-lookup-verify';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { parseOrderNumber, parseEmail, parseOtp } from '@/lib/order/lookup/validation';
import { guestOrderLookup, type LookupResult } from '@/lib/order/scapi.server';
import {
    signOrderState,
    verifyOrderState,
    hashOrderNumber,
    GuestOrderLookupSigningSecretMissingError,
    ACCESS_CODE_TTL_SECONDS,
    type GuestOrderState,
} from '@/lib/order/session.server';
import {
    getServerVerifyAttempts,
    recordFailedVerifyAttempt,
    clearServerVerifyAttempts,
} from '@/lib/order/verify-attempts.server';
import { createCookie, getCookieConfig, getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import { getLogger } from '@/lib/logger.server';
import { enforceTurnstile } from '@/lib/turnstile/enforce.server';
import { COOKIE_TURNSTILE_VERIFIED } from '@/lib/turnstile/constants';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { ErrorCode } from '@/lib/error-codes';

const MAX_ATTEMPTS = 5;
const COOKIE_ORDER_STATE_PREFIX = 'glo_order_';

export type VerifyOrderResponse =
    | { ok: true }
    | {
          ok: false;
          code:
              | 'VALIDATION'
              | 'INVALID_CODE'
              | 'RATE_LIMITED'
              | 'SCAPI_UNSUPPORTED'
              | 'ATTEMPTS_EXCEEDED'
              | 'FEATURE_DISABLED'
              | 'CONFIGURATION_ERROR'
              | 'BOT_CHECK'
              | 'NOT_AUTHORIZED'
              | typeof ErrorCode.METHOD_NOT_ALLOWED;
          field?: 'orderNumber' | 'email' | 'code';
          message?: string;
          retryAfterSeconds?: number;
      };

/**
 * Verify the access code and update the per-order state cookie for guest order lookup.
 *
 * Post-pivot: this action does NOT return the order. It only proves the browser earned
 * access. The results view (G10) will re-call `guestOrderLookup` with the OTP entered
 * by the user in the verify-code form.
 *
 * On success, updates the signed, per-order state cookie (`glo_order_<orderHash>`), created
 * earlier by action.order-lookup-request-code.ts, setting `verified: true` and storing the
 * verified OTP (`verifiedCode`) so the results view can auto-fetch without re-entry. Scoping
 * the cookie name by order hash means verifying a second order never clobbers a still-valid
 * verification for a prior order.
 *
 * Rate limiting: enforced server-side (`verify-attempts.server.ts`), keyed on the order hash —
 * not the client-supplied cookie's `attempts` field, which a caller can zero out by simply
 * omitting the cookie. The cookie's `attempts` field is still maintained for observability/UX
 * (e.g. showing "N attempts remaining"), but the server-side counter is what actually blocks
 * further SCAPI calls once `MAX_ATTEMPTS` is reached.
 *
 * Turnstile bot protection, same as action.order-lookup-request-code.ts.
 *
 * Security: "code wrong" and "order doesn't exist" produce identical responses (same
 * status, same body) to prevent email enumeration.
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<VerifyOrderResponse>>> {
    const logger = getLogger(context);

    if (request.method !== 'POST') {
        return data(
            {
                ok: false,
                code: ErrorCode.METHOD_NOT_ALLOWED,
                message: 'Method not allowed',
            },
            { status: 405 }
        );
    }

    // Feature gate
    const config = getConfig(context);
    if (!config.guestOrderLookup?.enabled) {
        logger.warn('OrderLookupVerify: feature disabled');
        return data(
            {
                ok: false,
                code: 'FEATURE_DISABLED',
                message: 'Guest order lookup is not enabled',
            },
            { status: 404 }
        );
    }

    const siteCtx = context.get(siteContext);
    if (!siteCtx?.site?.id) {
        logger.error('OrderLookupVerify: site context not initialized');
        return data(
            {
                ok: false,
                code: 'FEATURE_DISABLED',
                message: 'Site context not initialized',
            },
            { status: 500 }
        );
    }

    const { site } = siteCtx;
    const siteId = site.id;

    // Parse form data
    const formData = await request.formData();
    const orderNumberRaw = formData.get('orderNumber');
    const emailRaw = formData.get('email');
    const codeRaw = formData.get('code');
    const turnstileToken = formData.get('turnstileToken')?.toString();

    // Validate inputs
    const orderNumberResult = parseOrderNumber(orderNumberRaw);
    if (!orderNumberResult.ok) {
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                field: 'orderNumber',
                message: 'Invalid order number',
            },
            { status: 400 }
        );
    }

    const emailResult = parseEmail(emailRaw);
    if (!emailResult.ok) {
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                field: 'email',
                message: 'Invalid email',
            },
            { status: 400 }
        );
    }

    const codeResult = parseOtp(codeRaw);
    if (!codeResult.ok) {
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                field: 'code',
                message: 'Invalid code',
            },
            { status: 400 }
        );
    }

    const orderNumber = orderNumberResult.value;
    const email = emailResult.value;
    const code = codeResult.value;

    // Enforce Turnstile (only if enabled in config) — same defense as request-code, extended
    // here because an attacker who knows a valid order+email pair could otherwise script OTP
    // guesses against this action without ever passing a bot challenge.
    if (config.guestOrderLookup.turnstile.enabled) {
        const failOpen = config.guestOrderLookup.turnstile.failOpen;

        let allowed: boolean;
        try {
            ({ allowed } = await enforceTurnstile({
                request,
                config,
                turnstileToken,
                logger,
                actionName: 'order-lookup-verify',
                email,
                turnstileCookieName: getCookieNameWithSiteId(COOKIE_TURNSTILE_VERIFIED, context),
            }));
        } catch (error) {
            allowed = failOpen;
            logger.warn(
                `OrderLookupVerify: Turnstile enforcement failed, ${failOpen ? 'proceeding (fail-open)' : 'blocking (fail-closed)'}`,
                { email: redactEmailForLog(email), error: error instanceof Error ? error.message : 'unknown' }
            );
        }

        if (!allowed) {
            return data({ ok: false, code: 'BOT_CHECK', message: 'Bot verification failed' }, { status: 403 });
        }
    }

    const orderHash = hashOrderNumber(orderNumber);
    const orderStateCookieName = `${COOKIE_ORDER_STATE_PREFIX}${orderHash}`;
    const cookieHeader = request.headers.get('Cookie');
    const orderStateCookie = createCookie<string>(
        orderStateCookieName,
        getCookieConfig(
            {
                httpOnly: true,
                maxAge: ACCESS_CODE_TTL_SECONDS,
                path: '/',
            },
            context
        ),
        context
    );
    const orderStateValue = await orderStateCookie.parse(cookieHeader);
    const existingOrderState = orderStateValue
        ? verifyOrderState(orderStateValue, siteId, ACCESS_CODE_TTL_SECONDS)
        : null;

    // Require the per-order state cookie set by action.order-lookup-request-code.ts before
    // touching SCAPI at all — proves the browser actually went through the request-code step for
    // this order (and hasn't had its cookie expire/get cleared) instead of guessing an
    // order+email+code triple cold.
    if (!existingOrderState || existingOrderState.orderNumberHash !== orderHash) {
        logger.debug('OrderLookupVerify: missing or invalid order-state cookie', { orderHash });
        return data(
            {
                ok: false,
                code: 'NOT_AUTHORIZED',
                message: 'Request an access code before verifying',
            },
            { status: 401 }
        );
    }

    // Rate limiting: the server-side counter (keyed on siteId + order hash, never trusts client
    // state) is the real gate. The cookie's `attempts` field mirrors it for UX purposes only.
    const attemptCount = getServerVerifyAttempts(siteId, orderHash);

    if (attemptCount >= MAX_ATTEMPTS) {
        logger.warn('OrderLookupVerify: max attempts exceeded', {
            orderHash,
            email: redactEmailForLog(email),
        });
        return data(
            {
                ok: false,
                code: 'ATTEMPTS_EXCEEDED',
                message: 'Maximum verification attempts exceeded',
            },
            { status: 429 }
        );
    }

    // Call SCAPI to verify the code
    let lookupResult: LookupResult;
    try {
        lookupResult = await guestOrderLookup({
            orderNo: orderNumber,
            email,
            accessCode: code,
            context,
        });
    } catch (error) {
        // SCAPI_UNSUPPORTED thrown from guestOrderLookup
        if (error instanceof Error && 'code' in error && error.code === ErrorCode.SCAPI_UNSUPPORTED) {
            logger.error('OrderLookupVerify: SCAPI version unsupported', { error });
            return data(
                {
                    ok: false,
                    code: 'SCAPI_UNSUPPORTED',
                    message: 'Guest order lookup requires SCAPI v26.8 or later',
                },
                { status: 501 }
            );
        }

        // Generic error
        logger.error('OrderLookupVerify: unexpected error', { error });
        return data(
            {
                ok: false,
                code: 'INVALID_CODE',
                message: 'Verification failed',
            },
            { status: 401 }
        );
    }

    // Handle SCAPI errors
    if (!lookupResult.ok) {
        const { code: errorCode, retryAfterSeconds } = lookupResult;

        if (errorCode === ErrorCode.RATE_LIMITED) {
            logger.warn('OrderLookupVerify: rate limited by SCAPI', {
                orderHash,
                email: redactEmailForLog(email),
                retryAfterSeconds,
            });
            return data(
                {
                    ok: false,
                    code: 'RATE_LIMITED',
                    retryAfterSeconds,
                    message: 'Too many requests',
                },
                { status: 429 }
            );
        }

        // Increment the server-side attempt counter (the real gate) and mirror the new count
        // into the signed cookie for UX only — re-sign the whole state so issuedAt (and any
        // other fields) survive, only attempts changes.
        const newAttemptCount = recordFailedVerifyAttempt(siteId, orderHash, ACCESS_CODE_TTL_SECONDS);
        const failedOrderState: GuestOrderState = {
            siteId,
            orderNumberHash: orderHash,
            issuedAt: existingOrderState?.issuedAt ?? Date.now(),
            email: existingOrderState?.email ?? email,
            verified: false,
            verifiedCode: null,
            attempts: newAttemptCount,
        };

        let signedFailedState: string;
        try {
            signedFailedState = signOrderState(failedOrderState);
        } catch (error) {
            if (error instanceof GuestOrderLookupSigningSecretMissingError) {
                logger.error('OrderLookupVerify: signing secret not configured — set GUEST_ORDER_LOOKUP_COOKIE_SECRET');
                return data(
                    { ok: false, code: 'CONFIGURATION_ERROR', message: 'Guest order lookup is misconfigured' },
                    { status: 500 }
                );
            }
            throw error;
        }
        const orderStateSetCookie = await orderStateCookie.serialize(signedFailedState);

        logger.warn('OrderLookupVerify: verification failed', {
            orderHash,
            email: redactEmailForLog(email),
            scapiCode: errorCode,
            attemptCount: newAttemptCount,
        });

        return data(
            {
                ok: false,
                code: 'INVALID_CODE',
                message: 'Invalid verification code',
            },
            {
                status: 401,
                headers: {
                    'Set-Cookie': orderStateSetCookie,
                },
            }
        );
    }

    // Success: clear the server-side attempt counter and update the order-state cookie — mark
    // verified, store the OTP so the results page can auto-fetch without re-entry, and clear
    // the cookie's mirrored attempt counter too.
    clearServerVerifyAttempts(siteId, orderHash);
    const verifiedOrderState: GuestOrderState = {
        siteId,
        orderNumberHash: orderHash,
        issuedAt: existingOrderState?.issuedAt ?? Date.now(),
        email: existingOrderState?.email ?? email,
        verified: true,
        verifiedCode: code,
        attempts: 0,
    };

    let signedVerifiedState: string;
    try {
        signedVerifiedState = signOrderState(verifiedOrderState);
    } catch (error) {
        if (error instanceof GuestOrderLookupSigningSecretMissingError) {
            logger.error('OrderLookupVerify: signing secret not configured — set GUEST_ORDER_LOOKUP_COOKIE_SECRET');
            return data(
                { ok: false, code: 'CONFIGURATION_ERROR', message: 'Guest order lookup is misconfigured' },
                { status: 500 }
            );
        }
        throw error;
    }
    const orderStateSetCookie = await orderStateCookie.serialize(signedVerifiedState);

    logger.info('OrderLookupVerify: verification successful', {
        orderHash,
        email: redactEmailForLog(email),
    });

    const responseHeaders = new Headers();
    responseHeaders.append('Set-Cookie', orderStateSetCookie);

    return data({ ok: true }, { headers: responseHeaders });
}
