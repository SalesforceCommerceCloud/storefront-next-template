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

import { buildSitePath } from '../utils/url-utils';

const { I } = inject();

/**
 * Account Details Page Object
 * Encapsulates interactions with the account details page at /account
 *
 * Features:
 * - Personal information viewing and editing
 * - Password management
 * - Interests & preferences
 * - Marketing consent
 */
class AccountDetailsPage {
    locators = {
        // Page elements
        pageTitle: locate('h1').withText('Account Details').as('Page Title'),
        pageSubtitle: locate('p.text-muted-foreground').as('Page Subtitle'),

        // Profile card
        profileCard: locate('[data-testid="profile-card"]').as('Profile Card'),
        profileContent: locate('[data-testid="profile-card"]')
            .find('[class*="CardContent"]')
            .as('Profile Card Content'),
        profileEditButton: locate('[data-testid="profile-card"]')
            .find('button')
            .withText('Edit')
            .as('Profile Edit Button'),
        profileForm: locate('[data-testid="customer-profile-form"]').as('Customer Profile Form'),

        // Profile form fields (email is in separate card now)
        firstNameField: locate('input[name="firstName"]').as('First Name Field'),
        lastNameField: locate('input[name="lastName"]').as('Last Name Field'),
        phoneField: locate('input[name="phone"]').as('Phone Field'),
        genderSelect: locate('select[name="gender"]').as('Gender Select'),
        birthdayField: locate('input[name="birthday"]').as('Birthday Field'),

        // Profile form buttons (Save/Cancel are in the card header, not inside the form)
        profileSaveButton: locate('[data-testid="profile-card"]')
            .find('button[type="submit"][form="customer-profile-form"]')
            .as('Profile Save Button'),
        profileCancelButton: locate('[data-testid="profile-card"]')
            .find('button[type="button"]')
            .withText('Cancel')
            .as('Profile Cancel Button'),

        // Profile display fields (when not editing) — use data-testid for stable E2E
        displayedFirstName: locate('[data-testid="profile-value-firstName"]').as('Displayed First Name'),
        displayedLastName: locate('[data-testid="profile-value-lastName"]').as('Displayed Last Name'),
        displayedPhone: locate('[data-testid="profile-value-phone"]').as('Displayed Phone'),
        displayedGender: locate('[data-testid="profile-value-gender"]').as('Displayed Gender'),
        displayedBirthday: locate('[data-testid="profile-value-birthday"]').as('Displayed Birthday'),

        // Email card (separate from profile card)
        emailCard: locate('[data-testid="sf-toggle-card-email"]').as('Email Card'),
        displayedEmail: locate('[data-testid="sf-toggle-card-email"]')
            .find('[data-testid="email-value"]')
            .as('Displayed Email'),
        changeEmailButton: locate('[data-testid="sf-toggle-card-email"]')
            .find('button')
            .withText('Change email')
            .as('Change Email Button'),
        verifyEmailButton: locate('[data-testid="sf-toggle-card-email"]')
            .find('button')
            .withText('Verify Email')
            .as('Verify Email Button'),
        emailVerifiedBadge: locate('[data-testid="email-verified-badge"]').as('Email Verified Badge'),
        emailUnverifiedBadge: locate('[data-testid="email-unverified-badge"]').as('Email Unverified Badge'),

        // Email update form (shown when editing email)
        emailUpdateForm: locate('[data-testid="email-update-form"]').as('Email Update Form'),
        newEmailField: locate('[data-testid="email-update-form"]').find('input[name="email"]').as('New Email Field'),
        emailCurrentPasswordField: locate('[data-testid="email-update-form"]')
            .find('input[name="currentPassword"]')
            .as('Email Form Current Password Field'),
        emailSaveButton: locate('[data-testid="email-update-form"]')
            .find('button[type="submit"]')
            .as('Email Save Button'),
        emailCancelButton: locate('[data-testid="email-update-form"]')
            .find('button[type="button"]')
            .withText('Cancel')
            .as('Email Cancel Button'),

        // OTP modal
        otpModal: locate('[data-testid="otp-modal"]').as('OTP Modal'),
        otpInput: (index: number) => locate(`input[aria-label*="digit ${index + 1}"]`).as(`OTP Input ${index + 1}`),
        otpResendButton: locate('[data-testid="otp-modal"]')
            .find('button')
            .withText('Resend Code')
            .as('OTP Resend Code Button'),

        // Password toggle card
        passwordCard: locate('[data-testid="sf-toggle-card-password"]').as('Password Card'),
        passwordContent: locate('[data-testid="sf-toggle-card-password-content"]').as('Password Card Content'),
        changePasswordButton: locate('[data-testid="sf-toggle-card-password-content"]')
            .find('button')
            .as('Change Password Button'),
        passwordForm: locate('[data-testid="password-update-form"]').as('Password Update Form'),

        // Password form fields
        currentPasswordField: locate('input[name="currentPassword"]').as('Current Password Field'),
        newPasswordField: locate('input[name="password"]').as('New Password Field'),
        confirmPasswordField: locate('input[name="confirmPassword"]').as('Confirm Password Field'),

        // Password requirements indicators
        passwordCheckIcon: locate('[data-testid="check-icon"]').as('Password Requirement Met Icon'),
        passwordXIcon: locate('[data-testid="x-icon"]').as('Password Requirement Not Met Icon'),

        // Password form buttons
        passwordSaveButton: locate('[data-testid="password-update-form"]')
            .find('button[type="submit"]')
            .as('Password Save Button'),
        passwordCancelButton: locate('[data-testid="password-update-form"]')
            .find('button[type="button"]')
            .withText('Cancel')
            .as('Password Cancel Button'),

        // Toast notifications
        successToast: locate('[data-sonner-toast][data-type=success]').as('Success Toast'),
        errorToast: locate('[data-sonner-toast][data-type=error]').as('Error Toast'),

        // Error messages
        formError: locate('.text-destructive').as('Form Error Message'),

        // Interests & Preferences section
        interestsPreferencesCard: locate('[data-testid="interests-preferences-section"]').as(
            'Interests & Preferences Card'
        ),
        interestsPreferencesEditButton: locate('[data-testid="interests-preferences-edit-button"]').as(
            'I&P Edit Button'
        ),
        interestsPreferencesSaveButton: locate('[data-testid="interests-preferences-save-button"]').as(
            'I&P Save Button'
        ),
        interestsPreferencesCancelButton: locate('[data-testid="interests-preferences-cancel-button"]').as(
            'I&P Cancel Button'
        ),

        // Interests
        addMoreInterestsButton: locate('[data-testid="interests-add-more-button"]').as('Add More Interests Button'),
        interestBadge: (id: string) => locate(`[data-testid="interest-badge-${id}"]`).as(`Interest Badge: ${id}`),
        removeInterestButton: (name: string) => locate(`button[aria-label="Remove ${name}"]`).as(`Remove ${name}`),

        // Interests dialog
        interestsDialog: locate('[data-testid="interests-dialog"]').as('Interests Dialog'),
        interestsDialogTab: (categoryId: string) =>
            locate(`[data-testid="interests-tab-${categoryId}"]`).as(`Interests Tab: ${categoryId}`),
        interestCheckbox: (interestId: string) =>
            locate(`#dialog-interest-${interestId}`).as(`Interest Checkbox: ${interestId}`),
        interestsDialogSaveButton: locate('[data-testid="interests-dialog-save-button"]').as('Interests Dialog Save'),

        // Product categories (multi-select)
        productCategoriesAddButton: locate('[data-testid="pref-product_categories-add-more-button"]').as(
            'Add More Product Categories Button'
        ),
        productCategoryBadge: (val: string) =>
            locate(`[data-testid="pref-badge-product_categories-${val}"]`).as(`Category Badge: ${val}`),
        productCategoryCheckbox: (val: string) => locate(`#dialog-pref-${val}`).as(`Category Checkbox: ${val}`),
        productCategoriesDialogSaveButton: locate('[data-testid="product-categories-dialog-save-button"]').as(
            'Product Categories Dialog Save'
        ),

        // Shopping preferences (button-group)
        shoppingPreferenceButton: (label: string) => locate('button').withText(label).as(`Shopping Pref: ${label}`),

        // Measures inputs (existing IDs from component)
        roomWidthInput: locate('#field-room_width').as('Room Width Input'),
        roomLengthInput: locate('#field-room_length').as('Room Length Input'),
        ceilingHeightInput: locate('#field-ceiling_height').as('Ceiling Height Input'),

        // Size preference select (existing ID from component)
        sizePreferenceSelect: locate('#pref-size_preference').as('Size Preference Select'),
    };

