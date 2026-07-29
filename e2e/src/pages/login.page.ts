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

// oxlint-disable-next-line @typescript-eslint/no-require-imports -- codeceptjs/steps has no ESM export
const step = require('codeceptjs/steps');
const { I } = inject();

/**
 * Login Page Object
 * Handles interactions with the shopper login/signin page
 *
 * User-provided locators for login form and authentication options
 */
class LoginPage {
    locators = {
        // Form input fields
        emailInput: locate('input#email').as('Email Input'),
        passwordInput: locate('input#password').as('Password Input'),

        // Form actions
        signInButton: locate('button').withText('Sign In').as('Sign In Button'),
        forgotPasswordLink: locate('a').withText('Forgot your password?').as('Forgot Password Link'),
        signUpLink: locate('a').withText('Sign up').as('Sign Up Link'),
        // Validation error messages
        errorMessage: locate('div:has-text("Something went wrong")').as('Error Message'),
        fieldError: locate('.error, [class*="error"]').as('Field Error'),
        wishlistMergeToast: locate('[data-sonner-toast]')
            .withText('added to your account wishlist')
            .as('Wishlist Merge Toast'),
    };

    /**
     * Navigate to the login page
     * @param options - Optional navigation options (URL string or query params object)
     */
    navigate(options?: string | { mode?: 'password' | 'passwordless' }): void {
        let url = '/login';
        if (typeof options === 'string') {
            url = options;
        } else if (options && 'mode' in options) {
            url = `/login?mode=${options.mode}`;
        }
        I.amOnPage(buildSitePath(url));
    }

    /**
     * Validate that the login page has loaded successfully
     */
    validatePageLoaded(timeoutSeconds: number = 30): void {
        // Wait for page to actually navigate to login before checking elements
        I.waitInUrl('/login', timeoutSeconds / 2);
        I.waitForElement(this.locators.emailInput, timeoutSeconds);
        I.seeElement(this.locators.emailInput);
        I.seeElement(this.locators.signInButton);
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
        // Filling the email field can trigger a React re-render that briefly
        // detaches the password input. This is only observable under accumulated
        // browser state (e.g., 9th login in the same spec run).
        // @ts-expect-error step.retry() is a valid trailing arg at runtime but not in CodeceptJS typings
        I.fillField(this.locators.passwordInput, password, step.retry(3));
    }

    /**
     * Fill in the complete login form
     * @param data - Login form data
     */
    fillLoginForm(data: { email: string; password: string }): void {
        this.fillEmail(data.email);
        this.fillPassword(data.password);
    }

    /**
     * Click the Sign In button to submit the form
     */
    clickSignIn(): void {
        I.click(this.locators.signInButton);
    }

    /**
     * Click the Sign Up link to navigate to signup page
     */
    clickSignUp(): void {
        I.click(this.locators.signUpLink);
    }

    /**
     * Click the Forgot Password link to navigate to password reset
     */
    clickForgotPassword(): void {
        I.click(this.locators.forgotPasswordLink);
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
     * Validate that login was successful by checking URL or page state
     * After successful login, user should be redirected away from /login
     */
    validateLoginSuccess(): void {
        I.dontSeeInCurrentUrl('/login');
        I.dontSeeElement(this.locators.errorMessage);
    }

    /**
     * Validate that login failed with error message
     */
    validateLoginFailed(): void {
        I.seeInCurrentUrl('/login');
        I.seeElement(this.locators.errorMessage);
    }

    /**
     * Get the current page URL. Used to assert on redirect targets/query params
     * (e.g. after a successful passkey login) without calling `I.*` from a Scenario.
     */
    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    /**
     * Waits for the URL to leave `/login`. Passkey login on this page succeeds via
     * a client-side `navigate()` call (not a full document redirect), so this polls
     * the URL rather than waiting for a navigation/load event.
     */
    async waitForRedirectAwayFromLogin(timeoutSeconds: number = 10): Promise<void> {
        await (I.usePlaywrightTo('wait for redirect away from /login', async ({ page }) => {
            await page.waitForURL((url: URL) => !url.pathname.includes('/login'), {
                timeout: timeoutSeconds * 1000,
            });
        }) as unknown as Promise<void>);
    }

    /**
     * Waits for the wishlist-merge toast (rendered by `WishlistMergeToast` in the app
     * shell). Asserting on the `wishlistMerge` query param directly is racy — that
     * component strips it via a client-side `navigate({replace: true})` immediately
     * after mounting, so the param is only present for a moment.
     */
    waitForWishlistMergeToast(timeoutSeconds: number = 10): boolean {
        try {
            I.waitForElement(this.locators.wishlistMergeToast, timeoutSeconds);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Confirms the page is still on `/login` after a settle window. The inverse of
     * `waitForRedirectAwayFromLogin` — for edge cases (dismissed/failed passkey) where
     * a successful login would have redirected but a no-op should NOT. Resolves `false`
     * as soon as a redirect is observed, otherwise `true` once the window elapses.
     */
    async staysOnLogin(settleSeconds: number = 3): Promise<boolean> {
        return await (I.usePlaywrightTo('confirm no redirect away from /login', async ({ page }) => {
            try {
                await page.waitForURL((url: URL) => !url.pathname.includes('/login'), {
                    timeout: settleSeconds * 1000,
                });
                return false; // a redirect happened within the window
            } catch {
                return true; // stayed on /login for the whole window
            }
        }) as unknown as Promise<boolean>);
    }
}

// Export as singleton following CodeceptJS pattern
export = new LoginPage();
