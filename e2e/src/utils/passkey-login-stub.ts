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
 * Per-scenario stub for the two passkey-authentication (login) action routes
 * (`/action/passkey-start-authentication`, `/action/passkey-finish-authentication`).
 * `finishPasskeyAuthentication` makes a real SLAS call with no test-bypass (see
 * `auth.server.ts`), so — same as `passkey-registration-stub.ts` — these routes
 * are intercepted at the Playwright network layer rather than exercised for real.
 *
 * The stubbed `start-authentication` response supplies real WebAuthn request
 * options so `navigator.credentials.get({mediation: 'conditional'})` still runs
 * for real in the browser, backed by the CDP virtual authenticator and resident
 * credential from `webauthn-utils.ts`. No `allowCredentials` list is sent —
 * passkey login is discoverable-only, matching `startPasskeyAuthentication`'s
 * anonymous/no-`userId` path.
 *
 * The stubbed `finish-authentication` response only needs to satisfy
 * `usePasskeyLogin`'s client-side contract (`success` truthy and `tokenResponse`
 * present) — the token is never sent to a real server, so its contents don't
 * need to be cryptographically valid.
 */

import type { Route, Request } from 'playwright';

/**
 * Number of POSTs to `passkey-start-authentication` seen since the last
 * `stubPasskeyLogin()` call. Lets a test assert the ceremony was (or wasn't)
 * kicked off — e.g. the unsupported-browser scenario asserts it stays 0.
 */
let startAuthenticationCount = 0;

/** Reads the start-authentication hit count for the current scenario. */
export function getPasskeyStartAuthenticationCount(): number {
    return startAuthenticationCount;
}

/** Base64url-encode a UTF-8 string, matching the format SLAS/WebAuthn use for `challenge`. */
function toBase64Url(input: string): string {
    return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildPublicKeyRequestOptions(rpId: string): Record<string, unknown> {
    return {
        rpId,
        challenge: toBase64Url(`challenge-${rpId}`),
        timeout: 60000,
        userVerification: 'required',
    };
}

function buildStubTokenResponse(): Record<string, unknown> {
    return {
        access_token: 'stub-access-token',
        id_token: 'stub-id-token',
        refresh_token: 'stub-refresh-token',
        expires_in: 1800,
        refresh_token_expires_in: 2592000,
        token_type: 'bearer',
        usid: 'stub-usid',
        customer_id: 'stub-customer-id',
        enc_user_id: 'stub-enc-user-id',
    };
}

/**
 * Install route handlers for both passkey-authentication action routes.
 * `rpId` should match the storefront's hostname (e.g. `new URL(BASE_URL).hostname`),
 * matching the resident credential seeded via `addResidentCredential()`.
 */
export async function stubPasskeyLogin(opts: {
    rpId: string;
    wishlistMerge?: 'success' | 'partial';
    startDelayMs?: number;
    /**
     * Outcome of the finish-authentication round trip. Defaults to `'success'`.
     * `'serverError'` returns a 500, `'rejected'` a 200 with `success: false` —
     * both are paths `usePasskeyLogin` treats as a silent no-op (no redirect, no
     * error surfaced), modeling a real SLAS authentication that fails after a
     * valid ceremony (e.g. credential unknown to SLAS, expired challenge).
     */
    finishOutcome?: 'success' | 'serverError' | 'rejected';
}): Promise<void> {
    const { rpId, wishlistMerge, startDelayMs, finishOutcome = 'success' } = opts;
    startAuthenticationCount = 0;
    const { I } = inject();
    await I.usePlaywrightTo('stub passkey login action routes', async ({ page }) => {
        await page.route('**/action/passkey-start-authentication', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            startAuthenticationCount += 1;
            // Some callers (e.g. checkout contact-info, where a slower passwordless-email
            // round trip must open the sign-in modal before this ceremony resolves) need the
            // ceremony delayed so it doesn't race ahead of that other, unstubbed-timing flow.
            if (startDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, startDelayMs));
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, publicKey: buildPublicKeyRequestOptions(rpId) }),
            });
        });

        await page.route('**/action/passkey-finish-authentication', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            if (finishOutcome === 'serverError') {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false }),
                });
                return;
            }
            if (finishOutcome === 'rejected') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    tokenResponse: buildStubTokenResponse(),
                    ...(wishlistMerge ? { wishlistMerge } : {}),
                }),
            });
        });
    });
}

/** Drop both stubs so the real server actions run again. */
export async function clearPasskeyLoginStub(): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('clear passkey login stubs', async ({ page }) => {
        await page.unroute('**/action/passkey-start-authentication');
        await page.unroute('**/action/passkey-finish-authentication');
    });
}