    /**
     * Navigate to account details page
     * @param url - Optional URL override (defaults to /account)
     */
    navigate(url: string = '/account'): void {
        I.amOnPage(buildSitePath(url));
        I.waitForElement(this.locators.pageTitle, 30);
        I.waitForElement(this.locators.profileCard);
    }

    /**
     * Validate that the page loaded successfully
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.pageTitle);
        I.see('Account Details');
        I.seeElement(this.locators.profileCard);
        I.seeElement(this.locators.emailCard);
        I.seeElement(this.locators.passwordCard);
    }

    /**
     * Validate authentication requirement
     * Checks if unauthenticated users are redirected to login
     */
    async validateAuthenticationRequired(): Promise<void> {
        const currentUrl = await I.grabCurrentUrl();
        if (!currentUrl.includes('/account')) {
            // Should be redirected to login or similar
            I.waitForURL(/\/(login|signin)/, 10);
        }
    }

    /**
     * Click the Edit button on the profile card
     */
    clickEditProfile(): void {
        I.click(this.locators.profileEditButton);
        I.waitForElement(this.locators.profileForm, 5);
    }

    /**
     * Read the current values of all profile form fields while in edit mode.
     * Use this to capture pre-filled values before overriding specific fields,
     * so every save includes all required fields.
     * Note: Email is in a separate card and not part of profile form.
     */
    async getCurrentEditFormValues(): Promise<{
        firstName: string;
        lastName: string;
        phone: string;
        gender: string;
        birthday: string;
    }> {
        return {
            firstName: await I.grabValueFrom(this.locators.firstNameField),
            lastName: await I.grabValueFrom(this.locators.lastNameField),
            phone: await I.grabValueFrom(this.locators.phoneField),
            gender: await I.grabValueFrom(this.locators.genderSelect),
            birthday: await I.grabValueFrom(this.locators.birthdayField),
        };
    }

