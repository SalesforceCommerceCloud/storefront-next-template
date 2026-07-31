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

// Type declarations for Turnstile API
declare global {
    interface Window {
        turnstile?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
        };
    }
}

/**
 * Passwordless Login Page Object
 */
class PasswordlessLoginPage {
    locators = {
        loginHeading: locate('h1.text-3xl, h1.text-2xl').as('Login Heading'),
        emailInput: locate('input[type="email"], input[name="email"]').as('Email Input'),
        continueButton: locate('button[type="submit"]').as('Continue Button'),
        cookieAcceptButton: locate('button:has-text("Accept"), button:has-text("Accept All"), button[id*="accept"]').as(
            'Cookie Accept Button'
        ),
        // Turnstile bot protection
        turnstileWidget: locate('[data-testid="turnstile-widget"]').as('Turnstile Widget'),
        turnstileError: locate('[data-testid="turnstile-error"]').as('Turnstile Error Message'),
        turnstileLoading: locate('[data-testid="turnstile-loading"]').as('Turnstile Loading Indicator'),
        turnstileRetryButton: locate('[data-testid="turnstile-retry"]').as('Turnstile Retry Button'),
    };

    navigate(baseUrl?: string, mode: 'passwordless' | 'password' = 'passwordless'): void {
        const targetUrl = baseUrl || process.env.BASE_URL || 'http://localhost:5173';
        const modeParam = mode === 'password' ? '?mode=password' : '';
        I.amOnPage(new URL(buildSitePath(`/login${modeParam}`), targetUrl).toString());
        I.waitForElement(this.locators.emailInput, 30);
    }

    validateLoginHeading(): void {
        I.waitForElement(this.locators.loginHeading, 10);
    }

    enterEmail(email: string): void {
        I.waitForElement(this.locators.emailInput, 10);
        I.fillField(this.locators.emailInput, email);
    }

    clickContinue(): void {
        I.waitForElement(this.locators.continueButton, 10);
        I.click(this.locators.continueButton);
    }

    async isEmailInputVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emailInput);
        return count > 0;
    }

    async isContinueButtonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.continueButton);
        return count > 0;
    }

    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    async dismissCookieDialog(): Promise<void> {
        const cookieButtonCount = await I.grabNumberOfVisibleElements(this.locators.cookieAcceptButton);
        if (cookieButtonCount > 0) {
            I.click(this.locators.cookieAcceptButton);
        }
    }

    // Turnstile bot protection methods

    async isTurnstileWidgetVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.turnstileWidget);
        return count > 0;
    }

    async isTurnstileErrorVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.turnstileError);
        return count > 0;
    }

    async isTurnstileLoadingVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.turnstileLoading);
        return count > 0;
    }

    async getTurnstileErrorText(): Promise<string> {
        return await I.grabTextFrom(this.locators.turnstileError);
    }

    clickTurnstileRetry(): void {
        I.click(this.locators.turnstileRetryButton);
    }

    async isSendButtonDisabled(): Promise<boolean> {
        const disabled = await I.grabAttributeFrom(this.locators.continueButton, 'disabled');
        return disabled !== null;
    }

    /**
     * Verify Turnstile script loaded from Cloudflare CDN
     * Feature Spec: e2e/feature-specs/checkout/turnstile-protection.spec.md
     */
    async validateTurnstileScriptLoaded(): Promise<boolean> {
        return await I.executeScript(() => {
            const scripts = Array.from(document.querySelectorAll('script[src]'));
            return scripts.some((script) =>
                (script as HTMLScriptElement).src.includes('challenges.cloudflare.com/turnstile')
            );
        });
    }

    /**
     * Check if window.turnstile object exists (Turnstile API loaded)
     */
    async isTurnstileApiLoaded(): Promise<boolean> {
        return await I.executeScript(() => {
            return typeof window.turnstile !== 'undefined';
        });
    }
}

// Export as singleton following CodeceptJS pattern
const passwordlessLoginPageInstance = new PasswordlessLoginPage();
export = passwordlessLoginPageInstance;
