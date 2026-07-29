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
 * Per-scenario stub for the three passkey-registration action routes
 * (`/action/passkey-authorize-registration`, `/action/passkey-start-registration`,
 * `/action/passkey-finish-registration`). The real flow requires a SLAS-issued
 * OTP delivered by email with no test-bypass (see `auth.server.ts`), and this
 * e2e package has no mailbox-reading utility — so these routes are intercepted
 * at the Playwright network layer instead. Unlike `login-prefs-stub.ts`'s
 * target, these routes return plain `Response.json(...)` (not React Router's
 * single-fetch turbo-stream format), so a plain JSON body is fulfilled here.
 *
 * The stubbed `start-registration` response supplies real WebAuthn creation
 * options so `navigator.credentials.create()` still runs for real in the
 * browser, backed by the CDP virtual authenticator from `webauthn-utils.ts`.
 * Only the server round-trip (which would otherwise require a genuine
 * `pwdActionToken`) is faked.
 */

import type { Route, Request } from 'playwright';

const { I } = inject();

/** Any 6-digit string works as the OTP the test types — the server call is stubbed. */
export const STUB_OTP_CODE = '123456';

/** Name typed into the modal's name step before advancing to OTP entry. */
export const STUB_PASSKEY_NAME = 'E2E Test Passkey';

/** Base64url-encode a UTF-8 string, matching the format SLAS/WebAuthn use for `user.id` and `challenge`. */
function toBase64Url(input: string): string {
    return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildPublicKeyCreationOptions(rpId: string, email: string): Record<string, unknown> {
    return {
        rp: { id: rpId, name: 'Storefront' },
        user: { id: toBase64Url(email), name: email, displayName: email },
        challenge: toBase64Url(`challenge-${email}`),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
            authenticatorAttachment: 'platform',
        },
    };
}

/**
 * Install route handlers for all three passkey-registration action routes.
 * `rpId` should match the storefront's hostname (e.g. `new URL(BASE_URL).hostname`)
 * since WebAuthn requires `rp.id` to equal the current origin's hostname (or a
 * registrable parent domain).
 */
export async function stubPasskeyRegistration(opts: { rpId: string; email: string }): Promise<void> {
    const { rpId, email } = opts;
    await I.usePlaywrightTo('stub passkey registration action routes', async ({ page }) => {
        await page.route('**/action/passkey-authorize-registration', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        });

        await page.route('**/action/passkey-start-registration', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, publicKey: buildPublicKeyCreationOptions(rpId, email) }),
            });
        });

        await page.route('**/action/passkey-finish-registration', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        });
    });
}

/** Drop all three stubs so the real server actions run again. */
export async function clearPasskeyRegistrationStub(): Promise<void> {
    await I.usePlaywrightTo('clear passkey registration stubs', async ({ page }) => {
        await page.unroute('**/action/passkey-authorize-registration');
        await page.unroute('**/action/passkey-start-registration');
        await page.unroute('**/action/passkey-finish-registration');
    });
}

/**
 * Stub the `/resource/passkey-status` loader to report the shopper has no passkey.
 *
 * The upsell hook reads status with a plain `fetch('/resource/passkey-status')` (a bare
 * GET, no `.data` suffix), and a resource route with only a loader returns plain JSON via
 * `Response.json(...)` — so this fulfils a plain `{ hasPasskey: false }` body. The glob is
 * anchored to the exact path end (`**\/resource/passkey-status`, no trailing segment) so it
 * matches the bare GET without also swallowing unrelated URLs that merely contain the path.
 *
 * Why stub it at all: this loader calls SLAS `getPasskeyUser` against the live backend.
 * A brand-new shopper should get a 404 there (→ `{hasPasskey: false}`), but the MRT
 * staging SLAS tenant returns a non-404 error, which the loader maps to
 * `{hasPasskey: false, error: true}` — and the upsell hook deliberately suppresses the
 * toast whenever `error` is set. Stubbing a clean `{hasPasskey: false}` keeps the test
 * asserting the storefront's upsell UI instead of the staging tenant's SLAS provisioning.
 * The loader's own error/404 mapping is covered by `resource.passkey-status.test.ts`.
 */
const PASSKEY_STATUS_GLOB = '**/resource/passkey-status';

export async function stubPasskeyStatus(): Promise<void> {
    await I.usePlaywrightTo('stub passkey-status resource route', async ({ page }) => {
        await page.route(PASSKEY_STATUS_GLOB, async (route: Route, request: Request) => {
            if (request.method() !== 'GET') {
                await route.continue();
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ hasPasskey: false }),
            });
        });
    });
}

/** Drop the passkey-status stub so the real resource loader runs again. */
export async function clearPasskeyStatusStub(): Promise<void> {
    await I.usePlaywrightTo('clear passkey-status resource stub', async ({ page }) => {
        await page.unroute(PASSKEY_STATUS_GLOB);
    });
}
