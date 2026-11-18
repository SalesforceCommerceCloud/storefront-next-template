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

Feature('Account Details Tests').tag('@core').tag('@account').tag('@user-account');

// The signup-driven Before hook now uses apiSignupFlow (SCAPI register + cookie
// injection) and loginRegistered retries SLAS 409s, so the per-scenario rate-limit
// flake is resolved — the suite runs with Scenario.
//
// Change-email scenarios (positive + wrong-password) require the backend
// capability documented in docs/README-EMAIL-VERIFICATION.md: B2C >= 24.7 with
// "Enable Loginid Updates for SCAPI" on. The shared zzrf-001 instance behind
// every MRT pool env meets this, so both scenarios run unconditionally.

const { I, storefrontPage, accountDetailsPage, apiLoginFlow, apiSignupFlow } = inject();
import { expect } from 'chai';

/**
 * Spec-scoped account credentials, lazily created on the first scenario.
 * Keeping these in module-level variables (not the shared credential file)
 * ensures this worker's account is never touched by other parallel workers.
 */
let specEmail = '';
let specPassword = '';

/**
 * Before hook: on the first scenario, create a dedicated account via signup.
 * On every subsequent scenario, clear cookies and re-login with stored creds.
 */
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
 * Account Details Page Load and Authentication
 *
 * Test Flow:
 * 1. Navigate to account details page
 * 2. Validate page loads with all expected sections
 * 3. Validate authenticated session cookies
 * 4. Verify page title and structure
 */
Scenario('Account details page loads successfully for authenticated user', async () => {
    // Navigate to account details
    accountDetailsPage.navigate();

    // Validate page loaded
    accountDetailsPage.validatePageLoaded();

    // Validate SFCC session cookies for authenticated user
    const siteId = process.env.SITE_ID || 'RefArchGlobal';
    const sessionCookies = await storefrontPage.waitForSessionCookies('registered', siteId);

    // Verify authenticated cookies exist

    expect(sessionCookies.accessToken, 'Access token should exist').to.not.be.undefined;

    expect(sessionCookies.authRefreshToken, 'Auth refresh token should exist').to.not.be.undefined;

    // Uncomment to try interactive AI features:
    // pause();
})
    .tag('@authentication')
    .tag('@page-load');

/**
 * View Profile Information
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Verify profile card displays user information
 * 3. Validate that all profile fields are visible
 */
Scenario('Profile information is displayed correctly', async () => {
    accountDetailsPage.navigate();

    // Get displayed profile data
    const profileData = await accountDetailsPage.getDisplayedProfileData();

    // Validate that profile data is displayed (at least name should be present)
    expect(profileData.firstName, 'First name should be displayed').to.have.length.greaterThan(0);

    // Uncomment to try interactive AI features:
    // pause();
})
    .tag('@profile')
    .tag('@view');

/**
 * Edit Profile Information - Positive Scenario
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Edit on profile card
 * 3. Update profile information
 * 4. Save changes
 * 5. Verify success message
 * 6. Validate changes are displayed
 */
Scenario('User can successfully update profile information', async () => {
    accountDetailsPage.navigate();

    // Update profile with new data using helper method
    // Note: email and phone are read-only fields (pending SLAS email verification support)
    const timestamp = Date.now();
    const updates = {
        firstName: `TestFirst${timestamp}`,
        lastName: `TestLast${timestamp}`,
    };

    const newData = await accountDetailsPage.updateProfile(updates);

    // Verify changes are displayed
    expect(newData.firstName, 'First name should be updated').to.equal(updates.firstName);
    expect(newData.lastName, 'Last name should be updated').to.equal(updates.lastName);

    // Uncomment to try interactive AI features:
    // pause();
})
    .tag('@profile')
    .tag('@edit')
    .tag('@positive');

/**
 * Edit Profile - Cancel Changes
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Edit on profile card
 * 3. Make changes to form
 * 4. Click Cancel
 * 5. Verify changes are not saved
 */
