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

Feature('Reset Password').tag('@core').tag('@auth');

// The Before hook now uses apiSignupFlow (SCAPI register + cookie injection)
// instead of the UI signup form, so the magic-link scenario's setup no longer
// flakes (cc-nx_ cookie timeout / "Last Name Input" disappearing mid-form).
//
// "User can request password reset" depends on SLAS environment state that is
// NOT version-controlled here. It asserts the "Check Your Email" heading, which
// only renders after POST /password/reset succeeds. That request can fail for
// several environment-side reasons, all surfacing as the heading never showing:
//   - Monthly password-reset email quota exhausted (resetPassword.mode='email'
//     has SLAS send the email itself, which is metered) → FEATURE_UNAVAILABLE.
//   - SLAS client's callback_uri not registered / doesn't match the test origin
//     → FEATURE_UNAVAILABLE.
//   - SLAS client missing password-reset Site Configuration (e.g. Domain
//     Identity) in the SLAS Admin UI.
// If this starts failing on "Check Your Email", check the SLAS Admin UI client
// (Clients > select client id > Site Configuration) before looking for a code
// cause. See the skip note on the scenario below for the currently-suspected
// cause and how to restore it.
const { storefrontPage, forgotPasswordPage, resetPasswordPage, apiSignupFlow } = inject();
import { expect } from 'chai';

/**
 * Spec-scoped account credentials, lazily created on the first scenario.
 * Keeping these in module-level variables (not the shared credential file)
 * ensures this worker's account is never touched by other parallel workers.
 */
let specEmail = '';

/**
 * Before hook: on the first scenario, create a dedicated account via signup.
 * On every subsequent scenario, clear cookies and re-login with stored creds.
 * This ensures the tests avoid hitting the password reset limit for a shopper's email.
 */
Before(async () => {
    if (!specEmail) {
        await storefrontPage.clearCookies();
        const { signupData } = await apiSignupFlow.execute();
        specEmail = signupData.email;
    }
});

// Skipped: SLAS client c9c45bfd-0ed3-4aa2-9971-40f88962b836 monthly
// password-reset email quota exhausted (resetPassword.mode='email' → SLAS sends
// the email itself, which is metered). SLAS returns FEATURE_UNAVAILABLE on
// POST /password/reset, so the "Check Your Email" heading never renders. Runs in
// e2e-template-pr and e2e-template-nightly (@core). Restore (.skip → Scenario)
// once the client quota is raised/reset.
Scenario.skip('User can request password reset', () => {
    // Navigate to the forgot password page
    forgotPasswordPage.navigate();

    // Verify the "Reset Password" heading is displayed
    forgotPasswordPage.validateResetPasswordHeading();

    // Enter email address
    forgotPasswordPage.enterEmail(specEmail);

    // Submit the form
    forgotPasswordPage.submitForm();

    // Verify "Check your email" heading is displayed after submission
    forgotPasswordPage.validateCheckEmailHeading();
})
    .tag('@reset-password')
    .tag('@forgot-password-form');

Scenario('User can reset password using magic link', async () => {
    // Test data
    const testToken = '12345678';
    const testPassword = 'NewSecureP@ssw0rd!';

    // Navigate to reset password page with token and email
    resetPasswordPage.navigate(testToken, specEmail);

    // Dismiss cookie/consent dialog first so heading is visible, then verify heading
    await resetPasswordPage.dismissCookieDialog();
    resetPasswordPage.validateResetPasswordHeading();

    // Capture the reset-password request sent when we submit the form
    const resetPasswordRequest = await resetPasswordPage.captureResetPasswordRequestWhile(() => {
        resetPasswordPage.enterPassword(testPassword);
        resetPasswordPage.enterConfirmPassword(testPassword);
        resetPasswordPage.submitForm();
    });

    // Verify request details
    expect(resetPasswordRequest.method, 'Request method should be POST').to.equal('POST');
    expect(resetPasswordRequest.url, 'Request URL should include /reset-password.data').to.include(
        '/reset-password.data'
    );

    // Verify request payload
    const params = new URLSearchParams(resetPasswordRequest.postData ?? '');
    expect(params.get('token'), 'Request should include token').to.equal(testToken);
    expect(params.get('email'), 'Request should include email').to.equal(specEmail);
    expect(params.get('newPassword'), 'Request should include password').to.equal(testPassword);
    expect(params.get('confirmPassword'), 'Request should include confirm password').to.equal(testPassword);
})
    .tag('@reset-password')
    .tag('@reset-password-form');

export {};
