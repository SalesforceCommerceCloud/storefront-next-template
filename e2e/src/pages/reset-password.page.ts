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
import type { Page, Request } from '@playwright/test';

/** Captured reset-password.data request for assertions */
type CapturedResetPasswordRequest = { url: string; method: string; postData: string | null };

type PageWithCapture = Page & {
    __capturedResetPasswordRequests?: CapturedResetPasswordRequest[];
};

/**
 * Reset Password Page Object
 * Handles interactions with the reset password form (opened from the emailed link, which carries only the token)
 */
class ResetPasswordPage {
    // Locators for reset password page elements
    locators = {
        // Headings
        resetPasswordHeading: locate('h1, h2').withText('Reset Password').as('Reset Password Heading'),

        // Form elements
        emailInput: locate('input[name="email"]').as('Email Input'),
        passwordInput: locate('input[type="password"]').first().as('Password Input'),
        passwordInputByName: locate('input[name*="password"]').first().as('Password Input by Name'),
        confirmPasswordInput: locate('input[type="password"]').last().as('Confirm Password Input'),
        confirmPasswordInputByName: locate('input[name*="confirm"]').as('Confirm Password Input by Name'),

        submitButton: locate('button[type="submit"]').as('Submit Button'),
        submitButtonByText: locate(
            'button:has-text("Submit"), button:has-text("Reset Password"), button:has-text("Save")'
        ).as('Submit Button by Text'),

        // Cookie/Consent Dialog
        cookieAcceptButton: locate('button:has-text("Accept"), button:has-text("Accept All"), button[id*="accept"]').as(
            'Cookie Accept Button'
        ),

        // Messages
        successMessage: locate('[data-testid*="success"], .success, [role="alert"]').as('Success Message'),
        errorMessage: locate('[data-testid*="error"], .error, [role="alert"]').as('Error Message'),
    };

    /**
     * Navigate to the reset password page with a token, as the emailed link does
     * @param token - Password reset token
     * @param baseUrl - Base URL of the storefront (defaults to environment BASE_URL)
     */
    navigate(token: string, baseUrl?: string): void {
        const targetUrl = baseUrl || process.env.BASE_URL || 'http://localhost:5173';
        const resetUrl = new URL(
            buildSitePath(`/reset-password?token=${encodeURIComponent(token)}`),
            targetUrl
        ).toString();
        I.amOnPage(resetUrl);
    }

    /**
     * Verify "Reset Password" heading is displayed
     */
    validateResetPasswordHeading(timeoutSeconds: number = 30): void {
        I.waitForElement(this.locators.resetPasswordHeading, timeoutSeconds);
        I.seeElement(this.locators.resetPasswordHeading);
    }

    /**
     * Dismiss cookie/consent dialog if present
     */
    async dismissCookieDialog(): Promise<void> {
        const cookieButtonCount = await I.grabNumberOfVisibleElements(this.locators.cookieAcceptButton);
        if (cookieButtonCount > 0) {
            I.click(this.locators.cookieAcceptButton);
        }
    }

    /**
     * Enter the shopper email (the link doesn't carry it, so it's empty unless this browser
     * requested the reset)
     * @param email - User email address
     */
    enterEmail(email: string): void {
        I.fillField(this.locators.emailInput, email);
    }

    /**
     * Enter new password in the password input field
     * @param password - New password to enter
     */
    enterPassword(password: string): void {
        I.fillField(this.locators.passwordInput, password);
    }

    /**
     * Enter confirm password in the confirm password input field
     * @param confirmPassword - Confirm password to enter
     */
    enterConfirmPassword(confirmPassword: string): void {
        I.fillField(this.locators.confirmPasswordInput, confirmPassword);
    }

    /**
     * Submit the reset password form
     */
    submitForm(): void {
        I.click(this.locators.submitButton);
    }

    /**
     * Set up request listener for reset-password.data POST (test-internal helper).
     */
    async setupRequestInterception(): Promise<void> {
        await (I.usePlaywrightTo('setup request interception', async ({ page }) => {
            await Promise.resolve();
            const captured: CapturedResetPasswordRequest[] = [];
            page.on('request', (request: Request) => {
                if (request.url().includes('/reset-password.data') && request.method() === 'POST') {
                    captured.push({
                        url: request.url(),
                        method: request.method(),
                        postData: request.postData(),
                    });
                }
            });
            (page as PageWithCapture).__capturedResetPasswordRequests = captured;
        }) as unknown as Promise<void>);
    }

    /**
     * Get captured reset-password.data requests (test-internal helper).
     */
    async getCapturedRequests(): Promise<CapturedResetPasswordRequest[]> {
        const result = await (I.usePlaywrightTo('get captured requests', async ({ page }) => {
            await Promise.resolve();
            return (page as PageWithCapture).__capturedResetPasswordRequests ?? [];
        }) as unknown as Promise<CapturedResetPasswordRequest[]>);
        return result ?? [];
    }

    /**
     * Capture the reset-password.data request sent while performing the given actions.
     * Call this with a callback that fills and submits the form; returns the captured request.
     */
    async captureResetPasswordRequestWhile(actions: () => void | Promise<void>): Promise<CapturedResetPasswordRequest> {
        await this.setupRequestInterception();
        await actions();
        const requests = await this.getCapturedRequests();
        if (!requests.length) {
            throw new Error('No reset-password request was captured. Ensure the form was submitted.');
        }
        return requests[0];
    }
}

// Export as singleton following CodeceptJS pattern
const resetPasswordPageInstance = new ResetPasswordPage();
export = resetPasswordPageInstance;