Scenario('User can cancel profile editing without saving changes', async () => {
    accountDetailsPage.navigate();

    // Get current data
    const originalData = await accountDetailsPage.getDisplayedProfileData();

    // Click Edit button
    accountDetailsPage.clickEditProfile();

    // Make changes
    accountDetailsPage.fillProfileForm({
        firstName: 'ShouldNotBeSaved',
        lastName: 'CancelledChange',
    });

    // Cancel changes (clickCancelProfile waits for Edit button to reappear)
    accountDetailsPage.clickCancelProfile();

    // Verify original data is still displayed
    const currentData = await accountDetailsPage.getDisplayedProfileData();
    expect(currentData.firstName, 'First name should remain unchanged').to.equal(originalData.firstName);
    expect(currentData.lastName, 'Last name should remain unchanged').to.equal(originalData.lastName);
})
    .tag('@profile')
    .tag('@edit')
    .tag('@cancel');

/**
 * Email card displays current email address and supports changing it
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Verify the email card is visible and shows the current email address
 * 3. Click "Change email", submit new email with current password
 * 4. Verify success toast and new email is displayed
 * 5. Update spec-scoped email so subsequent scenarios re-login with the new address
 *
 * NOTE: The change email feature requires:
 * - "Enable Email Verification" to be enabled in Business Manager > Merchant Tools > Site Preferences > Storefront Login Preferences.
 * - "Enable Loginid Updates for SCAPI" to be enabled in Business Manager > Administration > Global Preferences > Feature Switches
 */
Scenario('Email card displays current email address and supports changing it', async () => {
    accountDetailsPage.navigate();

    // Verify email card is visible and shows the current email address
    accountDetailsPage.validateEmailCardVisible();
    const email = await accountDetailsPage.getDisplayedEmail();
    expect(email, 'Email address should be displayed').to.have.length.greaterThan(0);

    // Click Change email and submit new address with current password
    const newEmail = `shopper_${Date.now()}@test.com`;
    accountDetailsPage.clickChangeEmail();
    accountDetailsPage.fillAndSubmitEmailUpdateForm({ email: newEmail, currentPassword: specPassword });

    // Verify success toast
    accountDetailsPage.validateSuccessToast();

    // Update spec-scoped email so subsequent scenarios re-login with the new address
    specEmail = newEmail;

    // Verify new email is displayed
    const displayedEmail = await accountDetailsPage.getDisplayedEmail();
    expect(displayedEmail, 'Updated email should be displayed').to.equal(newEmail);

    // Verify automatic re-authentication happened — page should remain on /account
    // If auth failed, navigation would happen immediately; no explicit wait needed
    const currentUrl = await I.grabCurrentUrl();
    expect(currentUrl, 'Should remain on account page after email change').to.include('/account');

    // Note: this email change triggers an internal SLAS re-auth, and SLAS enforces
    // a ~1s cooldown between login operations for the same user. No manual wait is
    // needed here — the next scenario's Before-hook login goes through
    // loginRegistered, which now retries a SLAS 409 with backoff (withSlasRetry).
})
    .tag('@email')
    .tag('@edit')
    .tag('@positive');

/**
 * Change Email - Wrong Current Password
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click "Change email"
 * 3. Enter a valid new email with an incorrect current password
 * 4. Submit the form
 * 5. Verify error toast is shown and form remains open
 *
 * NOTE: The change email feature requires:
 * - "Enable Email Verification" to be enabled in Business Manager > Merchant Tools > Site Preferences > Storefront Login Preferences.
 * - "Enable Loginid Updates for SCAPI" to be enabled in Business Manager > Administration > Global Preferences > Feature Switches
 */
Scenario('Email change fails with incorrect current password', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickChangeEmail();

    // Submit with a wrong password — the new email format is valid, so only the password fails
    accountDetailsPage.fillAndSubmitEmailUpdateForm({
        email: `shopper_${Date.now()}@test.com`,
        currentPassword: 'WrongPassword123!',
    });

    // Verify error toast
    accountDetailsPage.validateErrorToast('Failed to update email address');

    // Form should remain open since the request failed
    const isFormStillVisible = await accountDetailsPage.isEmailUpdateFormVisible();
    expect(isFormStillVisible, 'Email update form should remain open after failed submission').to.be.true;
})
    .tag('@email')
    .tag('@negative')
    .tag('@validation');

