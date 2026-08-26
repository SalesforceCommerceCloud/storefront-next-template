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
 * Turnstile utility functions for site key lookup, secret key retrieval, and config helpers.
 *
 * Client-safe: do not import `node:crypto` here. HMAC helpers live in `hmac.server.ts`
 * so checkout/login client modules can import this file without breaking the browser bundle.
 */

import type { AppConfig } from '@/types/config';

/**
 * Get Turnstile site key for the current store URL.
 * Uses exact hostname matching (first-match across all groups).
 */
export function getTurnstileSiteKey(config: AppConfig, baseUrl: string): string | null {
    const sites = config.security?.turnstile?.sites;
    if (!sites) {
        return null;
    }

    const hostname = extractHostname(baseUrl);

    for (const [, siteConfigs] of Object.entries(sites)) {
        for (const siteConfig of siteConfigs) {
            if (siteConfig.domains.includes(hostname)) {
                return siteConfig.siteKey;
            }
        }
    }

    return null;
}

function extractHostname(urlString: string): string {
    try {
        return new URL(urlString).hostname;
    } catch {
        return urlString
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .split(':')[0];
    }
}

/** Get secret key for a given site key (server-side only). */
export function getTurnstileSecretKey(siteKey: string): string | null {
    if (typeof window !== 'undefined') {
        return null;
    }

    try {
        const secretKeys = process.env.TURNSTILE_SECRET_KEYS ? JSON.parse(process.env.TURNSTILE_SECRET_KEYS) : {};

        return secretKeys[siteKey] || null;
    } catch (error) {
        // oxlint-disable-next-line no-console
        console.error('[Turnstile] Failed to parse TURNSTILE_SECRET_KEYS:', error);
        return null;
    }
}

/**
 * Resolve the Turnstile site key from the current browser location.
 * Returns null during SSR (`typeof window === 'undefined'`) or when no domain matches.
 */
export function getBrowserTurnstileSiteKey(config: AppConfig): string | null {
    if (typeof window === 'undefined') {
        return null;
    }
    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    return getTurnstileSiteKey(config, baseUrl);
}

/** Check if Turnstile is enabled in config. */
export function isTurnstileEnabled(config: AppConfig): boolean {
    return config.security?.turnstile?.enabled ?? false;
}

/** Get Turnstile mode from config. */
export function getTurnstileMode(config: AppConfig): 'managed' | 'non-interactive' | 'invisible' {
    return config.security?.turnstile?.mode || 'managed';
}
