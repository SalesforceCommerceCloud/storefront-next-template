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
// "User can request password reset" depends on SLAS environment state. It
// asserts the "Check Your Email" heading, which only renders after the reset
// request to SLAS succeeds. That request can fail for several environment-side
// reasons, all surfacing as the heading never showing:
//   - Too many reset emails sent at once, exceeding the email provider's
//     rate/concurrency limits so the send is refused. This is why the scenario
//     is @nightly-only (below): running it on every PR triggers many concurrent
//     sends.
//   - Password-reset email quota exhausted (when resetPassword.mode='email',
//     SLAS sends the metered email itself) → FEATURE_UNAVAILABLE.
//   - The SLAS client's callback_uri is not registered / doesn't match the
//     request origin → FEATURE_UNAVAILABLE.
//   - The SLAS client is missing password-reset Site Configuration in the SLAS
//     Admin UI (e.g. the Domain Identity is not set).
// This stability depends on SLAS environment state that isn't version-controlled
// here, so a client-config regression flakes the scenario with no code-level
// signal. If it starts failing on "Check Your Email", check the SLAS client's
// Site Configuration (Clients > select client id > Site Configuration > Domain
// Identity) and the email-send path before looking for a code cause.
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

// @nightly-only: sends a real reset email, so it runs on a schedule rather than
// on every PR to stay within the email provider's limits. See the header
// comment above for details.
Scenario('User can request password reset', () => {
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
    .tag('@forgot-password-form')
    .tag('@nightly-only');

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