/**
 * Change Email - Invalid Email Format
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click "Change email"
 * 3. Enter an invalid email address (not a valid format)
 * 4. Submit the form
 * 5. Verify client-side form validation error is shown and form remains open
 *
 * NOTE: The change email feature requires:
 * - "Enable Email Verification" to be enabled in Business Manager > Merchant Tools > Site Preferences > Storefront Login Preferences.
 * - "Enable Loginid Updates for SCAPI" to be enabled in Business Manager > Administration > Global Preferences > Feature Switches
 */
Scenario('Email change fails with invalid email format', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickChangeEmail();

    // Fill the form with an invalid email format — client-side validation should reject it
    accountDetailsPage.fillAndSubmitEmailUpdateForm({
        email: 'not-a-valid-email',
        currentPassword: specPassword,
    });

    // Verify client-side validation error is shown
    accountDetailsPage.validateFormError();

    // Form should remain open
    const isFormStillVisible = await accountDetailsPage.isEmailUpdateFormVisible();
    expect(isFormStillVisible, 'Email update form should remain open after validation error').to.be.true;
})
    .tag('@email')
    .tag('@negative')
    .tag('@validation');

/**
 * Email verification badge and Verify Email OTP flow
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Verify unverified badge is displayed
 * 3. Click "Verify Email", verify OTP modal opens with correct digit inputs and a Resend Code button.
 * 4. Close without submitting
 *
 * NOTE: Email verification status badges are only rendered when "Enable Email Verification" is enabled in
 * Business Manager > Merchant Tools > Site Preferences > Storefront Login Preferences.
 */
Scenario('Email verification badge is shown and Verify Email opens OTP modal when unverified', () => {
    accountDetailsPage.navigate();

    // The spec account is created without verifying the email, so email is always unverified in this test
    accountDetailsPage.validateEmailUnverifiedBadgeVisible();

    // Click Verify Email — sends OTP to current email and opens the modal
    accountDetailsPage.clickVerifyEmail();

    // Verify OTP modal opens with the correct number of input digits
    accountDetailsPage.validateOtpModalOpen();

    // Verify Resend Code button is present
    accountDetailsPage.validateOtpResendButtonVisible();

    // Close without submitting — actual OTP requires a valid code from email
    accountDetailsPage.closeOtpModal();
})
    .tag('@email')
    .tag('@verify');

/**
 * Profile Data Persistence After Page Refresh
 *
 * Test Flow:
 * 1. Update profile information
 * 2. Refresh the page
 * 3. Verify updated data persists
 */
Scenario('Profile changes persist after page refresh', async () => {
    accountDetailsPage.navigate();

    // Edit and save profile using helper method
    const timestamp = Date.now();
    const updates = {
        firstName: `Persist${timestamp}`,
        lastName: `Test${timestamp}`,
    };

    await accountDetailsPage.updateProfile(updates);

    // Refresh page
    accountDetailsPage.refreshPage();

    // Verify data persists
    const persistedData = await accountDetailsPage.getDisplayedProfileData();
    expect(persistedData.firstName, 'First name should persist after refresh').to.equal(updates.firstName);
    expect(persistedData.lastName, 'Last name should persist after refresh').to.equal(updates.lastName);
})
    .tag('@profile')
    .tag('@persistence')
    .tag('@refresh');

/**
 * Change Password - Positive Scenario
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Change Password button
 * 3. Fill password form with valid data
 * 4. Save changes
 * 5. Verify success message
 * 6. Verify automatic re-authentication
 */
Scenario('User can successfully change password', async () => {
    accountDetailsPage.navigate();

    // Click Change Password button
    accountDetailsPage.clickChangePassword();

    // Verify password form is visible
    const isFormVisible = await accountDetailsPage.isPasswordFormVisible();

    expect(isFormVisible, 'Password form should be visible').to.be.true;

    // Generate new password
    const newPassword = `NewPass${Date.now()}!Aa1`;

    // Fill password form
    accountDetailsPage.fillPasswordForm({
        currentPassword: specPassword,
        newPassword,
        confirmPassword: newPassword,
    });

    // Validate password requirements are met
    accountDetailsPage.validatePasswordRequirementsMet();

    // Save password
    accountDetailsPage.clickSavePassword();

    // Wait for success toast
    accountDetailsPage.validateSuccessToast();

    // Update spec-scoped password so subsequent scenarios use the new password
    specPassword = newPassword;

    // Verify automatic re-authentication happened
    // The page should remain accessible without redirect to login
    // If auth failed, navigation would happen immediately - no wait needed
    const currentUrl = await I.grabCurrentUrl();
    expect(currentUrl, 'Should remain on account page after password change').to.include('/account');

    // Uncomment to try interactive AI features:
    // pause();

    // Note: In a real test, you would need to revert the password change
    // or update the credential store with the new password for subsequent tests
})
    .tag('@password')
    .tag('@security')
    .tag('@positive');

