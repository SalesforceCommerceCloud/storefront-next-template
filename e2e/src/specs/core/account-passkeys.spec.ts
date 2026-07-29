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
 * Account Passkeys E2E Tests
 *
 * Test Coverage Analysis:
 * ------------------------
 * ✅ Unit Tests Already Cover:
 * - PasskeyCard: nickname rendering, unnamed-passkey fallback, delete button handler,
 *   created/last-used/uses metadata display and the "New" badge
 * - DeletePasskeyDialog: open/close, confirm/cancel callbacks, loading state
 * - PasskeysManagement: empty state, delete-one fetcher submission wiring, add-passkey opens
 *   the registration modal with the encoded user id (all mocked at the component boundary)
 * - PasskeyRegistrationModal: name step validation, nickname forwarded to start-registration
 *
 * ✅ E2E Tests Add Integration Value:
 * - Real authentication context (registered shopper session, account layout, navigation)
 * - Page load and routing to /account/passkeys, with the page chrome (heading + "Add Passkey")
 *   rendering independent of the deferred credential list
 * - "Add Passkey" entry point reaching the real registration modal on its name step
 * - Naming a passkey and advancing to the OTP step, gated by a real OTP-authorize server round-trip
 *
 * Note: the empty-state text lives inside the deferred credential list, whose load depends on the
 * SLAS passkey lookup succeeding for the test account against the live tenant. That's an
 * environment condition an integration test can't guarantee, so empty-state rendering is asserted
 * in the PasskeysManagement unit tests rather than here.
 *
 * ⚠️ Not Covered Here — Delete-one Against Real Data:
 * Registering a real passkey requires completing a live WebAuthn ceremony
 * (`navigator.credentials.create()`), which itself is gated by an emailed OTP code.
 * Neither a CDP virtual authenticator nor a test-inbox integration exists in this
 * repo yet, so there is no way to seed a real passkey credential on a test account.
 * The delete-one confirmation flow against real SCAPI data is left as a
 * follow-up once that seeding infrastructure exists; the client-side wiring is
 * covered by the PasskeysManagement unit tests referenced above.
 *
 * Test Strategy:
 * --------------
 * - Create a new test user for isolation (apiSignupFlow) — fresh accounts have no passkeys
 * - Desktop-only tests (mobile coverage can be added later)
 */

Feature('Account Passkeys Tests').tag('@core').tag('@account').tag('@passkeys');

const { accountPasskeysPage, apiLoginFlow, apiSignupFlow, storefrontPage } = inject();

/**
 * Spec-scoped account credentials, lazily created on the first scenario.
 * Using module-level variables (not a shared credential file) means this
 * account is private to this worker — no other parallel worker touches it.
 */
let specEmail = '';
let specPassword = '';

Before(async () => {
    if (!specEmail) {
        await storefrontPage.clearCookies();
        const { signupData } = await apiSignupFlow.execute();
        specEmail = signupData.email;
        specPassword = signupData.password;
    } else {
        await storefrontPage.clearCookies();
        await apiLoginFlow.execute({ email: specEmail, password: specPassword });
    }
});

/**
 * The passkeys page renders its chrome (heading + "Add Passkey" entry point) under a real
 * registered session, independent of the credential list. The empty-state text ("No Saved
 * Passkeys") is intentionally NOT asserted here: it lives inside the deferred list, which
 * depends on the SLAS passkey lookup succeeding for this account against the live test tenant —
 * an environment condition this integration test can't guarantee. Empty-state rendering is
 * covered deterministically by the PasskeysManagement unit tests (see the coverage note above).
 */
Scenario('Passkeys page loads with the Add Passkey entry point under a registered session', async () => {
    accountPasskeysPage.navigate();
    accountPasskeysPage.validatePageLoaded();
    accountPasskeysPage.validateAddPasskeyAvailable();
})
    .tag('@page-load')
    .tag('@empty-state');

Scenario('User can access passkeys page via direct URL', async () => {
    accountPasskeysPage.navigate('/account/passkeys');
    accountPasskeysPage.validatePageLoaded();
})
    .tag('@page-load')
    .tag('@direct-url');

/**
 * Clicking "Add Passkey" opens the shared registration modal on its "name your
 * passkey" step. Completing the OTP (and the WebAuthn ceremony it gates) requires
 * reading a real email — out of scope for E2E, matching the existing account-details
 * OTP-modal coverage pattern.
 */
Scenario('Clicking "Add Passkey" opens the registration modal on the name step', async () => {
    accountPasskeysPage.navigate();
    accountPasskeysPage.clickAddPasskey();
    accountPasskeysPage.validateRegistrationModalOpen();
    accountPasskeysPage.validateNameStepOpen();
})
    .tag('@add-passkey')
    .tag('@dialog-interaction');

/**
 * Naming the passkey and continuing advances the modal to the OTP step, which
 * fires the authorize-registration request. This is as far as E2E can go without
 * a real inbox to read the emailed code.
 */
Scenario('Naming a passkey advances to the OTP verification step', async () => {
    accountPasskeysPage.navigate();
    accountPasskeysPage.clickAddPasskey();
    accountPasskeysPage.enterPasskeyNameAndContinue('MacBook Pro');
    accountPasskeysPage.validateOtpStepOpen();
})
    .tag('@add-passkey')
    .tag('@dialog-interaction');

export {};
