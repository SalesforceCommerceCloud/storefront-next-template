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

import {
    addVirtualAuthenticator,
    addResidentCredential,
    removeVirtualAuthenticator,
    simulateWebAuthnUnsupported,
    restoreWebAuthnSupport,
} from '../utils/webauthn-utils';
import {
    stubPasskeyLogin,
    clearPasskeyLoginStub,
    getPasskeyStartAuthenticationCount,
} from '../utils/passkey-login-stub';
import { getStorefrontOrigin } from '../utils/cookie-utils';

/**
 * Drives a passkey login (WebAuthn conditional mediation) end to end using a CDP
 * virtual authenticator seeded with a resident credential (real WebAuthn ceremony,
 * fake authenticator hardware) and a network stub for the two authentication
 * action routes (real SLAS authentication isn't testable in this environment —
 * see `passkey-login-stub.ts`). This only verifies client-side wiring: that a
 * resolved conditional-mediation assertion drives the expected redirect/UI
 * behavior, not that the credential is cryptographically valid against SLAS.
 */
class PasskeyLoginFlow {
    /**
     * Sets up the virtual authenticator (with a seeded resident credential) and
     * the action-route stubs. Call before triggering conditional mediation
     * (on mount for `/login`, on email blur for checkout contact-info).
     *
     * Edge-case knobs (all default to the happy path):
     * - `userVerified: false` — the authenticator can't satisfy the required user
     *   verification, so `navigator.credentials.get()` rejects with `NotAllowedError`.
     *   Models a shopper who dismisses/cancels the native passkey sheet.
     * - `finishOutcome` — makes the finish-authentication round trip fail (server
     *   error or explicit rejection) after an otherwise-valid ceremony.
     */
    async setup(
        opts: {
            wishlistMerge?: 'success' | 'partial';
            startDelayMs?: number;
            userVerified?: boolean;
            finishOutcome?: 'success' | 'serverError' | 'rejected';
        } = {}
    ): Promise<void> {
        const rpId = new URL(getStorefrontOrigin()).hostname;
        await addVirtualAuthenticator({ isUserVerified: opts.userVerified });
        await addResidentCredential(rpId);
        await stubPasskeyLogin({
            rpId,
            wishlistMerge: opts.wishlistMerge,
            startDelayMs: opts.startDelayMs,
            finishOutcome: opts.finishOutcome,
        });
    }

    /**
     * Sets up only the action-route stubs, with no virtual authenticator, and strips
     * `window.PublicKeyCredential` from the browser so the storefront looks like a
     * browser without WebAuthn support. `usePasskeyLogin` short-circuits on that
     * feature-detection check before it ever calls `start-authentication`, so no
     * ceremony is attempted. The stubs are still installed so the test can assert
     * the start-authentication route is never hit.
     */
    async setupUnsupported(): Promise<void> {
        const rpId = new URL(getStorefrontOrigin()).hostname;
        await simulateWebAuthnUnsupported();
        await stubPasskeyLogin({ rpId });
    }

    /**
     * How many times the passkey ceremony was kicked off (POSTs to
     * `start-authentication`) since the last `setup*()`. The unsupported-browser
     * scenario asserts this stays 0 — the hook bails on feature detection before
     * any network call.
     */
    startAuthenticationCount(): number {
        return getPasskeyStartAuthenticationCount();
    }

    /** Tears down the stub, virtual authenticator, and any WebAuthn-support override. */
    async teardown(): Promise<void> {
        await clearPasskeyLoginStub();
        await removeVirtualAuthenticator();
        await restoreWebAuthnSupport();
    }
}

export = new PasskeyLoginFlow();
