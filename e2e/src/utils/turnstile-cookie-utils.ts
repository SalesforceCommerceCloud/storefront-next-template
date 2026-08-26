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

/**
 * Helpers to mint a valid `cc-tv_*` cookie for Turnstile UI-suppress E2E.
 *
 * Matches server `computeTurnstileCookieValue` / `getTurnstileHmacKey` so
 * `/resource/turnstile-session` returns `{ verified: true }` without needing a
 * headless-solved Cloudflare challenge (local apps often pin interactive `3x…FF`).
 */

import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

export type TurnstileCookieMintParams = {
    email: string;
    siteKey: string;
    secret: string;
    siteId: string;
};

/**
 * Same derivation as `packages/template/src/lib/turnstile/hmac.server.ts` +
 * `cookie-match.server.ts` (`computeTurnstileCookieValue`).
 */
export function computeTurnstileVerifiedCookieValue(email: string, siteKey: string, secret: string): string {
    const hmacKey = createHash('sha256').update(`sfnext-turnstile-cookie-binding:${secret}`).digest();
    return createHmac('sha256', hmacKey).update(`${siteKey}:${email.trim().toLowerCase()}`).digest('hex');
}

type TurnstileSiteEntry = { siteKey?: string; domains?: string[] };

/**
 * Resolve the Cloudflare site key the **server** uses for localhost (HMAC binding).
 * Prefer `PUBLIC__app__security__turnstile__sites` from the storefront app `.env`.
 */
export function resolveServerTurnstileSiteKeyForLocalhost(env: NodeJS.ProcessEnv = process.env): string | null {
    const raw = env.PUBLIC__app__security__turnstile__sites;
    if (!raw) return null;
    try {
        const sites = JSON.parse(raw) as Record<string, TurnstileSiteEntry[]>;
        for (const entries of Object.values(sites)) {
            if (!Array.isArray(entries)) continue;
            for (const entry of entries) {
                if (!entry?.siteKey) continue;
                const domains = entry.domains ?? [];
                if (domains.includes('localhost') || domains.includes('127.0.0.1')) {
                    return entry.siteKey;
                }
            }
            // Fall back to first configured key when domains omitted
            if (entries[0]?.siteKey) return entries[0].siteKey;
        }
    } catch {
        return null;
    }
    return null;
}

export function resolveTurnstileSecretForSiteKey(siteKey: string, env: NodeJS.ProcessEnv = process.env): string | null {
    const raw = env.TURNSTILE_SECRET_KEYS;
    if (!raw) return null;
    try {
        const map = JSON.parse(raw) as Record<string, string>;
        return map[siteKey] || null;
    } catch {
        return null;
    }
}

/**
 * Load Turnstile site/secret env from `packages/template/.env` into `process.env`
 * when unset (mirrors `run-turnstile-e2e.ts` for verification flags).
 */
export function ensureAppTurnstileEnvLoaded(appEnvPath = resolve(process.cwd(), '..', '.env')): void {
    if (!existsSync(appEnvPath)) return;
    try {
        const parsed = parseDotenv(readFileSync(appEnvPath));
        const keys = [
            'PUBLIC__app__security__turnstile__sites',
            'TURNSTILE_SECRET_KEYS',
            'TURNSTILE_VERIFICATION_ENABLED',
        ] as const;
        for (const key of keys) {
            if (!process.env[key] && typeof parsed[key] === 'string' && parsed[key].length > 0) {
                process.env[key] = parsed[key];
            }
        }
    } catch {
        // ignore — callers assert mint params
    }
}

/**
 * Build mint params for a valid `cc-tv_${siteId}` cookie, or null if secrets/site key missing.
 */
export function getTurnstileCookieMintParams(email: string): TurnstileCookieMintParams | null {
    ensureAppTurnstileEnvLoaded();
    const siteKey =
        resolveServerTurnstileSiteKeyForLocalhost() ||
        // Default local silent key when sites env is unset (docs / config.server fallbacks)
        '1x00000000000000000000BB';
    const secret = resolveTurnstileSecretForSiteKey(siteKey);
    if (!secret) return null;
    const siteId = process.env.SITE_ID || 'RefArchGlobal';
    return { email, siteKey, secret, siteId };
}
