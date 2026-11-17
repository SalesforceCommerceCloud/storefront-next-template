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
import { isValidCookieDomain } from '@salesforce/storefront-next-runtime/cookie-domain';

export const HOME_STORE_PROMPT_DISMISSAL_COOKIE = 'store-locator-home-prompt-dismissed';

/**
 * Returns the site-namespaced cookie name used by both the browser and server.
 */
export function getHomeStorePromptDismissalCookieName(siteId: string): string {
    return `${HOME_STORE_PROMPT_DISMISSAL_COOKIE}_${siteId}`;
}

/**
 * Checks whether a raw Cookie header contains the session-only dismissal marker.
 */
export function isHomeStorePromptDismissed(cookieHeader: string | null, siteId: string): boolean {
    if (!cookieHeader || !siteId) {
        return false;
    }

    const cookieName = getHomeStorePromptDismissalCookieName(siteId);
    return cookieHeader.split(';').some((entry) => entry.trim() === `${cookieName}=1`);
}

/**
 * Serializes the non-sensitive session cookie written when a shopper dismisses the prompt.
 */
export function serializeHomeStorePromptDismissalCookie({
    siteId,
    cookieDomain,
    secure,
}: {
    siteId: string;
    cookieDomain?: string;
    secure: boolean;
}): string {
    const parts = [`${getHomeStorePromptDismissalCookieName(siteId)}=1`, 'Path=/', 'SameSite=Lax'];
    if (cookieDomain && isValidCookieDomain(cookieDomain)) {
        parts.push(`Domain=${cookieDomain}`);
    }
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}