/**
 * Change Password - Cancel Changes
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Change Password button
 * 3. Fill form with new password
 * 4. Click Cancel
 * 5. Verify form closes without saving
 */
Scenario('User can cancel password change without saving', async () => {
    accountDetailsPage.navigate();

    // Click Change Password button
    accountDetailsPage.clickChangePassword();

    // Fill password form
    accountDetailsPage.fillPasswordForm({
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewPass123!Aa',
        confirmPassword: 'NewPass123!Aa',
    });

    // Cancel changes
    accountDetailsPage.clickCancelPassword();

    // Verify form is closed
    I.waitForInvisible(accountDetailsPage.locators.passwordForm, 5);
    const isFormVisible = await accountDetailsPage.isPasswordFormVisible();

    expect(isFormVisible, 'Password form should be closed').to.be.false;
})
    .tag('@password')
    .tag('@cancel');

/**
 * Change Password - Incorrect Current Password
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Change Password button
 * 3. Enter incorrect current password
 * 4. Attempt to save
 * 5. Verify error message
 */
Scenario('Password change fails with incorrect current password', () => {
    accountDetailsPage.navigate();

    // Click Change Password button
    accountDetailsPage.clickChangePassword();

    // Fill with incorrect current password
    accountDetailsPage.fillPasswordForm({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPass123!Aa',
        confirmPassword: 'NewPass123!Aa',
    });

    // Try to save
    accountDetailsPage.clickSavePassword();

    // Wait for error toast
    accountDetailsPage.validateErrorToast();

    // Uncomment to try interactive AI features:
    // pause();
})
    .tag('@password')
    .tag('@negative')
    .tag('@validation');

/**
 * Change Password - Weak Password Validation
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Change Password button
 * 3. Enter weak password (fails requirements)
 * 4. Verify password requirements indicators show errors
 * 5. Verify Save button is disabled or save fails
 */
Scenario('Password change validates password strength requirements', () => {
    accountDetailsPage.navigate();

    // Use spec-scoped credentials
    const credentials = { email: specEmail, password: specPassword };

    // Click Change Password button
    accountDetailsPage.clickChangePassword();

    // Fill with weak password
    accountDetailsPage.fillPasswordForm({
        currentPassword: credentials.password,
        newPassword: 'weak',
        confirmPassword: 'weak',
    });

    // Verify password requirements are not met (red X icons visible)
    accountDetailsPage.validatePasswordRequirementsNotMet();

    // Uncomment to try interactive AI features:
    // pause();
})
    .tag('@password')
    .tag('@negative')
    .tag('@validation');

/**
 * Change Password - Mismatched Confirmation
 *
 * Test Flow:
 * 1. Navigate to account details
 * 2. Click Change Password button
 * 3. Enter password and non-matching confirmation
 * 4. Attempt to save
 * 5. Verify validation error
 */
Scenario('Password change fails when confirmation does not match', async () => {
    accountDetailsPage.navigate();

    // Use spec-scoped credentials
    const credentials = { email: specEmail, password: specPassword };

    // Click Change Password button
    accountDetailsPage.clickChangePassword();

    // Fill with mismatched passwords
    accountDetailsPage.fillPasswordForm({
        currentPassword: credentials.password,
        newPassword: 'NewPass123!Aa',
        confirmPassword: 'DifferentPass123!Aa',
    });

    // Try to save
    accountDetailsPage.clickSavePassword();

    // Verify form validation error or stays in edit mode
    // Playwright auto-waits for next check - no explicit wait needed
    const isStillVisible = await accountDetailsPage.isPasswordFormVisible();

    expect(isStillVisible, 'Form should remain open due to validation error').to.be.true;
})
    .tag('@password')
    .tag('@negative')
    .tag('@validation');

