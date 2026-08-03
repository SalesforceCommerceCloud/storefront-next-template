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
 * Client helper: ask the BFF whether the httpOnly `cc-tv_*` cookie matches this email.
 *
 * UI-only suppress signal — never used to skip server `enforceTurnstile`.
 * On network/parse failure returns false so the widget still mounts (fail closed for UX).
 */

export type TurnstileSessionCheckResult = {
    verified: boolean;
};

/**
 * @param sessionPath - Site/locale-resolved `/resource/turnstile-session` path
 * @param email - Shopper email to check against the current request cookie
 */
export async function checkTurnstileSessionVerified(sessionPath: string, email: string): Promise<boolean> {
    const trimmed = email.trim();
    if (!trimmed || !sessionPath) return false;

    try {
        const url = `${sessionPath}?email=${encodeURIComponent(trimmed)}`;
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return false;
        const data = (await res.json()) as TurnstileSessionCheckResult;
        return data.verified === true;
    } catch {
        return false;
    }
}
