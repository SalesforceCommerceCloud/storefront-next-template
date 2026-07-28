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
 * Stubbed-ceremony smoke test for WebAuthn passkey login (conditional mediation)
 * on the login page and checkout contact-info. A CDP virtual authenticator seeded
 * with a resident credential resolves a real `navigator.credentials.get({mediation:
 * 'conditional'})` call in the browser; the two server-side action routes are
 * network-stubbed since finishing a real SLAS authentication has no test-bypass
 * (see `passkey-login-stub.ts`). This verifies client-side wiring only — the
 * redirect-on-success behavior and checkout revalidation — not real authentication.
 */

Feature('Passkey Login').tag('@core').tag('@passkeys');

const { storefrontPage, loginPage, checkoutPage, apiCartSetupFlow, passkeyLoginFlow } = inject();
import { expect } from 'chai';
import { TEST_PRODUCT_CATEGORIES, generateTestEmail } from '../../test-data/checkout.data';
import { stubLoginPrefs, clearLoginPrefsStub } from '../../utils/login-prefs-stub';

After(async () => {
    await passkeyLoginFlow.teardown();
});

Scenario('Conditional mediation on login page resolves and redirects away from /login', async () => {
    await passkeyLoginFlow.setup();

    // No `loginPage.validatePageLoaded()` here — its `waitInUrl('/login', ...)` check can
    // lose the race against the passkey redirect. The virtual authenticator's
    // `automaticPresenceSimulation` resolves conditional mediation fast enough that the
    // client-side `navigate()` away from /login can already have happened by the time
    // that check runs.
    loginPage.navigate();
    await storefrontPage.handleTrackingConsent(true);

    await loginPage.waitForRedirectAwayFromLogin(10);

    const currentUrl = await loginPage.getCurrentUrl();
    expect(currentUrl, 'Should navigate away from /login after passkey login resolves').to.not.include('/login');
})
    .tag('@login')
    .tag('@smoke');

Scenario('Conditional mediation on login page surfaces a wishlist-merge toast on success', async () => {
    await passkeyLoginFlow.setup({ wishlistMerge: 'success' });

    // See the previous scenario for why `validatePageLoaded()` is intentionally skipped.
    loginPage.navigate();
    await storefrontPage.handleTrackingConsent(true);

    await loginPage.waitForRedirectAwayFromLogin(10);

    // Asserting on the `wishlistMerge` query param itself is racy: `WishlistMergeToast`
    // (mounted in the app shell) strips it via a client-side `navigate({replace: true})`
    // immediately after reading it, so the param is only present for a moment. The toast
    // it renders first is the durable, product-intended signal that the merge succeeded.
    const toastAppeared = loginPage.waitForWishlistMergeToast(10);
    expect(toastAppeared, 'Wishlist merge toast should appear after a passkey login that merged a guest wishlist').to.be
        .true;
})
    .tag('@login')
    .tag('@regression');

Scenario(
    'Conditional mediation on checkout contact-info email blur dismisses the sign-in modal opened for the same blur',
    async () => {
        // Stubs the passwordless-email BFF to open the sign-in modal on blur — this is the
        // documented race handlePasskeyLoginSuccess guards against: its own email input also
        // carries autoComplete="username webauthn", so the conditional mediation suggestion
        // can resolve while this modal is open, and both must be dismissed together. The
        // passkey ceremony is delayed so it resolves after (not before) the modal has had a
        // chance to open — both stubbed network calls fire in parallel from the same blur,
        // and the passkey one otherwise resolves near-instantly (virtual authenticator
        // automatic presence simulation), closing a modal that was never open yet.
        const registeredEmail = generateTestEmail('registered-passkey');
        await stubLoginPrefs({ branch: 'loginModal', email: registeredEmail });
        await passkeyLoginFlow.setup({ startDelayMs: 1500 });

        const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
        expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

        checkoutPage.validatePageLoaded();

        await checkoutPage.fillContactInfoForPasswordless(registeredEmail, '5551234567');

        const modalAppeared = checkoutPage.waitForLoginModal(10);
        expect(modalAppeared, 'Sign-in modal should appear after email blur').to.be.true;

        checkoutPage.waitForLoginModalClosed(10);

        const modalStillVisible = await checkoutPage.isLoginModalVisible();
        expect(modalStillVisible, 'Sign-in modal should close once passkey login resolves').to.be.false;

        await clearLoginPrefsStub();
    }
)
    .tag('@checkout')
    .tag('@regression');