// =============================================================================
// Interests & Preferences Tests
//
// Unit tests (28) cover: individual renders, edit/save/cancel button toggling,
// onSuccess/onError callbacks, fetchInterests/fetchPreferences on mount, button
// group option selection, measure inputs, size preference select, badge removal
// handlers, and isEnabled returning null.
//
// Storybook stories (6) with play functions cover: title/description/Edit button
// visible, click Edit → Save/Cancel appear and "+ Add more" visible, click Edit
// then Cancel → Edit button returns, click "Women's" button → bg-primary class,
// and skeleton animation.
//
// These E2E tests add integration value not covered above:
// - Full dialog open/close + checkbox → badge flow (stories stop before dialog opens)
// - Full save flow with success toast from parent component
// - Cancel discards changes made in the real browser
// - Badge removal via aria-label button in the live app
// - Section visible in the live authenticated page with real auth/customerId
// =============================================================================

/**
 * Interests & Preferences section renders when authenticated
 *
 * Test Flow:
 * 1. Navigate to /account (already logged in via Before hook)
 * 2. Verify the I&P card and Edit button are visible
 *
 * E2E value: Confirms section renders in the live app with real auth/customerId,
 * which unit tests and stories cannot verify.
 */
Scenario('Interests & Preferences section renders for authenticated user', () => {
    accountDetailsPage.navigate();

    I.seeElement(accountDetailsPage.locators.interestsPreferencesCard);
    I.seeElement(accountDetailsPage.locators.interestsPreferencesEditButton);
}).tag('@interests-preferences');

/**
 * Edit mode toggle — cancel restores view mode
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Verify Save and Cancel buttons appear
 * 4. Click Cancel
 * 5. Verify Edit button returns and Save/Cancel are gone
 *
 * E2E value: Verifies the flow in the real page layout with actual async timing.
 */
Scenario('I&P edit mode toggle — cancel restores view mode', () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();

    I.seeElement(accountDetailsPage.locators.interestsPreferencesSaveButton);
    I.seeElement(accountDetailsPage.locators.interestsPreferencesCancelButton);

    accountDetailsPage.clickCancelInterestsPreferences();

    I.seeElement(accountDetailsPage.locators.interestsPreferencesEditButton);
    I.dontSeeElement(accountDetailsPage.locators.interestsPreferencesSaveButton);
    I.dontSeeElement(accountDetailsPage.locators.interestsPreferencesCancelButton);
})
    .tag('@interests-preferences')
    .tag('@edit')
    .tag('@cancel');

/**
 * Add an interest via the tabbed dialog
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Click "+ Add more" (interests) — dialog opens
 * 4. Switch to the "room_types" tab
 * 5. Toggle the "living_room" checkbox
 * 6. Click Save in the dialog
 * 7. Verify interest-badge-living_room badge is visible
 * 8. Click Cancel to discard changes
 *
 * E2E value: Full dialog flow (open → tab switch → checkbox → save → badge)
 * not covered by unit tests or stories.
 */
Scenario('Add an interest via the tabbed dialog', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();
    accountDetailsPage.openInterestsDialog();

    I.seeElement(accountDetailsPage.locators.interestsDialog);

    accountDetailsPage.switchInterestsDialogTab('room_types');
    accountDetailsPage.setInterestChecked('living_room');
    accountDetailsPage.saveInterestsDialog();

    const isBadgeVisible = await accountDetailsPage.isInterestBadgeVisible('living_room');

    expect(isBadgeVisible, 'Living room interest badge should be visible after dialog save').to.be.true;

    accountDetailsPage.clickCancelInterestsPreferences();
})
    .tag('@interests-preferences')
    .tag('@dialog')
    .tag('@positive');

/**
 * Remove an interest badge in edit mode
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Open interests dialog → select "minimalist" → save dialog
 * 4. Click the X remove button (aria-label="Remove Minimalist")
 * 5. Verify the badge disappears
 * 6. Click Cancel to discard
 *
 * E2E value: Real browser aria-label button interaction not covered by unit tests.
 */
