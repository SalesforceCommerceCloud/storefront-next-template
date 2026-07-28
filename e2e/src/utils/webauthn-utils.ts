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
 * Simulates a WebAuthn platform authenticator via the Chrome DevTools Protocol
 * `WebAuthn` domain, so `navigator.credentials.create()` resolves with a real,
 * spec-shaped credential in a genuine Chromium context instead of a real
 * hardware/platform authenticator. Used by the passkey registration E2E test.
 */

const { I } = inject();

let authenticatorId: string | undefined;

/**
 * Enables the CDP `WebAuthn` domain on the current page's session and adds a
 * virtual authenticator that supports resident keys and user verification —
 * matching the settings the passkey registration flow requests from SLAS
 * (`publicKey.authenticatorSelection`). Call before triggering
 * `navigator.credentials.create()`.
 *
 * `isUserVerified` defaults to `true` (the authenticator auto-satisfies the
 * `userVerification: 'required'` the flows request). Pass `false` to model a
 * shopper who dismisses/fails the biometric prompt: the authenticator can no
 * longer satisfy required UV, so `navigator.credentials.get()` rejects with
 * `NotAllowedError` — the same signal the browser surfaces when a shopper
 * cancels the native passkey sheet.
 */
export async function addVirtualAuthenticator(opts: { isUserVerified?: boolean } = {}): Promise<void> {
    const { isUserVerified = true } = opts;
    await I.usePlaywrightTo('add WebAuthn virtual authenticator', async ({ page }) => {
        const client = await page.context().newCDPSession(page);
        await client.send('WebAuthn.enable');
        const { authenticatorId: id } = await client.send('WebAuthn.addVirtualAuthenticator', {
            options: {
                protocol: 'ctap2',
                transport: 'internal',
                hasResidentKey: true,
                hasUserVerification: true,
                isUserVerified,
                automaticPresenceSimulation: true,
            },
        });
        authenticatorId = id;
    });
}

/**
 * Removes the virtual authenticator added by `addVirtualAuthenticator()`. Call
 * during test teardown so subsequent scenarios in the same worker don't reuse
 * a stale authenticator/credential from a prior test.
 */
export async function removeVirtualAuthenticator(): Promise<void> {
    if (!authenticatorId) return;
    const idToRemove = authenticatorId;
    authenticatorId = undefined;
    await I.usePlaywrightTo('remove WebAuthn virtual authenticator', async ({ page }) => {
        const client = await page.context().newCDPSession(page);
        await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: idToRemove });
    });
}

/**
 * Seeds a resident (discoverable) credential into the authenticator added by
 * `addVirtualAuthenticator()`, using the same tracked `authenticatorId`. Needed
 * to test login-only flows (conditional mediation) that have no create-first
 * step to seed a credential organically — unlike registration, where the
 * `create()` ceremony itself adds the credential to the authenticator.
 *
 * The credential's private key is only used by the virtual authenticator to
 * sign the assertion in-browser; nothing here talks to a real server, so any
 * valid P-256 key works.
 */
export async function addResidentCredential(
    rpId: string,
    identity: { userHandle: string; credentialId: string } = { userHandle: 'e2e-user', credentialId: 'e2e-credential' }
): Promise<{ credentialId: string }> {
    if (!authenticatorId) throw new Error('addVirtualAuthenticator() must be called first');
    const id = authenticatorId;
    const crypto = await import('node:crypto');
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
    // CDP's WebAuthn.addCredential binary fields are standard base64, not base64url.
    const privateKeyB64 = Buffer.from(pkcs8).toString('base64');
    const userHandle = Buffer.from(identity.userHandle).toString('base64');
    const credentialId = Buffer.from(identity.credentialId).toString('base64');

    await I.usePlaywrightTo('seed resident credential into virtual authenticator', async ({ page }) => {
        const client = await page.context().newCDPSession(page);
        await client.send('WebAuthn.enable');
        await client.send('WebAuthn.addCredential', {
            authenticatorId: id,
            credential: {
                credentialId,
                isResidentCredential: true,
                rpId,
                privateKey: privateKeyB64,
                signCount: 0,
                userHandle,
            },
        });
    });

    return { credentialId };
}

/**
 * Simulates a browser without WebAuthn support by deleting `window.PublicKeyCredential`
 * before any page script runs, on every navigation in the current context. This is the
 * feature-detection gate `usePasskeyLogin` checks first — with it gone, the hook returns
 * before making any network call, so no passkey ceremony is attempted at all.
 *
 * The init script is registered on the browser context, so it persists across navigations
 * within a scenario. Call `restoreWebAuthnSupport()` in teardown so it doesn't leak into
 * later scenarios sharing the same worker's context.
 */
export async function simulateWebAuthnUnsupported(): Promise<void> {
    await I.usePlaywrightTo('remove WebAuthn support from the browser', async ({ browserContext }) => {
        // Registered on the context, so it runs before page scripts on the next navigation.
        // Callers install this before navigating, so the login page loads WebAuthn-free.
        await browserContext.addInitScript(() => {
            // Deleting the constructor makes `typeof window.PublicKeyCredential === 'undefined'`,
            // exactly what a non-WebAuthn browser presents.
            // @ts-expect-error deleting a known-optional global for the test
            delete window.PublicKeyCredential;
        });
    });
}

/**
 * Best-effort clear of the init script added by `simulateWebAuthnUnsupported()`.
 *
 * Primary isolation comes from CodeceptJS's default restart strategy (`restart: false`
 * → a fresh browser context per scenario), which discards context-level init scripts
 * anyway, so a stripped `PublicKeyCredential` can't leak into the next scenario. This
 * additionally calls `clearInitScripts()` when the running Playwright exposes it
 * (>=1.60), for cases where a spec opts into a shared session; on 1.58 it's a no-op.
 */
export async function restoreWebAuthnSupport(): Promise<void> {
    await I.usePlaywrightTo('restore WebAuthn support in the browser', async ({ browserContext }) => {
        const ctx = browserContext as { clearInitScripts?: () => Promise<void> };
        if (typeof ctx.clearInitScripts === 'function') {
            await ctx.clearInitScripts();
        }
    });
}
