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
import type { Route } from './+types/resource.turnstile-session';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { getCookieNameWithSiteId } from '@/lib/cookie-utils.server';
import { COOKIE_TURNSTILE_VERIFIED } from '@/lib/turnstile/constants';
import { isTurnstileSessionVerifiedForEmail } from '@/lib/turnstile/cookie-match.server';
import { getTurnstileSiteKey, isTurnstileEnabled } from '@/lib/turnstile/utils';
import { resolveVerificationMode } from '@/lib/turnstile/enforce.server';

export type TurnstileSessionData = {
    /**
     * True only when this request's `cc-tv_*` cookie HMAC-matches the supplied email.
     * Never indicates whether the email exists in the commerce backend.
     */
    verified: boolean;
};

/**
 * UI-facing check: does the current request's Turnstile session cookie match this email?
 *
 * Used by checkout contact-info / passwordless login on email blur so the client can
 * suppress remounting the widget within the 30-minute `cc-tv_*` window. Server
 * `enforceTurnstile` remains the source of truth on submit — this endpoint must not
 * be treated as an allow signal for protected actions.
 *
 * @example
 *   GET /resource/turnstile-session?email=shopper%40example.com
 *   → { verified: true | false }
 */
export function loader({ request, context }: Route.LoaderArgs): TurnstileSessionData {
    const config = getConfig(context);
    const mode = resolveVerificationMode(config);

    if (!isTurnstileEnabled(config) || mode === 'disabled') {
        return { verified: false };
    }

    const email = new URL(request.url).searchParams.get('email')?.trim();
    if (!email) {
        return { verified: false };
    }

    // Prefer the resource URL host (same-origin GET); fall back to Origin/Referer.
    const originOrReferer = request.headers.get('origin') || request.headers.get('referer') || '';
    const siteKey =
        getTurnstileSiteKey(config, request.url) ||
        (originOrReferer ? getTurnstileSiteKey(config, originOrReferer) : null);

    if (!siteKey) {
        return { verified: false };
    }

    const turnstileCookieName = getCookieNameWithSiteId(COOKIE_TURNSTILE_VERIFIED, context);

    return {
        verified: isTurnstileSessionVerifiedForEmail({
            request,
            email,
            siteKey,
            turnstileCookieName,
        }),
    };
}
