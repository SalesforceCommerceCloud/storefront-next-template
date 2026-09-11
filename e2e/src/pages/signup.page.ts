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
 * Signup Page Object
 * Handles interactions with the shopper signup/registration page
 *
 * AI-discovered locators from actual DOM structure
 */
class SignupPage {
    locators = {
        // Form input fields
        firstNameInput: locate('#firstName, input[name="firstName"]').first().as('First Name Input'),
        lastNameInput: locate('#lastName, input[name="lastName"]').first().as('Last Name Input'),
        emailInput: locate('#email, input[name="email"]').first().as('Email Input'),
        passwordInput: locate('#password, input[name="password"]').first().as('Password Input'),
        confirmPasswordInput: locate('#confirmPassword, input[name="confirmPassword"]')
            .first()
            .as('Confirm Password Input'),

        // Form actions
        createAccountButton: locate('button[type="submit"]').as('Create Account Button'),
        signInLink: locate('a').withText('Sign in').as('Sign In Link'),

        // Validation error messages
        errorMessage: locate('[data-testid*="error"]').as('Error Message'),
        fieldError: locate('.error, [class*="error"]').as('Field Error'),
    };

    /**
     * Navigate to the signup page
     * @param url - Optional URL path (defaults to /signup)
     */
    navigate(url: string = '/signup'): void {
        I.amOnPage(buildSitePath(url));
    }

    /**
     * Validate that the signup page has loaded successfully
     */
    validatePageLoaded(timeoutSeconds: number = 30): void {
        // Wait for page to actually navigate to signup before checking elements
        I.waitInUrl('/signup', timeoutSeconds / 2);
        I.waitForElement(this.locators.firstNameInput, timeoutSeconds);
        I.seeElement(this.locators.firstNameInput);
        I.seeElement(this.locators.lastNameInput);
        I.seeElement(this.locators.emailInput);
        I.seeElement(this.locators.passwordInput);
        I.seeElement(this.locators.confirmPasswordInput);
        I.seeElement(this.locators.createAccountButton);
    }

    /**
     * Auth-mode-agnostic readiness gate for the a11y scan. Waits for the fields shared
     * by both password signup and email-verification (passwordless) signup: first/last
     * name, email, and the submit button (matched by `type`, not label). Does NOT assert
     * the password / confirm-password fields, which passwordless signup omits, so this
     * holds under either supported configuration. These are body elements, so their
     * presence also guarantees the `<head>` (`<html lang>` / `<title>`) has committed,
     * past the scan-race window.
     */
    validateA11yReady(timeoutSeconds: number = 30): void {
        I.waitInUrl('/signup', timeoutSeconds / 2);
        I.waitForElement(this.locators.firstNameInput, timeoutSeconds);
        I.seeElement(this.locators.firstNameInput);
        I.seeElement(this.locators.lastNameInput);
        I.seeElement(this.locators.emailInput);
        I.seeElement(this.locators.createAccountButton);
    }

    /**
     * Fill in the first name field
     */
    fillFirstName(firstName: string): void {
        I.fillField(this.locators.firstNameInput, firstName);
    }

    /**
     * Fill in the last name field
     */
    fillLastName(lastName: string): void {
        I.fillField(this.locators.lastNameInput, lastName);
    }

    /**
     * Fill in the email field
     */
    fillEmail(email: string): void {
        I.fillField(this.locators.emailInput, email);
    }

    /**
     * Fill in the password field
     */
    fillPassword(password: string): void {
        I.fillField(this.locators.passwordInput, password);
    }

    /**
     * Fill in the confirm password field
     */
    fillConfirmPassword(confirmPassword: string): void {
        I.fillField(this.locators.confirmPasswordInput, confirmPassword);
    }

    /**
     * Re-assert the form's most fragile fields are present immediately before a
     * fill. The signup form is server-rendered and present on first paint, so
     * `validatePageLoaded` passes against the SSR HTML — but React reconciliation
     * during hydration can briefly detach the SSR input nodes, so the node
     * vanishes between that check and the `fillField` ("Last Name Input"
     * disappearing mid-form). Re-asserting here (Last Name first — it's the field
     * that flakes) narrows the window; the flow layer wraps the fill in a single
     * retry for the rare case a node detaches mid-fill. `seeElement` is an
     * assertion (Playwright auto-waits), not a readiness `wait`.
     */
    assertFormInteractive(): void {
        I.seeElement(this.locators.lastNameInput);
        I.seeElement(this.locators.firstNameInput);
    }

    /**
     * Fill in the complete signup form
     * @param data - Signup form data
     */
    fillSignupForm(data: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        confirmPassword: string;
    }): void {
        this.fillFirstName(data.firstName);
        this.fillLastName(data.lastName);
        this.fillEmail(data.email);
        this.fillPassword(data.password);
        this.fillConfirmPassword(data.confirmPassword);
    }

    /**
     * Click the Create Account button to submit the form
     */
    clickCreateAccount(): void {
        I.click(this.locators.createAccountButton);
    }

    /**
     * Click the Sign In link to navigate to login page
     */
    clickSignIn(): void {
        I.click(this.locators.signInLink);
    }

    /**
     * Check if a validation error is displayed
     */
    async hasValidationError(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.errorMessage);
        return count > 0;
    }

    /**
     * Get validation error message text
     */
    async getErrorMessage(): Promise<string> {
        return await I.grabTextFrom(this.locators.errorMessage);
    }

    /**
     * Validate that signup was successful by checking URL or page state
     * Override this method based on your storefront's post-signup behavior
     */
    validateSignupSuccess(): void {
        // After successful signup, user should be redirected away from /signup
        // Common patterns: redirect to homepage, account page, or show success message
        // Adjust this assertion based on actual behavior
        I.dontSeeInCurrentUrl('/signup');
        I.dontSeeElement(this.locators.errorMessage);
    }
}

// Export as singleton following CodeceptJS pattern
export = new SignupPage();
