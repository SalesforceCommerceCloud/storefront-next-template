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

const OTP_LENGTH = 6;

/**
 * Guest Order Lookup Page Object
 * Covers the request-code form (`/order-lookup`), the OTP verify form and
 * results view (`/order-lookup/results`), and the redacted order details.
 */
class OrderLookupPage {
    locators = {
        // Request-code form (/order-lookup)
        heading: locate('#order-lookup-heading').as('Order Lookup Heading'),
        orderNumberInput: locate('#orderNumber').as('Order Number Input'),
        emailInput: locate('#email').as('Email Input'),
        continueButton: locate('button[type="submit"]').as('Continue Button'),
        resendButton: locate('button:has-text("Resend")').as('Resend Code Button'),

        // Verify form (/order-lookup/results, unverified state)
        otpInput0: locate('#otp-input-0').as('OTP Input 0'),
        verifyErrorAlert: locate('#verify-error').as('Verify Error Alert'),
        attemptsHintLink: locate('[data-testid="attempts-hint-link"]').as('Attempts Hint Link'),
        verifySubmitButton: locate('button[type="submit"]:has-text("Verify")').as('Verify Submit Button'),

        // Results view (verified state)
        orderDetailsSection: locate('[data-section="guest-order-details"]').as('Guest Order Details Section'),
        orderNumberDisplay: locate('[data-testid="order-number"]').as('Order Number Display'),
        orderStatusBadge: locate('[data-testid="order-status-badge"]').as('Order Status Badge'),
        shippingStatusBadge: locate('[data-testid="shipping-status-badge"]').as('Shipping Status Badge'),

        // Cancel/return entry points (guest-order-actions.tsx) and their reused dialogs
        actionsSection: locate('[data-section="guest-order-actions"]').as('Guest Order Actions Section'),
        cancelOrderButton: locate('button').withText('Cancel Order').as('Cancel Order Button'),
        returnItemsButton: locate('button').withText('Return Items').as('Return Items Button'),
        cancelDialog: locate('[role="dialog"]:has-text("Cancel order")').as('Cancel Order Dialog'),
        returnDialog: locate('[role="dialog"]:has-text("Return")').as('Return Order Dialog'),
        cancelConfirmButton: locate('[role="dialog"] button')
            .withText('Confirm Cancellation')
            .as('Confirm Cancellation Button'),
        returnReviewButton: locate('[role="dialog"] button').withText('Review Return').as('Review Return Button'),
        returnSubmitButton: locate('[role="dialog"] button').withText('Submit Return').as('Submit Return Button'),
        actionsFeedbackAlert: locate('[data-testid="guest-order-actions-feedback"]').as(
            'Guest Order Actions Feedback Alert'
        ),

        // Generic error banner (rendered on both the request-code form and results page)
        errorAlert: locate('[role="alert"]').as('Order Lookup Error Alert'),
    };

    navigate(baseUrl?: string): void {
        const targetUrl = baseUrl || process.env.BASE_URL || 'http://localhost:5173';
        I.amOnPage(new URL(buildSitePath('/order-lookup'), targetUrl).toString());
    }

    navigateToResults(orderNumber: string, email: string, baseUrl?: string): void {
        const targetUrl = baseUrl || process.env.BASE_URL || 'http://localhost:5173';
        const path = `/order-lookup/results?order=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`;
        I.amOnPage(new URL(buildSitePath(path), targetUrl).toString());
    }

    fillRequestCodeForm(orderNumber: string, email: string): void {
        I.waitForElement(this.locators.orderNumberInput, 10);
        I.fillField(this.locators.orderNumberInput, orderNumber);
        I.fillField(this.locators.emailInput, email);
    }

    submitRequestCodeForm(): void {
        I.click(this.locators.continueButton);
    }

    async enterOtp(code: string): Promise<void> {
        I.waitForElement(this.locators.otpInput0, 10);
        await I.usePlaywrightTo('enter OTP digits', async ({ page }) => {
            const inputs = page.locator('input[aria-label*="Verification Code" i]');
            const count = await inputs.count();
            for (let i = 0; i < count && i < OTP_LENGTH; i++) {
                await inputs.nth(i).fill(code[i] ?? '');
            }
        });
    }

    submitVerifyForm(): void {
        I.click(this.locators.verifySubmitButton);
    }

    async isOrderDetailsVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.orderDetailsSection);
        return count > 0;
    }

    async isVerifyErrorVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.verifyErrorAlert);
        return count > 0;
    }

    async getVerifyErrorText(): Promise<string> {
        return await I.grabTextFrom(this.locators.verifyErrorAlert);
    }

    async isAttemptsHintLinkVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.attemptsHintLink);
        return count > 0;
    }

    async getOrderNumberText(): Promise<string> {
        return await I.grabTextFrom(this.locators.orderNumberDisplay);
    }

    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    async isHeadingVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.heading);
        return count > 0;
    }

    async isCancelOrderButtonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.cancelOrderButton);
        return count > 0;
    }

    async isReturnItemsButtonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.returnItemsButton);
        return count > 0;
    }

    async isCancelOrderButtonDisabled(): Promise<boolean> {
        const value = await I.grabAttributeFrom(this.locators.cancelOrderButton, 'aria-disabled');
        return value === 'true';
    }

    async isReturnItemsButtonDisabled(): Promise<boolean> {
        const value = await I.grabAttributeFrom(this.locators.returnItemsButton, 'aria-disabled');
        return value === 'true';
    }

    openCancelDialog(): void {
        I.click(this.locators.cancelOrderButton);
        I.waitForVisible(this.locators.cancelDialog, 10);
    }

    openReturnDialog(): void {
        I.click(this.locators.returnItemsButton);
        I.waitForVisible(this.locators.returnDialog, 10);
    }

    confirmCancel(): void {
        I.click(this.locators.cancelConfirmButton);
    }

    async checkFirstReturnItem(): Promise<void> {
        // The reused shadcn/Radix Checkbox renders a hidden native `<input type="checkbox">`
        // ONLY when it detects a <form> ancestor (a11y bubble-input for uncontrolled forms).
        // ReturnOrderDialog has no <form> wrapper, so the interactive element is the
        // Radix-rendered `<button role="checkbox">` — click it instead of the (absent) input.
        await I.usePlaywrightTo('check the first returnable item row', async ({ page }) => {
            await page.locator('[data-testid="return-item-row"] [role="checkbox"]').first().click();
        });
    }

    reviewReturn(): void {
        I.click(this.locators.returnReviewButton);
    }

    submitReturn(): void {
        I.click(this.locators.returnSubmitButton);
    }

    async isActionsFeedbackVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.actionsFeedbackAlert);
        return count > 0;
    }

    async getActionsFeedbackText(): Promise<string> {
        return await I.grabTextFrom(this.locators.actionsFeedbackAlert);
    }
}

// Export as singleton following CodeceptJS pattern
const orderLookupPageInstance = new OrderLookupPage();
export = orderLookupPageInstance;