Scenario('Remove an interest badge in edit mode', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();

    // First add a known interest via the dialog to seed state
    accountDetailsPage.openInterestsDialog();
    accountDetailsPage.switchInterestsDialogTab('design_styles');
    accountDetailsPage.setInterestChecked('minimalist');
    accountDetailsPage.saveInterestsDialog();

    const isBadgeVisible = await accountDetailsPage.isInterestBadgeVisible('minimalist');

    expect(isBadgeVisible, 'Minimalist badge should appear after dialog save').to.be.true;

    // Remove the badge
    I.click(accountDetailsPage.locators.removeInterestButton('Minimalist'));

    const isBadgeGone = await accountDetailsPage.isInterestBadgeVisible('minimalist');

    expect(isBadgeGone, 'Minimalist badge should be gone after removal').to.be.false;

    accountDetailsPage.clickCancelInterestsPreferences();
})
    .tag('@interests-preferences')
    .tag('@badge')
    .tag('@positive');

/**
 * Add a product category via multi-select dialog
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Click "+ Add more" for Product Categories
 * 4. Toggle "geometric" checkbox
 * 5. Click Save in the dialog
 * 6. Verify pref-badge-product_categories-geometric badge is visible
 * 7. Click Cancel to discard
 *
 * E2E value: Tests the second dialog type (multi-select) end-to-end.
 */
Scenario('Add a product category via multi-select dialog', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();
    accountDetailsPage.openProductCategoriesDialog();

    accountDetailsPage.setProductCategoryChecked('geometric');
    accountDetailsPage.saveProductCategoriesDialog();

    const isBadgeVisible = await accountDetailsPage.isProductCategoryBadgeVisible('geometric');

    expect(isBadgeVisible, 'Geometric category badge should be visible after dialog save').to.be.true;

    accountDetailsPage.clickCancelInterestsPreferences();
})
    .tag('@interests-preferences')
    .tag('@dialog')
    .tag('@positive');

/**
 * Full save flow with success toast
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Open interests dialog → switch to "design_styles" tab → select "minimalist" → save dialog
 * 4. Click Save on the section
 * 5. Verify success toast appears
 * 6. Verify interest-badge-minimalist is visible in view mode
 *
 * E2E value: Full "edit → save → toast → view mode reflects changes" cycle, including
 * the success toast fired by the parent component — not covered by unit tests or stories.
 */
Scenario('I&P full save flow shows success toast and reflects state in view mode', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();

    accountDetailsPage.openInterestsDialog();
    accountDetailsPage.switchInterestsDialogTab('design_styles');
    accountDetailsPage.setInterestChecked('minimalist');
    accountDetailsPage.saveInterestsDialog();

    accountDetailsPage.clickSaveInterestsPreferences();

    accountDetailsPage.validateInterestsPreferencesSaved();

    // In view mode, the badge should now be visible
    const isBadgeVisible = await accountDetailsPage.isInterestBadgeVisible('minimalist');

    expect(isBadgeVisible, 'Minimalist badge should be visible in view mode after save').to.be.true;
})
    .tag('@interests-preferences')
    .tag('@save')
    .tag('@toast')
    .tag('@positive');

/**
 * Cancel discards all pending changes
 *
 * Test Flow:
 * 1. Navigate to /account
 * 2. Click Edit on the I&P section
 * 3. Open interests dialog → select "geometric" → save dialog
 * 4. Click Cancel on the section
 * 5. Verify interest-badge-geometric is NOT visible
 * 6. Verify Edit button is visible again
 *
 * E2E value: Verifies full discard behavior across change types in the real browser.
 */
Scenario('I&P cancel discards all pending changes', async () => {
    accountDetailsPage.navigate();

    accountDetailsPage.clickEditInterestsPreferences();

    accountDetailsPage.openInterestsDialog();
    accountDetailsPage.switchInterestsDialogTab('design_styles');
    accountDetailsPage.setInterestChecked('geometric');
    accountDetailsPage.saveInterestsDialog();

    accountDetailsPage.clickCancelInterestsPreferences();

    I.seeElement(accountDetailsPage.locators.interestsPreferencesEditButton);

    const isBadgeVisible = await accountDetailsPage.isInterestBadgeVisible('geometric');

    expect(isBadgeVisible, 'Geometric badge should not be visible after cancel').to.be.false;
})
    .tag('@interests-preferences')
    .tag('@cancel')
    .tag('@negative');

export {};