    /**
     * Fill the profile form with data.
     * Note: Email is in a separate card and requires OTP verification to edit.
     * @param data - Profile data to fill (no email field)
     */
    fillProfileForm(data: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        gender?: string;
        birthday?: string;
    }): void {
        if (data.firstName !== undefined) {
            I.fillField(this.locators.firstNameField, data.firstName);
        }
        if (data.lastName !== undefined) {
            I.fillField(this.locators.lastNameField, data.lastName);
        }
        if (data.phone !== undefined) {
            I.fillField(this.locators.phoneField, data.phone);
        }
        if (data.gender !== undefined) {
            I.selectOption(this.locators.genderSelect, data.gender);
        }
        if (data.birthday !== undefined) {
            I.fillField(this.locators.birthdayField, data.birthday);
        }
    }

    /**
     * Click the Save button on the profile form
     */
    clickSaveProfile(): void {
        I.click(this.locators.profileSaveButton);
        I.waitForElement(this.locators.successToast, 10);
    }

    /**
     * Click the Cancel button on the profile form
     */
    clickCancelProfile(): void {
        I.click(this.locators.profileCancelButton);
        I.waitForElement(this.locators.profileEditButton, 5);
    }

    /**
     * Get displayed profile data (view mode only).
     * Waits for view mode (Edit button visible) then reads values via data-testid.
     */
    async getDisplayedProfileData(): Promise<{
        firstName: string;
        lastName: string;
        phone: string;
        gender: string;
        birthday: string;
    }> {
        I.waitForElement(this.locators.profileEditButton, 10);
        I.waitForElement(this.locators.displayedFirstName, 5);

        const firstName = await I.grabTextFrom(this.locators.displayedFirstName);
        const lastName = await I.grabTextFrom(this.locators.displayedLastName);
        const phone = await I.grabTextFrom(this.locators.displayedPhone);
        const gender = await I.grabTextFrom(this.locators.displayedGender);
        const birthday = await I.grabTextFrom(this.locators.displayedBirthday);

        return {
            firstName: firstName?.trim() ?? '',
            lastName: lastName?.trim() ?? '',
            phone: phone?.trim() ?? '',
            gender: gender?.trim() ?? '',
            birthday: birthday?.trim() ?? '',
        };
    }

    /**
     * Click the Change Password button
     */
    clickChangePassword(): void {
        I.waitForElement(this.locators.changePasswordButton, 10);
        I.click(this.locators.changePasswordButton);
        I.waitForElement(this.locators.passwordForm, 5);
    }

    /**
     * Fill the password form
     * @param data - Password data to fill
     */
    fillPasswordForm(data: { currentPassword: string; newPassword: string; confirmPassword: string }): void {
        I.fillField(this.locators.currentPasswordField, data.currentPassword);
        I.fillField(this.locators.newPasswordField, data.newPassword);
        I.fillField(this.locators.confirmPasswordField, data.confirmPassword);
    }

    /**
     * Click the Save button on the password form.
     * Does not wait for success/error; the test should call validateSuccessToast() or validateErrorToast() as appropriate.
     */
    clickSavePassword(): void {
        I.click(this.locators.passwordSaveButton);
    }

    /**
     * Click the Cancel button on the password form
     */
    clickCancelPassword(): void {
        I.click(this.locators.passwordCancelButton);
        I.waitForElement(this.locators.changePasswordButton, 5);
    }

    /**
     * Validate that password requirements are met
     * Checks for green check icons indicating requirements are satisfied
     */
    validatePasswordRequirementsMet(): void {
        I.seeElement(this.locators.passwordCheckIcon);
    }

    /**
     * Validate that password requirements are not met
     * Checks for red X icons indicating requirements are not satisfied
     */
    validatePasswordRequirementsNotMet(): void {
        I.seeElement(this.locators.passwordXIcon);
    }

    /**
     * Wait for and validate success toast message
     * @param message - Optional expected message text
     */
    validateSuccessToast(message?: string): void {
        I.waitForElement(this.locators.successToast, 10);
        if (message) {
            I.see(message);
        }
    }

    /**
     * Wait for the Interests & Preferences save: the success toast, then the section back in view mode.
     * The toast is required, so a save that completes without notifying the shopper fails the scenario.
     */
    validateInterestsPreferencesSaved(): void {
        this.validateSuccessToast();
        I.waitForElement('[data-testid="interests-preferences-edit-button"]', 10);
    }

    /**
     * Wait for and validate error toast message
     * @param message - Optional expected message text
     */
    validateErrorToast(message?: string): void {
        I.waitForElement(this.locators.errorToast, 10);
        if (message) {
            I.see(message);
        }
    }

    /**
     * Validate that form error is displayed
     */
    validateFormError(): void {
        I.seeElement(this.locators.formError);
    }

    /**
     * Check if profile is in edit mode
     * @returns Promise<boolean> - True if in edit mode
     */
    async isProfileInEditMode(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.profileForm);
        return count > 0;
    }

    /**
     * Check if password form is visible
     * @returns Promise<boolean> - True if form is visible
     */
    async isPasswordFormVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.passwordForm);
        return count > 0;
    }

    /**
     * Refresh the page and wait for it to load
     */
    refreshPage(): void {
        I.refreshPage();
        I.waitForElement(this.locators.pageTitle, 30);
        I.waitForElement(this.locators.profileCard);
    }

    // =========================================================================
    // Email methods
    // =========================================================================

    /**
     * Assert the email card is visible on the page.
     */
    validateEmailCardVisible(): void {
        I.seeElement(this.locators.emailCard);
    }

    /**
     * Assert the email unverified badge is visible.
     * Use this when the test expects an unverified state (e.g., freshly registered spec accounts).
     */
    validateEmailUnverifiedBadgeVisible(): void {
        I.seeElement(this.locators.emailUnverifiedBadge);
    }

    /**
     * Get the email address displayed on the email card (view mode only).
     */
    async getDisplayedEmail(): Promise<string> {
        const email = await I.grabTextFrom(this.locators.displayedEmail);
        return email?.trim() ?? '';
    }

    /**
     * Check if the email update form is visible.
     */
    async isEmailUpdateFormVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emailUpdateForm);
        return count > 0;
    }

    /**
     * Click the "Verify Email" button on the email card.
     * Only visible when email verification is enabled and email is unverified.
     */
    clickVerifyEmail(): void {
        I.click(this.locators.verifyEmailButton);
        I.waitForElement(this.locators.otpModal, 10);
    }

    /**
     * Click the "Change email" button on the email card.
     * Only visible when email verification is enabled.
     */
    clickChangeEmail(): void {
        I.click(this.locators.changeEmailButton);
    }

    /**
     * Validate that the OTP modal is open with the correct structure.
     * Checks for the modal container and that OTP input fields are present.
     * @param expectedOtpLength - Number of OTP input digits to expect (default: 6)
     */
    validateOtpModalOpen(expectedOtpLength = 6): void {
        I.seeElement(this.locators.otpModal);
        I.seeElement(locate(`[data-testid="otp-modal"] input[type="text"][maxlength="1"]`).as('OTP digit input'));
        I.seeNumberOfElements(
            locate(`[data-testid="otp-modal"] input[type="text"][maxlength="1"]`).as('OTP inputs'),
            expectedOtpLength
        );
    }

    /**
     * Assert the OTP Resend Code button is visible inside the OTP modal.
     */
    validateOtpResendButtonVisible(): void {
        I.seeElement(this.locators.otpResendButton);
    }

    /**
     * Close the OTP modal using the close button (X).
     */
    closeOtpModal(): void {
        I.click(locate('[data-testid="otp-modal"]').find('button[aria-label*="Close"]').as('OTP Modal Close'));
        I.waitForInvisible(this.locators.otpModal, 5);
    }

    /**
     * Fill and submit the email update form.
     * @param data - New email and current password. Password is only required for shoppers
     *   who registered with a password — passwordless shoppers omit it and require an OTP verification instead.
     */
    fillAndSubmitEmailUpdateForm(data: { email: string; currentPassword?: string }): void {
        I.waitForElement(this.locators.emailUpdateForm, 10);
        I.fillField(this.locators.newEmailField, data.email);
        if (data.currentPassword !== undefined) {
            I.fillField(this.locators.emailCurrentPasswordField, data.currentPassword);
        }
        I.click(this.locators.emailSaveButton);
    }

    // =========================================================================
    // Interests & Preferences methods
    // =========================================================================

    /**
     * Click the Edit button on the I&P section and wait for Save to appear
     */
    clickEditInterestsPreferences(): void {
        I.click(this.locators.interestsPreferencesEditButton);
        I.waitForElement(this.locators.interestsPreferencesSaveButton, 5);
    }

    /**
     * Click Save on the I&P section
     */
    clickSaveInterestsPreferences(): void {
        I.click(this.locators.interestsPreferencesSaveButton);
        I.waitForElement(this.locators.successToast, 10);
    }

    /**
     * Click Cancel on the I&P section and wait for Edit button to return
     */
    clickCancelInterestsPreferences(): void {
        I.click(this.locators.interestsPreferencesCancelButton);
        I.waitForElement(this.locators.interestsPreferencesEditButton, 5);
    }

    /**
     * Click "+ Add more" on the interests section and wait for dialog to open
     */
    openInterestsDialog(): void {
        I.click(this.locators.addMoreInterestsButton);
        I.waitForElement(this.locators.interestsDialog, 5);
    }

    /**
     * Switch to a tab in the interests dialog
     * @param categoryId - The category ID of the tab to switch to
     */
    switchInterestsDialogTab(categoryId: string): void {
        I.click(this.locators.interestsDialogTab(categoryId));
        I.waitForElement(this.locators.interestsDialog, 5);
    }

    /**
     * Set an interest checkbox to an explicit state. Idempotent, so a retried scenario on an
     * account that already saved the interest does not flip it back off.
     * @param interestId - The interest ID
     * @param checked - Desired state
     */
    setInterestChecked(interestId: string, checked: boolean = true): void {
        I.usePlaywrightTo(`set interest ${interestId} checked=${checked}`, async ({ page }) => {
            await page.locator(`#dialog-interest-${interestId}`).setChecked(checked);
        });
    }

    /**
     * Click Save in the interests dialog and wait for dialog to close
     */
    saveInterestsDialog(): void {
        I.click(this.locators.interestsDialogSaveButton);
        I.waitForInvisible(this.locators.interestsDialog, 5);
    }

    /**
     * Click "+ Add more" for product categories and wait for dialog to open
     */
    openProductCategoriesDialog(): void {
        I.click(this.locators.productCategoriesAddButton);
        I.waitForElement(locate('[data-testid="product-categories-dialog"]').as('Product Categories Dialog'), 5);
    }

    /**
     * Set a product category checkbox to an explicit state (idempotent, see setInterestChecked).
     * @param val - The option value
     * @param checked - Desired state
     */
    setProductCategoryChecked(val: string, checked: boolean = true): void {
        I.usePlaywrightTo(`set product category ${val} checked=${checked}`, async ({ page }) => {
            await page.locator(`#dialog-pref-${val}`).setChecked(checked);
        });
    }

    /**
     * Click Save in the product categories dialog and wait for it to close
     */
    saveProductCategoriesDialog(): void {
        I.click(this.locators.productCategoriesDialogSaveButton);
        I.waitForInvisible(locate('[data-testid="product-categories-dialog"]').as('Product Categories Dialog'), 5);
    }

    /**
     * Check if an interest badge is visible
     * @param id - Interest ID
     * @returns Promise<boolean>
     */
    async isInterestBadgeVisible(id: string): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.interestBadge(id));
        return count > 0;
    }

    /**
     * Check if a product category badge is visible
     * @param val - Category option value
     * @returns Promise<boolean>
     */
    async isProductCategoryBadgeVisible(val: string): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.productCategoryBadge(val));
        return count > 0;
    }

    // =========================================================================
    // High-level workflow helper methods
    // These methods combine multiple steps into complete flows for cleaner tests
    // =========================================================================

    /**
     * Update profile with the provided changes
     * This is a complete flow: click edit → get current values → merge updates → save → verify success → get updated data
     * Note: Email is in a separate card and requires OTP verification to edit (not included here).
     * @param updates - Partial profile data to update (no email)
     * @returns Promise<ProfileData> - The updated profile data as displayed
     */
    async updateProfile(updates: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        gender?: string;
        birthday?: string;
    }): Promise<{
        firstName: string;
        lastName: string;
        phone: string;
        gender: string;
        birthday: string;
    }> {
        this.clickEditProfile();
        const currentValues = await this.getCurrentEditFormValues();
        const mergedData = { ...currentValues, ...updates };
        this.fillProfileForm(mergedData);
        this.clickSaveProfile();
        this.validateSuccessToast();
        I.waitForElement(this.locators.profileEditButton, 10);
        return await this.getDisplayedProfileData();
    }

    /**
     * Change password
     * This is a complete flow: click change password → fill form → save → verify success
     * @param currentPassword - Current password
     * @param newPassword - New password
     */
    changePassword(currentPassword: string, newPassword: string): void {
        this.clickChangePassword();
        this.fillPasswordForm({
            currentPassword,
            newPassword,
            confirmPassword: newPassword,
        });
        this.clickSavePassword();
        this.validateSuccessToast();
    }

    /**
     * Add an interest via the dialog
     * This is a complete flow: open dialog → switch to category tab → toggle checkbox → save dialog
     * @param categoryId - The category ID (tab to switch to)
     * @param interestId - The interest ID to add
     */
    addInterest(categoryId: string, interestId: string): void {
        this.clickEditInterestsPreferences();
        this.openInterestsDialog();
        this.switchInterestsDialogTab(categoryId);
        this.setInterestChecked(interestId);
        this.saveInterestsDialog();
    }

    /**
     * Add a product category via the dialog
     * This is a complete flow: open dialog → toggle checkbox → save dialog
     * @param categoryValue - The category option value to add
     */
    addProductCategory(categoryValue: string): void {
        this.clickEditInterestsPreferences();
        this.openProductCategoriesDialog();
        this.setProductCategoryChecked(categoryValue);
        this.saveProductCategoriesDialog();
    }
}

// Export as singleton
export = new AccountDetailsPage();
