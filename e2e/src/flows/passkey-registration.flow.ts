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

const { I, passkeyRegistrationPage } = inject();
import { addVirtualAuthenticator, removeVirtualAuthenticator } from '../utils/webauthn-utils';
import {
    stubPasskeyRegistration,
    clearPasskeyRegistrationStub,
    stubPasskeyStatus,
    clearPasskeyStatusStub,
    STUB_OTP_CODE,
    STUB_PASSKEY_NAME,
} from '../utils/passkey-registration-stub';
import { getStorefrontOrigin } from '../utils/cookie-utils';

/**
 * Drives a registered shopper through the passkey upsell toast → OTP entry →
 * WebAuthn ceremony → finish sequence end to end, using a CDP virtual
 * authenticator (real WebAuthn ceremony, fake authenticator hardware) and a
 * network stub for the OTP-gated action routes (real OTP delivery isn't
 * testable in this environment — see `passkey-registration-stub.ts`).
 */
class PasskeyRegistrationFlow {
    /**
     * Sets up the virtual authenticator and network stubs for `email`.
     * Call before triggering the upsell toast or opening the modal.
     *
     * Stubs `/resource/passkey-status` to report the shopper has no passkey so the
     * upsell toast fires deterministically — see `stubPasskeyStatus()` for why the
     * real loader can't be relied on against the MRT staging SLAS tenant.
     *
     * Also clears the upsell toast's `passkeyUpsellShown` sessionStorage guard
     * (see `PASSKEY_UPSELL_SHOWN_KEY` in `use-passkey-registration.ts`). API-based
     * setup flows (`apiSignupFlow`, `registeredShopperSetupFlow`) already land on
     * the site root once via `injectAndActivateRegisteredSession`'s cookie-settle
     * navigation — for a registered shopper with no passkeys, that mount fires the
     * toast and burns the once-per-session guard before the test's own navigation
     * ever runs, even though a real user only sees one navigation (their actual
     * signup-form redirect). Without this reset, `waitForUpsellToast()` never sees
     * the toast at all.
     */
    async setup(email: string): Promise<void> {
        const rpId = new URL(getStorefrontOrigin()).hostname;
        await addVirtualAuthenticator();
        await stubPasskeyRegistration({ rpId, email });
        await stubPasskeyStatus();
        await I.usePlaywrightTo('reset passkey upsell sessionStorage guard', async ({ page }) => {
            await page.evaluate(() => sessionStorage.removeItem('passkeyUpsellShown'));
        });
    }

    /** Tears down the stubs and virtual authenticator. Call in scenario cleanup. */
    async teardown(): Promise<void> {
        await clearPasskeyRegistrationStub();
        await clearPasskeyStatusStub();
        await removeVirtualAuthenticator();
    }

    /**
     * Completes the name + OTP + WebAuthn steps once the registration modal is open
     * (i.e. after clicking the upsell toast's action button). The modal always opens
     * on the name step, so a nickname must be entered and confirmed before the OTP
     * step even renders. The modal auto-submits once all OTP slots are filled, so
     * this only needs to type the stubbed code — no explicit submit action exists.
     */
    async completeRegistration(): Promise<void> {
        passkeyRegistrationPage.enterPasskeyNameAndContinue(STUB_PASSKEY_NAME);
        I.waitForElement(passkeyRegistrationPage.locators.otpInputs, 10);
        await passkeyRegistrationPage.enterOtp(STUB_OTP_CODE);
    }

    /**
     * Waits for the passkey upsell toast to appear. The toast only fires after
     * the `passkeyStatus` fetcher resolves, so callers must wait for it rather
     * than checking visibility immediately after navigation.
     */
    async waitForUpsellToast(): Promise<void> {
        await I.waitForElement(passkeyRegistrationPage.locators.upsellToast, 15);
    }

    /**
     * Waits for the passkey success toast to appear after registration finishes.
     * The WebAuthn ceremony + finish request are async, so callers must wait for
     * it rather than checking visibility immediately after `completeRegistration()`.
     */
    async waitForSuccessToast(): Promise<void> {
        I.waitForElement(passkeyRegistrationPage.locators.successToast, 10);
    }

    /**
     * Waits for the upsell toast to disappear. Logging out is a client-side `<Form>`
     * navigation — the auth state only flips once the root loader revalidates after the
     * redirect resolves, so callers must wait for it rather than checking visibility
     * immediately after triggering logout.
     *
     * Default timeout is deliberately short (well under the toast's own 8s `duration`) —
     * a caller asserting dismissal-on-logout must rule out the toast simply expiring on
     * its own. If this times out, the toast is still visible for a reason unrelated to
     * its natural duration.
     */
    async waitForUpsellToastDismissed(timeoutSeconds: number = 3): Promise<void> {
        I.waitForInvisible(passkeyRegistrationPage.locators.upsellToast, timeoutSeconds);
    }

    /**
     * Full sequence: open the upsell toast's modal and complete registration.
     * Assumes `setup()` already ran; waits for the upsell toast itself before
     * clicking its action button.
     */
    async executeFromUpsellToast(): Promise<void> {
        await this.waitForUpsellToast();
        passkeyRegistrationPage.clickUpsellToastAction();
        I.waitForElement(passkeyRegistrationPage.locators.modal, 10);
        await this.completeRegistration();
    }
}

export = new PasskeyRegistrationFlow();
