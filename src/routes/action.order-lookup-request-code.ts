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
import type { Route } from './+types/action.order-lookup-request-code';
import { data } from 'react-router';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getLogger } from '@/lib/logger.server';
import { parseOrderNumber, parseEmail } from '@/lib/order/lookup/validation';
import { requestOrderAccessCode, type RequestCodeError as ScapiRequestCodeError } from '@/lib/order/scapi.server';
import { enforceTurnstile } from '@/lib/turnstile/enforce.server';
import { redactEmailForLog } from '@/lib/turnstile/log-redact.server';
import { COOKIE_TURNSTILE_VERIFIED } from '@/lib/turnstile/constants';
import {
    hashOrderNumber,
    signOrderState,
    verifyOrderState,
    GuestOrderLookupSigningSecretMissingError,
    ACCESS_CODE_TTL_SECONDS,
    type GuestOrderState,
} from '@/lib/order/session.server';
import { ErrorCode } from '@/lib/error-codes';
import { createCookie, getCookieConfig, getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import { getSite } from '@/lib/utils.server';

type RequestCodeSuccess = {
    ok: true;
    alreadyVerified?: true;
    codeResent?: true;
};

type RequestCodeError = {
    ok: false;
    code: string;
    field?: string;
    message?: string;
    retryAfterSeconds?: number;
};

export type RequestCodeResponse = RequestCodeSuccess | RequestCodeError;

/**
 * Server action to request an access code for guest order lookup.
 * The access code is sent via email to the address on the order.
 *
 * Security defenses:
 * - Email enumeration defense: same response shape whether order exists or not
 * - Turnstile bot protection (when enabled)
 * - Cooldown: one request per order number per cooldownSeconds
 * - Rate limiting: SCAPI-enforced (retryAfterSeconds in response)
 */
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ReturnType<typeof data<RequestCodeResponse>>> {
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

    const appConfig = getConfig(context);

    // Feature gate: return 404 if guest order lookup is disabled
    if (!appConfig.guestOrderLookup.enabled) {
        logger.debug('[OrderLookup] Guest order lookup is disabled', { action: 'request-code' });
        return data(
            {
                ok: false,
                code: ErrorCode.NOT_FOUND,
                message: 'Not found',
            },
            { status: 404 }
        );
    }

    const formData = await request.formData();
    const orderNumber = formData.get('orderNumber')?.toString();
    const email = formData.get('email')?.toString();
    const turnstileToken = formData.get('turnstileToken')?.toString();

    // Validate order number
    const orderNumberResult = parseOrderNumber(orderNumber);
    if (!orderNumberResult.ok) {
        logger.debug('[OrderLookup] Invalid order number format', {
            action: 'request-code',
        });
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                field: 'orderNumber',
                message: 'Invalid order number format',
            },
            { status: 400 }
        );
    }

    // Additional order number pattern validation from config
    const orderNumberPattern = appConfig.guestOrderLookup.orderNumberPattern;
    if (orderNumberPattern) {
        try {
            const patternRegex = new RegExp(orderNumberPattern);
            if (!patternRegex.test(orderNumberResult.value)) {
                logger.debug('[OrderLookup] Order number does not match configured pattern', {
                    action: 'request-code',
                });
                return data(
                    {
                        ok: false,
                        code: 'VALIDATION',
                        field: 'orderNumber',
                        message: 'Invalid order number format',
                    },
                    { status: 400 }
                );
            }
        } catch (error) {
            // An invalid regex is a merchant configuration error, not a shopper-facing
            // validation failure — fail loudly instead of silently skipping pattern validation,
            // which would make every order number "valid" until the config is fixed.
            logger.error('[OrderLookup] Invalid order number pattern in config', {
                pattern: orderNumberPattern,
                error: error instanceof Error ? error.message : 'unknown',
            });
            return data(
                {
                    ok: false,
                    code: ErrorCode.CONFIGURATION_ERROR,
                    message: 'Guest order lookup is misconfigured',
                },
                { status: 500 }
            );
        }
    }

    const validatedOrderNumber = orderNumberResult.value;

    // Validate email
    const emailResult = parseEmail(email);
    if (!emailResult.ok) {
        logger.debug('[OrderLookup] Invalid email format', {
            action: 'request-code',
        });
        return data(
            {
                ok: false,
                code: 'VALIDATION',
                field: 'email',
                message: 'Invalid email format',
            },
            { status: 400 }
        );
    }

    const validatedEmail = emailResult.value;

    // Enforce Turnstile (only if enabled in config)
    if (appConfig.guestOrderLookup.turnstile.enabled) {
        const failOpen = appConfig.guestOrderLookup.turnstile.failOpen;

        let allowed: boolean;
        try {
            ({ allowed } = await enforceTurnstile({
                request,
                config: appConfig,
                turnstileToken,
                logger,
                actionName: 'order-lookup-request-code',
                email: validatedEmail,
                turnstileCookieName: getCookieNameWithSiteId(COOKIE_TURNSTILE_VERIFIED, context),
            }));
        } catch (error) {
            if (failOpen) {
                logger.warn('[OrderLookup] Turnstile enforcement failed, proceeding (fail-open)', {
                    action: 'request-code',
                    email: redactEmailForLog(validatedEmail),
                    error: error instanceof Error ? error.message : 'unknown',
                });
                allowed = true;
            } else {
                logger.warn('[OrderLookup] Turnstile enforcement failed, blocking (fail-closed)', {
                    action: 'request-code',
                    email: redactEmailForLog(validatedEmail),
                    error: error instanceof Error ? error.message : 'unknown',
                });
                allowed = false;
            }
        }

        if (!allowed) {
            return data(
                {
                    ok: false,
                    code: 'BOT_CHECK',
                    message: 'Bot verification failed',
                },
                { status: 403 }
            );
        }
    }

    const orderHash = hashOrderNumber(validatedOrderNumber);
    const cookieHeader = request.headers.get('cookie') || '';
    const orderStateCookieName = `glo_order_${orderHash}`;

    const orderStateCookie = createCookie<string>(
        orderStateCookieName,
        getCookieConfig({ httpOnly: true, path: '/' }, context),
        context
    );
    const existingOrderStateValue = await orderStateCookie.parse(cookieHeader);
    let existingOrderState: GuestOrderState | null = null;
    if (existingOrderStateValue) {
        const siteId = getSite(context).siteId;
        existingOrderState = verifyOrderState(existingOrderStateValue, siteId, ACCESS_CODE_TTL_SECONDS);

        // If the browser already holds a valid, verified order-state cookie for this order
        // (`glo_order_<orderHash>`), skip the SCAPI call and access-code entry entirely — navigate
        // them straight to results. Because the cookie name itself is order-scoped, this lookup can
        // only ever find state for the current order — no cross-order mismatch is possible here.
        // Defense-in-depth: the cookie name is already order-scoped, but also check the signed
        // payload's orderNumberHash.
        if (existingOrderState?.verified && existingOrderState.orderNumberHash === orderHash) {
            logger.info('[OrderLookup] Valid verified order state found, skipping SCAPI call', {
                action: 'request-code',
            });
            return data({ ok: true, alreadyVerified: true as const });
        }
    }

    // Detect repeat request: a valid (unverified or verified) glo_order_<hash> cookie already
    // existing means SCAPI already issued a code for this order that hasn't expired. SCAPI will
    // return 202 but won't re-call the hook — the existing code is still valid. We track this so
    // the UI can inform the user to check their spam folder rather than expecting a new email.
    const isRepeatRequest = Boolean(existingOrderState && existingOrderState.orderNumberHash === orderHash);

    // Cooldown gate: check request cookie 'glo_cd_<hash>'. Read via createCookie().parse() (not
    // raw header string-matching) so the namespaced name (getCookieNameWithSiteId) matches what
    // was actually written on success below.
    //
    // Threat model: this cookie is unsigned client state, by design — its only job is UX (throttle
    // the "resend" button in the common case), not security. A caller willing to drop cookies can
    // bypass it and request codes indefinitely; SCAPI's own per-order rate limiting is the real,
    // enforced backstop against abuse (see the RATE_LIMITED handling below).
    const cooldownCookieName = `glo_cd_${orderHash}`;
    const cooldownCookie = createCookie<string>(
        cooldownCookieName,
        getCookieConfig({ httpOnly: true, path: '/action/order-lookup-request-code' }, context),
        context
    );
    const cooldownCookieValue = await cooldownCookie.parse(cookieHeader);

    if (cooldownCookieValue) {
        const timestamp = parseInt(cooldownCookieValue, 10);

        if (!isNaN(timestamp)) {
            const cooldownSeconds = appConfig.guestOrderLookup.cooldownSeconds;
            const elapsedMs = Date.now() - timestamp;
            const remainingMs = cooldownSeconds * 1000 - elapsedMs;

            if (remainingMs > 0) {
                const retryAfterSeconds = Math.ceil(remainingMs / 1000);
                logger.debug('[OrderLookup] Cooldown active', {
                    action: 'request-code',
                    retryAfterSeconds,
                    email: redactEmailForLog(validatedEmail),
                });
                return data(
                    {
                        ok: false,
                        code: 'COOLDOWN',
                        retryAfterSeconds,
                        message: 'Please wait before requesting another code',
                    },
                    { status: 429 }
                );
            }
        }
    }

    // siteId/locale are auto-injected by SCAPI wrapper; getSite also throws if context isn't initialized
    const { siteId } = getSite(context);

    // Call SCAPI requestOrderAccessCode
    try {
        const result = await requestOrderAccessCode({
            orderNo: validatedOrderNumber,
            email: validatedEmail,
            context,
        });

        // Success path
        if ('ok' in result && result.ok === true) {
            // Success: set cooldown cookie
            const cooldownSeconds = appConfig.guestOrderLookup.cooldownSeconds;
            const cooldownResponseCookie = createCookie<string>(
                cooldownCookieName,
                getCookieConfig(
                    {
                        httpOnly: true,
                        maxAge: cooldownSeconds,
                        path: '/action/order-lookup-request-code',
                    },
                    context
                ),
                context
            );
            const cooldownSetCookieHeader = await cooldownResponseCookie.serialize(Date.now().toString());

            // Create/refresh the per-order state cookie. Its mere presence — even unverified —
            // grants the browser access to the code-entry UI on /order-lookup/results/:orderNo for this
            // order. Actual data access still requires `verified: true`, set only after
            // successful OTP verification (see action.order-lookup-verify.ts).
            const newOrderState: GuestOrderState = {
                siteId,
                orderNumberHash: orderHash,
                issuedAt: Date.now(),
                email: validatedEmail,
                verified: false,
                verifiedCode: null,
                attempts: 0,
            };
            const orderStateWriteCookie = createCookie<string>(
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
            const orderStateSetCookieHeader = await orderStateWriteCookie.serialize(signOrderState(newOrderState));

            logger.info('[OrderLookup] Access code requested successfully', {
                action: 'request-code',
                email: redactEmailForLog(validatedEmail),
                codeResent: isRepeatRequest,
            });

            const responseHeaders = new Headers();
            responseHeaders.append('Set-Cookie', cooldownSetCookieHeader);
            responseHeaders.append('Set-Cookie', orderStateSetCookieHeader);

            const successPayload: RequestCodeSuccess = isRepeatRequest ? { ok: true, codeResent: true } : { ok: true };
            return data(successPayload, { headers: responseHeaders });
        }

        // Error from SCAPI wrapper — map to stable shape
        // SECURITY: Never surface the raw SCAPI message — it may leak whether the order exists
        const errorResult = result as unknown as ScapiRequestCodeError;
        if (errorResult.status === 429) {
            // Rate limited by SCAPI
            const retryAfterSeconds = errorResult.retryAfterSeconds || 60;
            logger.warn('[OrderLookup] Rate limited by SCAPI', {
                action: 'request-code',
                email: redactEmailForLog(validatedEmail),
                retryAfterSeconds,
            });
            return data(
                {
                    ok: false,
                    code: ErrorCode.RATE_LIMITED,
                    retryAfterSeconds,
                    message: 'Too many requests, please try again later',
                },
                { status: 429 }
            );
        }

        // Generic error — do not leak existence
        logger.warn('[OrderLookup] Request code failed', {
            action: 'request-code',
            email: redactEmailForLog(validatedEmail),
            status: errorResult.status,
            requestId: errorResult.requestId,
        });

        return data(
            {
                ok: false,
                code: 'REQUEST_FAILED',
                message: 'Unable to send access code',
            },
            { status: 500 }
        );
    } catch (error) {
        // Missing signing secret — a config error, not a shopper-facing failure. Surfaced
        // distinctly (rather than the generic REQUEST_FAILED below) so it's diagnosable instead
        // of looking like a silent SCAPI/network failure.
        if (error instanceof GuestOrderLookupSigningSecretMissingError) {
            logger.error('[OrderLookup] Signing secret not configured — set GUEST_ORDER_LOOKUP_COOKIE_SECRET', {
                action: 'request-code',
            });
            return data(
                {
                    ok: false,
                    code: ErrorCode.CONFIGURATION_ERROR,
                    message: 'Guest order lookup is misconfigured',
                },
                { status: 500 }
            );
        }

        // SCAPI_UNSUPPORTED thrown by the wrapper
        if (error && typeof error === 'object' && 'code' in error && error.code === ErrorCode.SCAPI_UNSUPPORTED) {
            logger.warn('[OrderLookup] SCAPI method not supported (requires v26.8+)', {
                action: 'request-code',
            });
            return data(
                {
                    ok: false,
                    code: ErrorCode.SCAPI_UNSUPPORTED,
                    message: 'Order lookup requires a newer API version',
                },
                { status: 501 }
            );
        }

        // Unknown error
        logger.error('[OrderLookup] Request code threw unexpected error', {
            action: 'request-code',
            email: redactEmailForLog(validatedEmail),
            error: error instanceof Error ? error.message : 'unknown',
        });

        return data(
            {
                ok: false,
                code: 'REQUEST_FAILED',
                message: 'Unable to send access code',
            },
            { status: 500 }
        );
    }
}