Scenario(
    'Conditional mediation on checkout contact-info email blur dismisses the passwordless OTP modal opened for the same blur',
    async () => {
        // Same race as the sign-in-modal scenario above, but for the other branch
        // handlePasskeyLoginSuccess guards: a passwordless-registered email opens the OTP
        // modal instead of the sign-in modal. The passkey ceremony is delayed for the same
        // reason — so it resolves after the OTP modal has had a chance to open, not before.
        const registeredEmail = generateTestEmail('registered-passkey-otp');
        await stubLoginPrefs({ branch: 'otp', email: registeredEmail });
        await passkeyLoginFlow.setup({ startDelayMs: 1500 });

        const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
        expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

        checkoutPage.validatePageLoaded();

        await checkoutPage.fillContactInfoForPasswordless(registeredEmail, '5551234567');

        const modalAppeared = checkoutPage.waitForPasswordlessOtpModal(10);
        expect(modalAppeared, 'Passwordless OTP modal should appear after email blur').to.be.true;

        await checkoutPage.waitForPasswordlessOtpModalClosed(10);

        const modalStillVisible = await checkoutPage.isPasswordlessOtpModalVisible();
        expect(modalStillVisible, 'Passwordless OTP modal should close once passkey login resolves').to.be.false;

        await clearLoginPrefsStub();
    }
)
    .tag('@checkout')
    .tag('@regression');

// ---------------------------------------------------------------------------
// Edge cases: the non-happy paths on the login page. Passkey login is a silent,
// best-effort enhancement — a dismissed prompt, a server-rejected assertion, or
// a browser without WebAuthn must all leave the shopper on /login with no error
// and the password form still usable. These assert the ABSENCE of a redirect,
// the inverse of the smoke scenario above.
// ---------------------------------------------------------------------------

Scenario('Dismissed passkey prompt on login page leaves the shopper on /login with the form intact', async () => {
    // `userVerified: false` — the virtual authenticator can no longer satisfy the
    // `userVerification: 'required'` the ceremony requests, so
    // `navigator.credentials.get()` rejects with NotAllowedError. That's the same
    // signal the browser raises when a shopper closes the native passkey sheet or
    // fails the biometric check, which `usePasskeyLogin` swallows as a no-op.
    await passkeyLoginFlow.setup({ userVerified: false });

    loginPage.navigate();
    await storefrontPage.handleTrackingConsent(true);

    const stayed = await loginPage.staysOnLogin(3);
    expect(stayed, 'A dismissed passkey prompt should not redirect away from /login').to.be.true;

    // The password form must remain usable so the shopper can just sign in normally.
    loginPage.validatePageLoaded();
})
    .tag('@login')
    .tag('@regression');

Scenario('Server-rejected passkey assertion on login page leaves the shopper on /login with no error', async () => {
    // The ceremony completes and produces a valid assertion, but finish-authentication
    // comes back rejected — modeling a real SLAS authentication failure (credential
    // unknown to SLAS, expired challenge, etc.). `usePasskeyLogin` treats a non-ok /
    // unsuccessful finish as a silent no-op: no redirect, no surfaced error.
    await passkeyLoginFlow.setup({ finishOutcome: 'rejected' });

    loginPage.navigate();
    await storefrontPage.handleTrackingConsent(true);

    const stayed = await loginPage.staysOnLogin(3);
    expect(stayed, 'A server-rejected passkey login should not redirect away from /login').to.be.true;

    const hasError = await loginPage.hasValidationError();
    expect(hasError, 'A failed passkey login should not surface a form error toast/message').to.be.false;

    loginPage.validatePageLoaded();
})
    .tag('@login')
    .tag('@regression');

Scenario('Login page on a browser without WebAuthn never starts a passkey ceremony', async () => {
    // `window.PublicKeyCredential` is stripped before any page script runs, so the
    // storefront looks like a non-WebAuthn browser. `usePasskeyLogin` short-circuits
    // on feature detection before it ever calls start-authentication — so the
    // ceremony count must stay 0 and the login page must render normally.
    await passkeyLoginFlow.setupUnsupported();

    loginPage.navigate();
    await storefrontPage.handleTrackingConsent(true);

    // The page must render its normal password form — nothing about the passkey
    // enhancement should block or alter first paint on an unsupported browser.
    loginPage.validatePageLoaded();

    const stayed = await loginPage.staysOnLogin(3);
    expect(stayed, 'A browser without WebAuthn should not trigger a passkey redirect').to.be.true;

    expect(
        passkeyLoginFlow.startAuthenticationCount(),
        'No passkey ceremony should be started when WebAuthn is unavailable'
    ).to.equal(0);
})
    .tag('@login')
    .tag('@regression');

export {};
