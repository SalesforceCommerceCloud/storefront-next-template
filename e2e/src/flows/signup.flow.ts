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

const { I, storefrontPage, signupPage, addToCartFlow } = inject();
import type { SignupData, SignupFlowOptions } from '../types/auth.types';
import type { ProductInfo } from '../types/product.types';
import { credentialStore } from '../utils/credential-store';
import { getSiteId } from '../utils/site-id';

/**
 * Signup Flow
 * Reusable flow for shopper registration
 *
 * This flow encapsulates the complete signup journey:
 * 1. Navigate to signup page
 * 2. Generate random valid data (or use provided data)
 * 3. Handle tracking consent if present
 * 4. Fill signup form
 * 5. Submit form
 * 6. Return signup data for validation
 */
class SignupFlow {
    /**
     * Generate random signup data that passes validation
     * Email format: shopper_<timestamp>_<random>@test.com
     * Password: Meets common requirements (min 8 chars, uppercase, lowercase, number, special char)
     */
    generateRandomSignupData(): SignupData {
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');

        return {
            firstName: `Test${randomSuffix}`,
            lastName: `Shopper${randomSuffix}`,
            email: `shopper_${timestamp}_${randomSuffix}@test.com`,
            password: `Secure@123${randomSuffix}`,
            confirmPassword: `Secure@123${randomSuffix}`,
        };
    }

    /**
     * Validate that password meets common requirements
     * Adjust rules based on your storefront's actual validation
     */
    validatePassword(password: string): boolean {
        const hasMinLength = password.length >= 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return hasMinLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
    }

    /**
     * Execute the complete signup flow
     *
     * @param options - Optional flow configuration
     * @returns Promise<{signupData: SignupData, productInfo?: ProductInfo}> - The signup data and optional product info if basket created
     */
    async execute(options: SignupFlowOptions = {}): Promise<{ signupData: SignupData; productInfo?: ProductInfo }> {
        const {
            customData,
            acceptTracking = true,
            createBasket = false,
            categoryUrl = 'category/mens-clothing-jackets',
        } = options;

        try {
            // Generate random data or merge with custom data
            const signupData = customData
                ? { ...this.generateRandomSignupData(), ...customData }
                : this.generateRandomSignupData();

            // Validate password meets requirements
            if (!this.validatePassword(signupData.password)) {
                throw new Error(`Generated password does not meet validation requirements: ${signupData.password}`);
            }

            // Navigate to signup page
            signupPage.navigate();

            // Dismiss tracking consent first so form is visible, then validate page
            await storefrontPage.handleTrackingConsent(acceptTracking);
            try {
                signupPage.validatePageLoaded();
            } catch (error) {
                const currentUrl = await I.grabCurrentUrl();

                // CI can occasionally leak an authenticated session from a previous scenario.
                // Signup route redirects authenticated users away from /signup, so recover by
                // forcing guest session and retrying once.
                if (!currentUrl.includes('/signup')) {
                    await storefrontPage.logout();
                    signupPage.navigate();
                    await storefrontPage.handleTrackingConsent(acceptTracking);
                    signupPage.validatePageLoaded();
                } else {
                    throw error;
                }
            }

            // Fill signup form. The server-rendered form can have an input node
            // detached by React reconciliation during hydration ("Last Name Input"
            // disappearing between validatePageLoaded and fillField). Re-assert the
            // fragile fields right before filling, and retry the whole fill once if
            // a field still went missing mid-fill — re-running validatePageLoaded to
            // re-anchor on a freshly hydrated form before the second attempt.
            try {
                signupPage.assertFormInteractive();
                signupPage.fillSignupForm(signupData);
            } catch (fillError) {
                // oxlint-disable-next-line no-console
                console.warn(
                    `Signup form fill failed on first attempt (${
                        fillError instanceof Error ? fillError.message : String(fillError)
                    }), retrying once after re-validating the form`
                );
                signupPage.validatePageLoaded();
                signupPage.assertFormInteractive();
                signupPage.fillSignupForm(signupData);
            }

            signupPage.clickCreateAccount();

            const siteId = getSiteId();
            await storefrontPage.waitForSessionCookies('registered', siteId, 45);

            // Store credentials in credential store for login flow reuse
            credentialStore.store({
                email: signupData.email,
                password: signupData.password,
                firstName: signupData.firstName,
                lastName: signupData.lastName,
                createdAt: Date.now(),
            });

            let productInfo: ProductInfo | undefined;

            // If createBasket is true, add an item to cart and logout
            if (createBasket) {
                try {
                    // Add product to cart as registered user
                    productInfo = await addToCartFlow.execute(categoryUrl);
                } finally {
                    // Always logout to return to guest state, even if cart operation fails
                    await storefrontPage.logout();
                }
            }

            // Return signup data and product info for test validation
            return { signupData, productInfo };
        } catch (error) {
            // Save screenshot on error for debugging
            I.saveScreenshot(`signup-flow-error-${Date.now()}.png`);
            throw error;
        }
    }

    /**
     * Execute signup with a specific email address.
     * Useful for testing specific scenarios or known test accounts.
     *
     * @param email - Email address to register with
     * @param options - Optional flow configuration (same as execute, excluding customData)
     */
    async executeWithEmail(
        email: string,
        options: Omit<SignupFlowOptions, 'customData'> = {}
    ): Promise<{ signupData: SignupData; productInfo?: ProductInfo }> {
        return await this.execute({
            ...options,
            customData: { ...this.generateRandomSignupData(), email },
        });
    }
}

// Export as singleton
export = new SignupFlow();
