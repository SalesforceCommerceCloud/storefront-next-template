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
import type { RouterContextProvider } from 'react-router';
import { validateSlasCallbackToken } from '@/lib/notify/notify.server';
import { getLoginEmailFromToken } from '@/middlewares/auth.utils';
import { getLogger } from '@/lib/logger.server';

/**
 * The login (SLAS `upn`) of the shopper an access token was issued to, or `null` when the token
 * cannot be proven genuine.
 *
 * The session's access token arrives in a cookie and the rest of the app only base64-decodes it, so
 * the claims in it are attacker-controlled until the signature is checked. This verifies the
 * signature against the SLAS JWKS (also enforcing expiry, an allowed algorithm and this tenant's
 * issuer), entirely locally: it makes no SCAPI call, so a forged token can't trigger SLAS auth
 * recovery or its per-session rate limit. Guest tokens, which carry no login, return `null`.
 *
 * Any failure (bad signature, expired, wrong tenant, JWKS unreachable) returns `null`, so callers
 * fail closed.
 */
export async function getVerifiedLoginFromAccessToken(
    context: Readonly<RouterContextProvider>,
    accessToken: string | undefined
): Promise<string | null> {
    if (!accessToken) return null;
    try {
        await validateSlasCallbackToken(context, accessToken);
    } catch (error) {
        // Debug, not error: a forged or stale cookie is routine traffic, not a fault.
        getLogger(context).debug('VerifiedSessionLogin: access token not verified', {
            reason: error instanceof Error ? error.message : 'unknown',
        });
        return null;
    }
    // The signature has been verified, so the claims read here are the ones SLAS issued.
    return getLoginEmailFromToken(accessToken);
}
