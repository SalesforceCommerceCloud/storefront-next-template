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
 * Per-scenario stub for /action/authorize-passwordless-email. Lets tests pick
 * which checkout-login branch the UI takes (OTP, login modal, or guest)
 * without seeding `<siteId>-login-preferences` in the deployed data store.
 * Server-side branching is covered by action.authorize-passwordless-email.test.ts.
 */

import type { Route, Request } from 'playwright';
import { turboStreamEncode } from './turbo-stream';

/** Branch to render on email blur. */
export type LoginPrefsBranch = 'otp' | 'loginModal' | 'guest';

/** Install a Playwright route handler that fulfills the BFF response. */
export async function stubLoginPrefs(opts: { branch: LoginPrefsBranch; email?: string }): Promise<void> {
    const { branch } = opts;
    const { I } = inject();
    await I.usePlaywrightTo('stub authorize-passwordless-email response', async ({ page }) => {
        await page.route('**/action/authorize-passwordless-email*', async (route: Route, request: Request) => {
            if (request.method() !== 'POST') {
                await route.continue();
                return;
            }
            const email = opts.email ?? readEmailFromRequest(request) ?? 'stub@example.com';
            const body = encodeAuthorizePasswordlessEmailResponse(branch, email);
            await route.fulfill({
                status: 200,
                headers: {
                    'content-type': 'text/x-script; charset=utf-8',
                    'x-remix-response': 'yes',
                },
                body,
            });
        });
    });
}

/** Drop the stub so the real BFF runs again. */
export async function clearLoginPrefsStub(): Promise<void> {
    const { I } = inject();
    await I.usePlaywrightTo('clear authorize-passwordless-email stub', async ({ page }) => {
        await page.unroute('**/action/authorize-passwordless-email*');
    });
}

/**
 * Register a Before/After pair that stubs the BFF with the given branch for
 * every scenario in the calling spec file. Use in specs that fill checkout
 * contact info but don't themselves test passwordless behavior - the stub
 * keeps the email-blur fetcher from blocking on the real BFF.
 *
 * Defaults to the 'guest' branch (no modal opens), which is what most
 * non-passwordless checkout specs need.
 */
export function installLoginPrefsStubHooks(branch: LoginPrefsBranch = 'guest'): void {
    Before(async () => {
        await stubLoginPrefs({ branch });
    });
    After(async () => {
        await clearLoginPrefsStub();
    });
}

function readEmailFromRequest(request: Request): string | null {
    const postData = request.postData();
    if (!postData) return null;
    if (postData.includes('------')) {
        const match = postData.match(/name="email"\r?\n\r?\n([^\r\n]*)/);
        return match ? match[1] : null;
    }
    return new URLSearchParams(postData).get('email');
}

function encodeAuthorizePasswordlessEmailResponse(branch: LoginPrefsBranch, email: string): string {
    switch (branch) {
        case 'otp':
            return turboStreamEncode({ data: { success: true, email } });
        case 'loginModal':
            return turboStreamEncode({ data: { success: false, requiresLogin: true, email } });
        case 'guest':
            return turboStreamEncode({ data: { success: false, email } });
    }
}

/** Internal exports for unit tests. */
export const __TEST_ONLY__ = {
    encodeAuthorizePasswordlessEmailResponse,
};
