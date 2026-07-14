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
 * Extract customerId (gcid/rcid from `isb`) and usid (from `sub`) from a SLAS access token JWT.
 * Used by SCAPI helper calls that previously read these values from server-only cookies.
 *
 * Customer-id selection mirrors the storefront's `getCustomerIdFromClaims`:
 * - userType='registered' (default): prefer rcid, fall back to gcid
 * - userType='guest': use gcid only
 *
 * Throws if either claim is missing — both values are required by the SCAPI helpers that
 * consume the result, and an absent claim would surface as a server-side 404/400 anyway.
 */
function extractCustomerIdAndUsidFromJwt(
    accessToken: string,
    userType: 'guest' | 'registered' = 'registered'
): { customerId: string; usid: string } {
    const parts = accessToken.split('.');
    if (parts.length !== 3 || !parts[1]) {
        throw new Error('Invalid SLAS access token: expected JWT with 3 parts');
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')) as Record<string, unknown>;

    const parseDelimitedClaim = (claim: unknown, prefix: string): string | null => {
        if (typeof claim !== 'string' || !claim) return null;
        for (const segment of claim.split('::')) {
            if (segment.startsWith(prefix)) return segment.slice(prefix.length);
        }
        return null;
    };

    const isb = payload.isb;
    const sub = payload.sub;
    const gcid = parseDelimitedClaim(isb, 'gcid:');
    const rcid = parseDelimitedClaim(isb, 'rcid:');
    const customerId = userType === 'registered' ? (rcid ?? gcid) : gcid;
    const usid = parseDelimitedClaim(sub, 'usid:');

    if (!customerId) {
        throw new Error('Customer ID not found in SLAS access token isb claim');
    }
    if (!usid) {
        throw new Error('usid not found in SLAS access token sub claim');
    }
    return { customerId, usid };
}

/**
 * Checkout Page Object
 * Handles interactions with the multi-step checkout page
 *
 * Checkout Flow Steps:
 * 1. Contact Info (email)
 * 2. Shipping Address
 * 3. Shipping Method
 * 4. Payment
 * 5. Review & Place Order
 */
class CheckoutPage {
    locators = {
        checkoutContainer: locate('main').as('Checkout Container'),
        emailInput: locate('[data-testid="sf-toggle-card-contact-info"] input[type="email"]').as('Email Input'),
        phoneInputContactInfo: locate(
            '[data-testid="sf-toggle-card-contact-info"] input[name="phone"], [data-testid="sf-toggle-card-contact-info"] input[type="tel"]'
        ).as('Phone Input (Contact Info)'),
        continueToShippingButton: locate('[data-testid="sf-toggle-card-contact-info"] button[type="submit"]').as(
            'Contact Info Continue Button'
        ),
        contactInfoEditButton: locate('[data-testid="sf-toggle-card-contact-info"]')
            .find('button')
            .withText('Edit')
            .as('Contact Info Edit Button'),
        // Shipping address fields - scoped to avoid matching billing/payment fields
        firstNameInput: locate('[data-testid="sf-toggle-card-shipping-address"] input[name="firstName"]').as(
            'First Name Input'
        ),
        lastNameInput: locate('[data-testid="sf-toggle-card-shipping-address"] input[name="lastName"]').as(
            'Last Name Input'
        ),
        address1Input: locate('[data-testid="sf-toggle-card-shipping-address"] input[name="address1"]').as(
            'Address Line 1 Input'
        ),
        cityInput: locate('[data-testid="sf-toggle-card-shipping-address"] input[name="city"]').as('City Input'),
        stateSelect: locate('[data-testid="sf-toggle-card-shipping-address"] select[name="stateCode"]').as(
            'State Select'
        ),
        postalCodeInput: locate('[data-testid="sf-toggle-card-shipping-address"] input[name="postalCode"]').as(
            'Postal Code Input'
        ),
        phoneInput: locate(
            '[data-testid="sf-toggle-card-shipping-address"] input[name="phone"], [data-testid="sf-toggle-card-shipping-address"] input[type="tel"]'
        ).as('Phone Input'),
        shippingAddressSubmitButton: locate('[data-testid="sf-toggle-card-shipping-address"] button[type="submit"]').as(
            'Shipping Address Submit Button'
        ),
        shippingMethodOption: locate('input[type="radio"][name="shippingMethodId"]').as('Shipping Method Radio'),
        // Label is clickable; the radio input has aria-hidden and cannot be clicked by Playwright
        shippingMethodLabelFirst: locate('[data-testid="sf-toggle-card-shipping-options"] label[for]').as(
            'First Shipping Method Label'
        ),
        shippingMethodLabel: locate('label').as('Shipping Method Label'),
        // Payment section - billing address fields (Radix UI renders button with role="checkbox")
        useDifferentBillingCheckbox: locate('#useDifferentBilling').as('Use Different Billing Checkbox'),
        useDifferentBillingLabel: locate('label[for="useDifferentBilling"]').as('Use Different Billing Label'),
        billingFirstNameInput: locate('[data-testid="sf-toggle-card-payment"] input[name="billingFirstName"]').as(
            'Billing First Name Input'
        ),
        billingLastNameInput: locate('[data-testid="sf-toggle-card-payment"] input[name="billingLastName"]').as(
            'Billing Last Name Input'
        ),
        billingAddress1Input: locate('[data-testid="sf-toggle-card-payment"] input[name="billingAddress1"]').as(
            'Billing Address 1 Input'
        ),
        billingAddress2Input: locate('[data-testid="sf-toggle-card-payment"] input[name="billingAddress2"]').as(
            'Billing Address 2 Input'
        ),
        billingCityInput: locate('[data-testid="sf-toggle-card-payment"] input[name="billingCity"]').as(
            'Billing City Input'
        ),
        billingStateSelect: locate('[data-testid="sf-toggle-card-payment"] select[name="billingStateCode"]').as(
            'Billing State Select'
        ),
        billingPostalCodeInput: locate('[data-testid="sf-toggle-card-payment"] input[name="billingPostalCode"]').as(
            'Billing Postal Code Input'
        ),
        billingCountrySelect: locate('[data-testid="sf-toggle-card-payment"] select[name="billingCountryCode"]').as(
            'Billing Country Select'
        ),
        // Note: billing address does NOT have phone field (showPhone={false} in payment.tsx)
        cardNumberInput: locate('input[name="cardNumber"]').as('Card Number Input'),
        cardholderNameInput: locate('input[name="cardholderName"]').as('Cardholder Name Input'),
        expiryDateInput: locate('input[name="expiryDate"]').as('Expiry Date Input'),
        cvvInput: locate('input[name="cvv"], input[name="securityCode"], input[name="cvn"]').as('CVV Input'),
        submitButton: locate('button[type="submit"]').as('Submit Button'),
        shippingAddressEditButton: locate('[data-testid="sf-toggle-card-shipping-address"]')
            .find('button')
            .withText('Edit')
            .as('Shipping Address Edit Button'),
        shippingOptionsEditButton: locate('[data-testid="sf-toggle-card-shipping-options"]')
            .find('button')
            .withText('Edit')
            .as('Shipping Options Edit Button'),
        paymentEditButton: locate('[data-testid="sf-toggle-card-payment"]')
            .find('button')
            .withText('Edit')
            .as('Payment Edit Button'),
        orderNumberText: locate('span.text-primary').as('Order Number'),
        confirmationMessage: locate('text=/thank you|order placed|order confirmed|your order is confirmed/i').as(
            'Confirmation Message'
        ),
        errorMessage: locate('[role="alert"]').as('Error Message'),
        // Shown when cart is empty on checkout (e.g. add-to-cart failed). Use as fallback to retry with a different product.
        emptyCartMessage: locate('text=/No items in cart\\. Add items before checkout\\./i').as('Empty Cart Message'),
        // My Cart (collapsible sidebar on checkout)
        myCartToggle: locate('[data-testid="my-cart-toggle"]').as('My Cart Toggle'),
        myCartItems: locate('[data-testid^="my-cart-item-"]').as('My Cart Items'),
        // Promotion-related content within a My Cart item (label "Promotions" or "Saved" badge)
        myCartItemPromotionOrSaved: locate('text=/Promotions|Saved\\s/').as('My Cart Item Promotion or Saved'),

        // Saved payment methods (checkout payment step for registered shoppers)
        savedPaymentRadio: locate('[data-testid="sf-toggle-card-payment"] [role="radio"]').as('Saved Payment Radio'),
        orderSummary: locate('[data-testid="sf-order-summary"]').as('Order Summary'),

        // Saved addresses list (checkout shipping step for registered shoppers)
        savedAddressRadioGroup: locate('[data-testid="sf-toggle-card-shipping-address"] [role="radiogroup"]').as(
            'Saved Addresses Radio Group'
        ),
        savedAddressRadio: (addressId: string) =>
            locate(`#saved-address-${addressId}`).as(`Saved Address Radio: ${addressId}`),
        savedAddressCard: locate(
            '[data-testid="sf-toggle-card-shipping-address"] [role="radiogroup"] [role="radio"]'
        ).as('Saved Address Card'),
        addNewAddressButton: locate('[data-testid="sf-toggle-card-shipping-address"] button')
            .withText('Add new address')
            .as('Add New Address Button'),
        editAddressLink: locate('[data-testid="sf-toggle-card-shipping-address"] button')
            .withText('Edit Address')
            .as('Edit Address Link'),
        viewAllButton: locate('[data-testid="sf-toggle-card-shipping-address"] button')
            .withText('View all')
            .as('View All Button'),
        viewLessButton: locate('[data-testid="sf-toggle-card-shipping-address"] button')
            .withText('View less')
            .as('View Less Button'),
        continueToShippingOptionsButton: locate('[data-testid="sf-toggle-card-shipping-address"] button')
            .withText('Continue to Shipping Method')
            .as('Continue to Shipping Options Button'),
        continueToPaymentButton: locate('[data-testid="sf-toggle-card-shipping-options"] button')
            .withText('Continue to Payment')
            .as('Continue to Payment Button'),

        // Address modal (add/edit during checkout)
        addressModal: locate('[role="dialog"][aria-labelledby="address-modal-title"]').as('Address Modal'),
        addressModalTitle: locate('#address-modal-title').as('Address Modal Title'),
        addressModalFirstNameInput: locate('[role="dialog"] input[name="firstName"]').as(
            'Address Modal First Name Input'
        ),
        addressModalLastNameInput: locate('[role="dialog"] input[name="lastName"]').as('Address Modal Last Name Input'),
        addressModalAddress1Input: locate('[role="dialog"] input[name="address1"]').as(
            'Address Modal Address Line 1 Input'
        ),
        addressModalAddress2Input: locate('[role="dialog"] input[name="address2"]').as(
            'Address Modal Address Line 2 Input'
        ),
        addressModalCityInput: locate('[role="dialog"] input[name="city"]').as('Address Modal City Input'),
        addressModalStateSelect: locate('[role="dialog"] select[name="stateCode"]').as('Address Modal State Select'),
        addressModalPostalCodeInput: locate('[role="dialog"] input[name="postalCode"]').as(
            'Address Modal Postal Code Input'
        ),
        addressModalCountrySelect: locate('[role="dialog"] select[name="countryCode"]').as(
            'Address Modal Country Select'
        ),
        addressModalSaveButton: locate('[role="dialog"] button[type="submit"]')
            .withText('Save')
            .as('Address Modal Save Button'),
        addressModalCancelButton: locate('[role="dialog"] button[type="button"]')
            .withText('Cancel')
            .as('Address Modal Cancel Button'),

        // Promo code form (inside Order Summary accordion on checkout)
        promoCodeAccordionTrigger: locate('[data-testid="checkout-order-summary-sidebar"] button')
            .withText('Enter a Promotion Code')
            .as('Promo Code Accordion Trigger'),
        promoCodeForm: locate('[data-testid="checkout-order-summary-sidebar"] [data-testid="promo-code-form"]').as(
            'Promo Code Form'
        ),
        promoCodeInput: locate(
            '[data-testid="checkout-order-summary-sidebar"] [data-testid="promo-code-form"] input[name="code"]'
        ).as('Promo Code Input'),
        promoCodeApplyButton: locate(
            '[data-testid="checkout-order-summary-sidebar"] [data-testid="promo-code-form"] button[type="submit"]'
        ).as('Promo Code Apply Button'),
        promoCodeError: locate(
            '[data-testid="checkout-order-summary-sidebar"] [data-testid="promo-code-form"] [data-slot="form-message"]'
        ).as('Promo Code Error'),
    };

    navigate(): void {
        I.amOnPage(buildSitePath('/checkout'));
    }

    navigateWithPrefix(prefixedPath: string): void {
        I.amOnPage(prefixedPath);
    }

    /**
     * Retryable checkout navigation for transient browser/server aborts.
     */
    async navigateWithRetry(maxAttempts: number = 3): Promise<void> {
        const targetPath = buildSitePath('/checkout');
        const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
        const targetUrl = new URL(targetPath, baseUrl).toString();
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await (I.usePlaywrightTo('navigate to checkout with retry', async ({ page }) => {
                    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30_000 });
                }) as unknown as Promise<void>);
                return;
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }

    validatePageLoaded(): void {
        I.seeElement(this.locators.checkoutContainer);
        // Wait for contact info card content to be rendered (lazy-loaded).
        // Registered users with disableEdit have no button in summary mode, so check content instead.
        I.waitForElement(locate('[data-testid="sf-toggle-card-contact-info-content"]'), 25);
    }

    /**
     * Returns true if checkout shows the empty-cart message (add-to-cart failed or cart was cleared).
     * Use as fallback to detect that we need to try adding a different product and navigate to checkout again.
     */
    async isEmptyCartShown(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emptyCartMessage);
        return count > 0;
    }

    async fillContactInfo(email: string, phone?: string): Promise<void> {
        // If contact info is in summary mode (registered user), click Edit to expand the form
        const editButtonVisible = await I.grabNumberOfVisibleElements(this.locators.contactInfoEditButton);
        if (editButtonVisible > 0) {
            I.click(this.locators.contactInfoEditButton);
        }
        I.waitForElement(this.locators.emailInput, 5);

        // Check if email is already populated (e.g., for registered users)
        const currentEmail = await I.grabValueFrom(this.locators.emailInput);

        if (!currentEmail || currentEmail.trim() === '') {
            // Email field is empty, fill it
            I.fillField(this.locators.emailInput, email);
        } else {
            // Email is pre-filled - clear and re-enter to ensure validation triggers
            I.click(this.locators.emailInput);
            I.pressKey(['CommandOrControl', 'a']);
            I.pressKey('Backspace');
            I.fillField(this.locators.emailInput, email);
        }

        // Blur the email field to trigger validation
        I.pressKey('Tab');

        // Phone is required — fill with provided value or a default
        const phoneValue = phone || '5551234567';
        const phoneFieldCount = await I.grabNumberOfVisibleElements(this.locators.phoneInputContactInfo);
        if (phoneFieldCount > 0) {
            I.fillField(this.locators.phoneInputContactInfo, phoneValue);
            I.pressKey('Tab');
        }

        // Click "Continue to Shipping" - use regular click so form submit fires properly (forceClick can bypass form submission)
        I.waitForElement(this.locators.continueToShippingButton, 20);
        I.scrollTo(this.locators.continueToShippingButton);
        I.click(this.locators.continueToShippingButton);

        // Wait for contact info to submit and shipping address form to render (API round-trip + step transition)
        I.waitForElement(this.locators.firstNameInput, 30);
    }

    /**
     * Click "Continue to Shipping" from contact info step.
     * Idempotent: if already on shipping step, just waits for form.
     */
    async continueFromContactInfo(): Promise<void> {
        const hasButton = (await I.grabNumberOfVisibleElements(this.locators.continueToShippingButton)) > 0;
        if (hasButton) {
            I.scrollTo(this.locators.continueToShippingButton);
            I.click(this.locators.continueToShippingButton);
        }
        I.waitForElement(this.locators.firstNameInput, 30);
    }

    async fillShippingAddress(address: {
        firstName: string;
        lastName: string;
        address1: string;
        city: string;
        stateCode: string;
        postalCode: string;
        phone?: string;
    }): Promise<void> {
        // Registered users with saved address may have shipping in preview mode (Edit button, no form)
        const inPreview = (await I.grabNumberOfVisibleElements(this.locators.shippingAddressEditButton)) > 0;
        if (inPreview) {
            I.waitForElement(locate('[data-testid="sf-toggle-card-shipping-options"]').find('button'), 30);
            return;
        }
        I.waitForElement(this.locators.firstNameInput, 30);

        I.fillField(this.locators.firstNameInput, address.firstName);
        I.fillField(this.locators.lastNameInput, address.lastName);
        I.fillField(this.locators.address1Input, address.address1);
        I.fillField(this.locators.cityInput, address.city);
        I.fillField(this.locators.postalCodeInput, address.postalCode);
        I.selectOption(this.locators.stateSelect, address.stateCode);

        I.click(this.locators.shippingAddressSubmitButton);

        I.waitForElement(this.locators.shippingAddressEditButton);
        I.waitForElement(this.locators.shippingMethodOption, 30);
    }

    /**
     * Click submit on shipping address step (Continue to Shipping Options).
     */
    async continueFromShippingAddress(): Promise<void> {
        const hasButton = (await I.grabNumberOfVisibleElements(this.locators.shippingAddressSubmitButton)) > 0;
        if (hasButton) {
            I.click(this.locators.shippingAddressSubmitButton);
            I.waitForElement(this.locators.shippingAddressEditButton);
        }
        I.waitForElement(this.locators.shippingMethodOption, 30);
    }

    async selectShippingMethod(index: number = 0): Promise<void> {
        // Registered users may have shipping method prefilled (Edit button, no form)
        const optionsInPreview = (await I.grabNumberOfVisibleElements(this.locators.shippingOptionsEditButton)) > 0;
        if (optionsInPreview) {
            // Shipping options in preview - payment section is next; wait for it to be ready
            I.waitForElement(locate('[data-testid="sf-toggle-card-payment"]').find('button'));
            return;
        }
        I.waitForElement(this.locators.shippingMethodOption);

        if (index === 0) {
            I.click(this.locators.continueToPaymentButton);
            I.waitForElement('[data-testid="sf-toggle-card-payment-content"]', 10);
            return;
        }

        // Click the label (not the hidden radio input) - Radix UI uses aria-hidden on the input
        const labelOption = this.locators.shippingMethodLabelFirst.at(index + 1);
        I.click(labelOption);

        I.click(this.locators.continueToPaymentButton);
        I.waitForElement('[data-testid="sf-toggle-card-payment-content"]', 10);
    }

    /** Select first shipping method (radio); does not submit. Call continueFromShippingOptions to advance. */
    async selectFirstShippingMethod(): Promise<void> {
        const inPreview = (await I.grabNumberOfVisibleElements(this.locators.shippingOptionsEditButton)) > 0;
        if (inPreview) return;
        I.waitForElement(this.locators.shippingMethodOption, 10);
        const count = await I.grabNumberOfVisibleElements(this.locators.shippingMethodOption);
        if (count > 0) {
            // Click the label instead of the radio input; Radix UI hides the input (aria-hidden)
            // and Playwright cannot click hidden elements
            I.click(this.locators.shippingMethodLabelFirst.first());
        }
    }

    /** Click "Continue to Payment" from shipping options step. */
    continueFromShippingOptions(): void {
        I.waitForElement(this.locators.continueToPaymentButton, 10);
        I.scrollTo(this.locators.continueToPaymentButton);
        I.click(this.locators.continueToPaymentButton);
        I.waitForElement('[data-testid="sf-toggle-card-payment-content"]', 10);
    }

    /** Alias for fillPaymentInfo for specs that use fillPayment. */
    async fillPayment(payment: {
        cardNumber: string;
        cardholderName: string;
        expiryDate: string;
        cvv: string;
    }): Promise<void> {
        await this.fillPaymentInfo(payment);
    }

    /**
     * Fill payment form fields only (does not click Place Order).
     * Use when the flow requires additional steps before placing order (e.g. create account checkbox, OTP modal).
     */
    fillPaymentFieldsOnly(payment: {
        cardNumber: string;
        cardholderName: string;
        expiryDate: string;
        cvv: string;
    }): void {
        I.waitForElement(this.locators.cardNumberInput, 5);
        I.fillField(this.locators.cardNumberInput, payment.cardNumber);
        I.waitForElement(this.locators.cardholderNameInput, 5);
        I.fillField(this.locators.cardholderNameInput, payment.cardholderName);
        I.fillField(this.locators.expiryDateInput, payment.expiryDate);
        I.fillField(this.locators.cvvInput, payment.cvv);
    }

    async fillPaymentInfo(payment: {
        cardNumber: string;
        cardholderName: string;
        expiryDate: string;
        cvv: string;
    }): Promise<void> {
        // Registered users may have payment prefilled (Edit button, no form)
        const paymentInPreview = (await I.grabNumberOfVisibleElements(this.locators.paymentEditButton)) > 0;
        if (paymentInPreview) {
            const placeOrderBtn = locate('button[type="submit"]').withText('Place Order');
            I.waitForElement(placeOrderBtn, 10);
            I.scrollTo(placeOrderBtn);
            I.click(placeOrderBtn);
            I.waitForElement(this.locators.confirmationMessage, 30);
            return;
        }
        I.waitForElement(this.locators.cardNumberInput, 5);
        I.fillField(this.locators.cardNumberInput, payment.cardNumber);
        I.waitForElement(this.locators.cardholderNameInput, 5);
        I.fillField(this.locators.cardholderNameInput, payment.cardholderName);
        I.fillField(this.locators.expiryDateInput, payment.expiryDate);
        I.fillField(this.locators.cvvInput, payment.cvv);
        const placeOrderBtn = locate('button[type="submit"]').withText('Place Order');
        I.waitForElement(placeOrderBtn, 10);
        I.click(placeOrderBtn);
        I.waitForElement(this.locators.confirmationMessage, 30);
    }

    waitForOrderConfirmation(timeout: number = 60): void {
        // Wait for redirect to order confirmation page or confirmation message
        I.waitForURL(/\/order-confirmation\//, timeout);
        I.waitForElement(this.locators.confirmationMessage);
    }

    async getOrderNumber(): Promise<string> {
        const orderNumberText = await I.grabTextFrom(this.locators.orderNumberText);
        return orderNumberText.trim();
    }

    validateOrderConfirmation(): void {
        I.seeElement(this.locators.confirmationMessage);
        I.seeElement(this.locators.orderNumberText);
    }

    /**
     * Wait for contact section to be ready (form or preview) so prefilled email can be read.
     * For registered users the section may load after profile data is fetched.
     */
    async waitForContactSectionReady(timeoutSeconds: number = 20): Promise<void> {
        const deadline = Date.now() + timeoutSeconds * 1000;
        while (Date.now() < deadline) {
            const hasEdit = (await I.grabNumberOfVisibleElements(this.locators.contactInfoEditButton)) > 0;
            const hasEmailInput = (await I.grabNumberOfVisibleElements(this.locators.emailInput)) > 0;
            if (hasEdit || hasEmailInput) return;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    async getPrefilledEmail(): Promise<string> {
        await this.waitForContactSectionReady();
        const emailFieldCount = await I.grabNumberOfVisibleElements(this.locators.emailInput);
        if (emailFieldCount === 0) {
            return '';
        }
        return await I.grabValueFrom(this.locators.emailInput);
    }

    async isShippingAddressPrefilled(): Promise<boolean> {
        try {
            const firstName = await I.grabValueFrom(this.locators.firstNameInput);
            return firstName.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Check if contact info section is in preview/summary mode (no email form visible).
     * Registered users with disableEdit won't have an Edit button, so we detect
     * summary mode by checking that the email input (form) is absent.
     */
    async isContactInfoInPreviewMode(): Promise<boolean> {
        const emailFieldCount = await I.grabNumberOfVisibleElements(this.locators.emailInput);
        return emailFieldCount === 0;
    }

    /**
     * Check if shipping address section is in preview/summary mode (Edit button visible)
     */
    async isShippingAddressInPreviewMode(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.shippingAddressEditButton);
        return count > 0;
    }

    /**
     * Check if shipping options section is in preview/summary mode (Edit button visible)
     */
    async isShippingOptionsInPreviewMode(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.shippingOptionsEditButton);
        return count > 0;
    }

    /**
     * Check if payment section is in preview/summary mode (Edit button visible)
     */
    async isPaymentInPreviewMode(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.paymentEditButton);
        return count > 0;
    }

    /**
     * Validate that all checkout sections (contact info, shipping address, shipping options, payment)
     * are prefilled and in preview mode (showing Edit buttons, not forms).
     * Polls for up to 30s to allow profile data to load for registered shoppers.
     */
    async validateAllCheckoutSectionsPrefilled(): Promise<void> {
        const timeoutMs = 30_000;
        const pollIntervalMs = 2_000;
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const contactPreview = await this.isContactInfoInPreviewMode();
            const shippingPreview = await this.isShippingAddressInPreviewMode();
            const shippingOptionsPreview = await this.isShippingOptionsInPreviewMode();
            const paymentPreview = await this.isPaymentInPreviewMode();

            if (contactPreview && shippingPreview && shippingOptionsPreview && paymentPreview) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const contactPreview = await this.isContactInfoInPreviewMode();
        const shippingPreview = await this.isShippingAddressInPreviewMode();
        const shippingOptionsPreview = await this.isShippingOptionsInPreviewMode();
        const paymentPreview = await this.isPaymentInPreviewMode();
        throw new Error(
            `Checkout sections not all in preview mode after ${timeoutMs / 1000}s: contact=${contactPreview}, shipping=${shippingPreview}, shippingOptions=${shippingOptionsPreview}, payment=${paymentPreview}`
        );
    }

    /**
     * Click "Create account for faster checkout" checkbox and wait for either OTP modal or error.
     * The OTP modal appears when the registration API succeeds; an error appears when it fails
     * (e.g. passwordless auth not configured in the test environment).
     *
     * @returns true if OTP modal appeared, false if error appeared or timeout (API unavailable)
     */
    async clickCreateAccountCheckboxAndWaitForModalOrError(timeoutSeconds: number = 30): Promise<boolean> {
        I.waitForElement('[data-testid="create-account-checkbox"]', 10);
        I.scrollTo('[data-testid="create-account-checkbox"]');
        I.click('#create-account-checkbox');

        const deadline = Date.now() + timeoutSeconds * 1000;
        const otpModalSelector = '[data-testid="otp-modal"]';
        while (Date.now() < deadline) {
            const modalCount = await I.grabNumberOfVisibleElements(otpModalSelector);
            if (modalCount > 0) return true;

            // Check for registration error (e.g. "Unable to send verification code")
            const registerSection = locate('[data-testid="register-customer-checkbox"]');
            const hasError = (await I.grabNumberOfVisibleElements(registerSection.find('.text-destructive'))) > 0;
            if (hasError) return false;

            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
    }

    /**
     * Click Place Order button (when checkout is fully prefilled)
     */
    clickPlaceOrder(): void {
        const placeOrderLocator = locate('button[type="submit"]').withText('Place Order');
        I.waitForElement(placeOrderLocator, 10);
        I.scrollTo(placeOrderLocator);
        I.click(placeOrderLocator);
    }

    /**
     * Complete checkout when all sections are prefilled (registered shopper with full profile).
     * Validates prefilled state, clicks Place Order, waits for confirmation.
     *
     * @returns Promise<string> - Order number
     */
    async completePrefilledCheckout(): Promise<string> {
        await this.validateAllCheckoutSectionsPrefilled();
        this.clickPlaceOrder();
        this.waitForOrderConfirmation();
        this.validateOrderConfirmation();
        return await this.getOrderNumber();
    }

    async completeCheckout(checkoutData: {
        email: string;
        phone?: string;
        shippingAddress: {
            firstName: string;
            lastName: string;
            address1: string;
            city: string;
            stateCode: string;
            postalCode: string;
            phone?: string;
        };
        payment: {
            cardNumber: string;
            cardholderName: string;
            expiryDate: string;
            cvv: string;
        };
    }): Promise<string> {
        // For registered shoppers, checkout skips steps where basket already has data
        // If basket has contact info (email), this step is skipped and email field is not present

        const emailFieldCount = await I.grabNumberOfVisibleElements(this.locators.emailInput);
        if (emailFieldCount > 0) {
            await this.fillContactInfo(checkoutData.email, checkoutData.phone || checkoutData.shippingAddress.phone);
        }

        await this.fillShippingAddress(checkoutData.shippingAddress);
        await this.selectShippingMethod(0);
        await this.fillPaymentInfo(checkoutData.payment);
        this.waitForOrderConfirmation();
        this.validateOrderConfirmation();
        return await this.getOrderNumber();
    }

    /**
     * Wait for My Cart items to be present in the DOM.
     * Items are always visible (no accordion), so this just waits for render.
     */
    expandMyCart(): void {
        I.waitForElement(this.locators.myCartToggle);
        I.waitForElement(this.locators.myCartItems, 30);
    }

    /**
     * Validate that My Cart shows at least one item with product image, price, and optional promotions.
     * Uses DOM checks because the accordion content can be present but not considered visible by Playwright (overflow-hidden).
     */
    async validateMyCartDisplaysItemsWithPriceImageAndPromotions(): Promise<void> {
        I.seeElement(this.locators.myCartToggle);
        const result = (await I.executeScript(() => {
            const items = document.querySelectorAll('[data-testid^="my-cart-item-"]');
            if (items.length === 0) return { ok: false, reason: 'no items' };
            const first = items[0];
            const hasImg = first.querySelector('img') !== null;
            const hasLink = first.querySelector('a') !== null;
            const hasPrice = first.querySelector('[aria-label*="price"]') !== null;
            const text = first.textContent ?? '';
            const hasPromotionOrSaved = /Promotions|Saved\s/i.test(text);
            return {
                ok: hasImg && hasLink && hasPrice,
                itemCount: items.length,
                hasImg,
                hasLink,
                hasPrice,
                hasPromotionOrSaved,
            };
        })) as {
            ok: boolean;
            reason?: string;
            itemCount: number;
            hasImg: boolean;
            hasLink: boolean;
            hasPrice: boolean;
            hasPromotionOrSaved: boolean;
        };
        if (!result.ok) {
            if (result.reason) {
                throw new Error('My Cart should display at least one item');
            }
            throw new Error(
                `My Cart first item missing required elements: img=${result.hasImg} link=${result.hasLink} price=${result.hasPrice}`
            );
        }
    }

    // =========================================================================
    // Shipping Address Modal & Saved Addresses (Registered Shopper)
    // =========================================================================

    /**
     * Check if saved addresses list is visible in the shipping step
     */
    async isSavedAddressesListVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.savedAddressRadioGroup);
        return count > 0;
    }

    /**
     * Get the number of visible saved address radio options
     */
    async getSavedAddressCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.savedAddressCard);
    }

    /**
     * Click "Add New Address" in the saved addresses list
     */
    clickAddNewAddress(): void {
        I.click(this.locators.addNewAddressButton);
        I.waitForElement(this.locators.addressModal, 5);
    }

    /**
     * Click "Edit Address" on a saved address card
     * @param index - 0-based index of the address to edit
     */
    clickEditAddress(index: number = 0): void {
        I.click(locate(this.locators.editAddressLink).at(index + 1));
        I.waitForElement(this.locators.addressModal, 5);
    }

    /**
     * Check if the address modal is open
     */
    async isAddressModalOpen(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.addressModal);
        return count > 0;
    }

    /**
     * Get the title text of the address modal ("Add Address" or "Edit Address")
     */
    async getAddressModalTitle(): Promise<string> {
        return await I.grabTextFrom(this.locators.addressModalTitle);
    }

    /**
     * Fill the address modal form fields
     */
    fillAddressModal(address: {
        firstName: string;
        lastName: string;
        address1: string;
        address2?: string;
        city: string;
        stateCode: string;
        postalCode: string;
    }): void {
        I.fillField(this.locators.addressModalFirstNameInput, address.firstName);
        I.fillField(this.locators.addressModalLastNameInput, address.lastName);
        I.fillField(this.locators.addressModalAddress1Input, address.address1);
        if (address.address2) {
            I.fillField(this.locators.addressModalAddress2Input, address.address2);
        }
        I.fillField(this.locators.addressModalCityInput, address.city);
        I.selectOption(this.locators.addressModalStateSelect, address.stateCode);
        I.fillField(this.locators.addressModalPostalCodeInput, address.postalCode);
    }

    /**
     * Clear and fill a single field in the address modal (for editing)
     */
    clearAndFillAddressModalField(locator: CodeceptJS.LocatorOrString, value: string): void {
        I.click(locator);
        I.pressKey(['CommandOrControl', 'a']);
        I.pressKey('Backspace');
        I.fillField(locator, value);
    }

    /**
     * Click Save on the address modal
     */
    clickAddressModalSave(): void {
        I.click(this.locators.addressModalSaveButton);
    }

    /**
     * Click Cancel on the address modal
     */
    clickAddressModalCancel(): void {
        I.click(this.locators.addressModalCancelButton);
    }

    /**
     * Wait for address modal to close
     */
    waitForAddressModalClosed(timeout: number = 10): void {
        I.waitForInvisible(this.locators.addressModal, timeout);
    }

    /**
     * Click "View all" to expand the saved addresses list
     */
    clickViewAllAddresses(): void {
        I.click(this.locators.viewAllButton);
    }

    /**
     * Click "View less" to collapse the saved addresses list
     */
    clickViewLessAddresses(): void {
        I.click(this.locators.viewLessButton);
    }

    /**
     * Check if "View all" button is visible
     */
    async isViewAllVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.viewAllButton);
        return count > 0;
    }

    /**
     * Check if "View less" button is visible
     */
    async isViewLessVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.viewLessButton);
        return count > 0;
    }

    /**
     * Check if "Add New Address" button is visible in the saved addresses list
     */
    async isAddNewAddressButtonVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.addNewAddressButton);
        return count > 0;
    }

    /**
     * Click "Continue to Shipping Options" in the saved addresses step.
     * Waits for the shipping address step to return to preview mode.
     */
    clickContinueToShippingOptions(): void {
        I.click(this.locators.continueToShippingOptionsButton);
    }

    clickContinueToPayment(): void {
        I.click(this.locators.continueToPaymentButton);
    }

    /**
     * Expand shipping address step into edit mode (click Edit button)
     */
    expandShippingAddressStep(): void {
        I.click(this.locators.shippingAddressEditButton);
    }

    /**
     * Expand shipping address step from auto-applied preview mode to reveal the
     * saved addresses list (radio buttons + Add New Address).
     * For registered shoppers whose address is auto-applied to the basket.
     */
    async expandShippingAddressForSavedAddresses(): Promise<void> {
        this.validatePageLoaded();
        const shippingInPreview = await this.isShippingAddressInPreviewMode();
        if (shippingInPreview) {
            this.expandShippingAddressStep();
        }
    }

    expandShippingOptionsStep(): void {
        I.click(this.locators.shippingOptionsEditButton);
    }

    /**
     * Edit the city field on the address modal (clear existing value, type new one).
     */
    editAddressModalCity(newCity: string): void {
        this.clearAndFillAddressModalField(this.locators.addressModalCityInput, newCity);
    }

    /**
     * Get the value from a field in the address modal
     */
    async getAddressModalFieldValue(fieldName: string): Promise<string> {
        const field = locate(`[role="dialog"] input[name="${fieldName}"], [role="dialog"] select[name="${fieldName}"]`);
        return await I.grabValueFrom(field);
    }

    /**
     * Get all visible text from the shipping address preview/summary section.
     * Useful for verifying which address is applied to the basket after selection/add/edit.
     */
    async getShippingAddressPreviewText(): Promise<string> {
        const section = locate('[data-testid="sf-toggle-card-shipping-address"]');
        return await I.grabTextFrom(section);
    }

    /**
     * Get the number of items in the My Cart section (DOM count).
     * Scoped to the desktop sidebar to avoid double-counting mobile + desktop instances.
     * Useful for validating basket context sync after client-side navigation.
     */
    async getMyCartItemCount(): Promise<number> {
        const count = (await I.executeScript(() => {
            const sidebar = document.querySelector('[data-testid="checkout-order-summary-sidebar"]');
            if (!sidebar) return document.querySelectorAll('[data-testid^="my-cart-item-"]').length;
            return sidebar.querySelectorAll('[data-testid^="my-cart-item-"]').length;
        })) as number;
        return count;
    }

    // =========================================================================
    // Billing Address Methods (Payment Section)
    // =========================================================================

    /**
     * Check if the "Use a different billing address" checkbox is checked.
     */
    async isUsingDifferentBillingAddress(): Promise<boolean> {
        I.waitForElement(this.locators.useDifferentBillingCheckbox, 15);
        const ariaChecked = await I.grabAttributeFrom(this.locators.useDifferentBillingCheckbox, 'aria-checked');
        return ariaChecked === 'true';
    }

    /**
     * Check if the "Save payment for future use" checkbox is visible
     * @returns Promise<boolean> - True if checkbox is visible
     */
    async isSavePaymentCheckboxVisible(): Promise<boolean> {
        let visible = false;
        await (I.usePlaywrightTo('check save payment checkbox visibility', async ({ page }) => {
            const paymentSection = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const checkbox = paymentSection.locator('[role="checkbox"]').filter({
                has: page.locator('[aria-label*="Save payment"]'),
            });
            const labelFallback = paymentSection.locator('text=Save payment method for future use');
            visible =
                ((await checkbox.count()) > 0 && (await checkbox.first().isVisible())) ||
                ((await labelFallback.count()) > 0 && (await labelFallback.first().isVisible()));
        }) as unknown as Promise<void>);
        return visible;
    }

    /**
     * Get visibility count of the "Save payment for future use" checkbox
     * Used to verify the checkbox is hidden/shown
     */
    async getSavePaymentCheckboxVisibilityCount(): Promise<number> {
        let count = 0;
        await (I.usePlaywrightTo('count save payment checkboxes', async ({ page }) => {
            const paymentSection = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const checkboxes = paymentSection.locator('[role="checkbox"]').filter({
                has: page.locator('[aria-label*="Save payment"]'),
            });
            count = await checkboxes.count();
        }) as unknown as Promise<void>);
        return count;
    }

    /**
     * Check the "Save payment for future use" checkbox
     */
    async checkSavePaymentCheckbox(): Promise<void> {
        await (I.usePlaywrightTo('check save payment checkbox', async ({ page }) => {
            const paymentSection = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const label = paymentSection.locator('label:has-text("Save payment method for future use")');
            await label.waitFor({ state: 'visible', timeout: 10_000 });
            await label.click();
        }) as unknown as Promise<void>);
    }

    // Backward-compatible alias; prefer isUsingDifferentBillingAddress().
    async isUseDifferentBillingAddressChecked(): Promise<boolean> {
        return this.isUsingDifferentBillingAddress();
    }

    /**
     * Toggle the "Use a different billing address" checkbox.
     */
    async toggleUseDifferentBillingAddress(): Promise<void> {
        I.waitForElement(this.locators.useDifferentBillingLabel, 15);
        I.click(this.locators.useDifferentBillingLabel);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    /**
     * Check the "Use a different billing address" checkbox to show billing fields.
     */
    async checkUseDifferentBillingAddress(): Promise<void> {
        const isChecked = await this.isUsingDifferentBillingAddress();
        if (!isChecked) {
            await this.toggleUseDifferentBillingAddress();
        }
    }

    /**
     * Uncheck the "Use a different billing address" checkbox to hide billing fields.
     */
    async uncheckUseDifferentBillingAddress(): Promise<void> {
        const isChecked = await this.isUsingDifferentBillingAddress();
        if (isChecked) {
            await this.toggleUseDifferentBillingAddress();
        }
    }

    /**
     * Check if the billing address section is visible (form fields or saved-address dropdown).
     */
    async areBillingAddressFieldsVisible(): Promise<boolean> {
        const fieldsVisible = (await I.grabNumberOfVisibleElements(this.locators.billingFirstNameInput)) > 0;
        if (fieldsVisible) return true;
        // Check for the billing address dropdown (may show "Select an address" or a pre-selected address)
        const dropdownVisible = await (I.usePlaywrightTo('check billing dropdown', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const dropdown = paymentContent.locator('button').filter({
                has: page.locator('svg.lucide-chevron-down, svg[class*="chevron"]'),
            });
            return await dropdown
                .first()
                .isVisible()
                .catch(() => false);
        }) as unknown as Promise<boolean>);
        return dropdownVisible;
    }

    /**
     * Check if the billing address form inputs are visible (not the dropdown, but the actual form fields).
     * Returns true only when the address form is rendered (e.g. when "Add new address" is selected).
     */
    async isBillingAddressFormVisible(): Promise<boolean> {
        return (await I.grabNumberOfVisibleElements(this.locators.billingFirstNameInput)) > 0;
    }

    /**
     * Get all billing address field values as an object
     * Note: billing address does NOT have phone field (showPhone={false})
     */
    async getBillingAddressFieldValues(): Promise<{
        firstName: string;
        lastName: string;
        address1: string;
        address2: string;
        city: string;
        stateCode: string;
        postalCode: string;
        countryCode: string;
    }> {
        I.waitForElement(this.locators.billingFirstNameInput, 5);

        return {
            firstName: await I.grabValueFrom(this.locators.billingFirstNameInput),
            lastName: await I.grabValueFrom(this.locators.billingLastNameInput),
            address1: await I.grabValueFrom(this.locators.billingAddress1Input),
            address2: await I.grabValueFrom(this.locators.billingAddress2Input),
            city: await I.grabValueFrom(this.locators.billingCityInput),
            stateCode: await I.grabValueFrom(this.locators.billingStateSelect),
            postalCode: await I.grabValueFrom(this.locators.billingPostalCodeInput),
            countryCode: await I.grabValueFrom(this.locators.billingCountrySelect),
        };
    }

    /**
     * Validate that billing address fields are pre-filled with the shipping address.
     * After toggling "Use a different billing address", the form pre-fills with the
     * shipping address as a starting point for the user to edit.
     */
    async validateBillingAddressMatchesShipping(shippingAddress: {
        firstName: string;
        lastName: string;
        address1: string;
        city: string;
        stateCode: string;
        postalCode: string;
    }): Promise<void> {
        const values = await this.getBillingAddressFieldValues();
        const errors: string[] = [];

        if (values.firstName !== shippingAddress.firstName)
            errors.push(`firstName: "${values.firstName}" (expected: "${shippingAddress.firstName}")`);
        if (values.lastName !== shippingAddress.lastName)
            errors.push(`lastName: "${values.lastName}" (expected: "${shippingAddress.lastName}")`);
        if (values.address1 !== shippingAddress.address1)
            errors.push(`address1: "${values.address1}" (expected: "${shippingAddress.address1}")`);
        if (values.city !== shippingAddress.city)
            errors.push(`city: "${values.city}" (expected: "${shippingAddress.city}")`);
        if (values.stateCode !== shippingAddress.stateCode)
            errors.push(`stateCode: "${values.stateCode}" (expected: "${shippingAddress.stateCode}")`);
        if (values.postalCode !== shippingAddress.postalCode)
            errors.push(`postalCode: "${values.postalCode}" (expected: "${shippingAddress.postalCode}")`);

        if (errors.length > 0) {
            throw new Error(`Billing address fields do not match shipping address:\n  ${errors.join('\n  ')}`);
        }
    }

    /**
     * Clear all billing address fields so validation can be tested.
     */
    clearBillingAddressFields(): void {
        I.clearField(this.locators.billingFirstNameInput);
        I.clearField(this.locators.billingLastNameInput);
        I.clearField(this.locators.billingAddress1Input);
        I.clearField(this.locators.billingAddress2Input);
        I.clearField(this.locators.billingCityInput);
        I.selectOption(this.locators.billingStateSelect, '');
        I.clearField(this.locators.billingPostalCodeInput);
    }

    /**
     * Fill billing address fields (when "Use a different billing address" is checked).
     * For registered shoppers with saved addresses, opens the billing dropdown and
     * selects "Add new address" to reveal blank form fields first.
     */
    async fillBillingAddress(address: {
        firstName: string;
        lastName: string;
        address1: string;
        address2?: string;
        city: string;
        stateCode: string;
        postalCode: string;
    }): Promise<void> {
        const fieldsVisible = (await I.grabNumberOfVisibleElements(this.locators.billingFirstNameInput)) > 0;
        if (!fieldsVisible) {
            await this.selectNewBillingAddressFromDropdown();
        }

        I.waitForElement(this.locators.billingFirstNameInput, 15);
        I.fillField(this.locators.billingFirstNameInput, address.firstName);
        I.fillField(this.locators.billingLastNameInput, address.lastName);
        I.fillField(this.locators.billingAddress1Input, address.address1);
        if (address.address2) {
            I.fillField(this.locators.billingAddress2Input, address.address2);
        }
        I.fillField(this.locators.billingCityInput, address.city);
        I.selectOption(this.locators.billingStateSelect, address.stateCode);
        I.fillField(this.locators.billingPostalCodeInput, address.postalCode);
    }

    /**
     * Open the billing address dropdown and select "Add new address" to show blank form fields.
     * Only applicable for registered shoppers with saved addresses.
     */
    private async selectNewBillingAddressFromDropdown(): Promise<void> {
        await (I.usePlaywrightTo('select new billing address from dropdown', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const dropdownTrigger = paymentContent.locator('button').filter({
                has: page.locator('svg.lucide-chevron-down'),
            });
            await dropdownTrigger.first().waitFor({ state: 'visible', timeout: 10_000 });
            await dropdownTrigger.first().click();

            const addNewOption = page.locator('button:has-text("Add new address")').last();
            await addNewOption.waitFor({ state: 'visible', timeout: 5_000 });
            await addNewOption.click();
        }) as unknown as Promise<void>);
    }

    /**
     * Get the text currently shown in the billing address dropdown trigger.
     * Returns the displayed text (e.g. a formatted address) or null if no dropdown is visible.
     */
    async getBillingDropdownSelectedText(): Promise<string | null> {
        return (await I.usePlaywrightTo('get billing dropdown selected text', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            const trigger = paymentContent.locator('button').filter({
                has: page.locator('svg.lucide-chevron-down'),
            });
            const isVisible = await trigger
                .first()
                .isVisible()
                .catch(() => false);
            if (!isVisible) return null;
            return (await trigger.first().textContent())?.trim() ?? null;
        })) as unknown as Promise<string | null>;
    }

    /**
     * Select a saved billing address from the dropdown by index (0-based)
     * @param index - Index of the saved billing address to select (0 = default address)
     */
    async selectSavedBillingAddress(index: number): Promise<void> {
        await (I.usePlaywrightTo('select saved billing address from dropdown', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');

            // Dropdown trigger shows either a pre-selected address or "Select an address"
            const dropdownTrigger = paymentContent.locator('button').filter({
                has: page.locator('svg.lucide-chevron-down'),
            });
            await dropdownTrigger.first().waitFor({ state: 'visible', timeout: 10_000 });
            await dropdownTrigger.first().click();

            const popoverContent = page.locator('[data-slot="popover-content"]').last();
            await popoverContent.waitFor({ state: 'visible', timeout: 5_000 });

            const addressOptions = await popoverContent
                .locator('button')
                .filter({ hasNotText: 'Add new address' })
                .all();

            if (index >= addressOptions.length) {
                throw new Error(
                    `Cannot select billing address at index ${index}, only ${addressOptions.length} saved addresses available`
                );
            }

            await addressOptions[index].click();
        }) as unknown as Promise<void>);
    }

    async getFieldValidationErrors(stepTestId: string): Promise<string[]> {
        const selector = `[data-testid="${stepTestId}"] [data-slot="form-message"]`;
        const count = await I.grabNumberOfVisibleElements(selector);
        if (count === 0) return [];
        const texts: string[] = [];
        for (let i = 1; i <= count; i++) {
            const text = await I.grabTextFrom(locate(selector).at(i));
            if (text.trim()) texts.push(text.trim());
        }
        return texts;
    }

    clickContactInfoSubmit(): void {
        I.waitForElement(this.locators.continueToShippingButton, 10);
        I.scrollTo(this.locators.continueToShippingButton);
        I.click(this.locators.continueToShippingButton);
    }

    clickShippingAddressSubmit(): void {
        I.waitForElement(this.locators.shippingAddressSubmitButton, 10);
        I.scrollTo(this.locators.shippingAddressSubmitButton);
        I.click(this.locators.shippingAddressSubmitButton);
    }

    clearField(locator: CodeceptJS.LocatorOrString): void {
        I.click(locator);
        I.pressKey(['CommandOrControl', 'a']);
        I.pressKey('Backspace');
    }

    /** Wait for at least `minCount` form-message errors to appear within a step's toggle card. */
    async waitForValidationErrors(stepTestId: string, minCount: number, timeoutSeconds: number = 10): Promise<void> {
        const sel = `[data-testid="${stepTestId}"] [data-slot="form-message"]`;
        await (I.usePlaywrightTo(`wait for ${minCount}+ validation errors`, async ({ page }) => {
            await page.waitForFunction(
                ({ selector, min }: { selector: string; min: number }) =>
                    document.querySelectorAll(selector).length >= min,
                { selector: sel, min: minCount },
                { timeout: timeoutSeconds * 1000 }
            );
        }) as unknown as Promise<void>);
    }

    async expandPromoCodeAccordion(): Promise<void> {
        I.waitForElement(this.locators.promoCodeAccordionTrigger, 10);
        I.scrollTo(this.locators.promoCodeAccordionTrigger);
        const expanded = await I.grabAttributeFrom(this.locators.promoCodeAccordionTrigger, 'data-state');
        if (expanded !== 'open') {
            I.click(this.locators.promoCodeAccordionTrigger);
        }
        I.waitForElement(this.locators.promoCodeInput, 5);
    }

    applyPromoCode(code: string): void {
        I.fillField(this.locators.promoCodeInput, code);
        I.click(this.locators.promoCodeApplyButton);
    }

    /**
     * Returns true when the shipping options form is visible (radio inputs rendered in edit mode).
     */
    async isShippingOptionsFormVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.locators.shippingMethodOption);
        return count > 0;
    }

    /**
     * Returns true when the payment form submit button is visible (payment step is in edit mode).
     */
    async isPaymentFormOpen(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(
            '[data-testid="sf-toggle-card-payment"] button[type="submit"]'
        );
        return count > 0;
    }

    /**
     * Wait for the shipping options "Continue to Payment" button to become enabled (price
     * recalculation complete), then click it using Playwright force-click so viewport clipping
     * from the fixed mobile bar does not block the action.
     *
     * @param timeoutSeconds - How long to wait for the button to become enabled
     */
    async waitForShippingRecalcAndContinue(timeoutSeconds: number = 30): Promise<void> {
        I.waitForElement(
            '[data-testid="sf-toggle-card-shipping-options"] button[type="submit"]:not([disabled])',
            timeoutSeconds
        );
        await (I.usePlaywrightTo('click Continue to Payment', async ({ page }) => {
            const btn = page.locator('[data-testid="sf-toggle-card-shipping-options"] button[type="submit"]').first();
            await btn.scrollIntoViewIfNeeded();
            await btn.click({ force: true });
        }) as unknown as Promise<void>);
        I.waitForElement('form[data-checkout-mobile-bar]', 30);
    }

    async getPromoCodeError(): Promise<string> {
        const count = await I.grabNumberOfVisibleElements(this.locators.promoCodeError);
        if (count === 0) return '';
        return (await I.grabTextFrom(this.locators.promoCodeError)).trim();
    }

    waitForPromoCodeError(timeoutSeconds: number = 10): void {
        I.waitForElement(this.locators.promoCodeError, timeoutSeconds);
    }

    /**
     * Check if payment validation error messages are visible (e.g. "Please enter your card number.").
     * These render as `<p data-slot="form-message">` inside the payment card.
     */
    async getPaymentValidationErrors(): Promise<string[]> {
        const errors = (await I.executeScript(() => {
            const paymentCard = document.querySelector('[data-testid="sf-toggle-card-payment"]');
            if (!paymentCard) return [];
            const messages = paymentCard.querySelectorAll('[data-slot="form-message"]');
            return Array.from(messages).map((el) => el.textContent?.trim() ?? '');
        })) as string[];
        return errors.filter((e) => e.length > 0);
    }

    /**
     * Click Place Order and wait for validation errors to appear (does NOT wait for confirmation page).
     * Use when testing that validation blocks the order.
     */
    clickPlaceOrderAndWaitForValidation(timeoutSeconds: number = 10): void {
        this.clickPlaceOrder();
        I.waitForElement('[data-testid="sf-toggle-card-payment"] [data-slot="form-message"]', timeoutSeconds);
    }

    /** Fill contact info fields without submitting. Use for validation tests with invalid data. */
    fillContactInfoFields(email: string, phone?: string): void {
        I.fillField(this.locators.emailInput, email);
        I.pressKey('Tab');
        if (phone) {
            I.fillField(this.locators.phoneInputContactInfo, phone);
            I.pressKey('Tab');
        }
    }

    /**
     * Select the "Enter a new card" payment option when saved payment methods are present.
     * Handles three states: card form already visible (no-op), payment in summary/preview
     * mode (clicks Edit first), or payment in edit mode with saved radios.
     */
    async selectNewCardPaymentMethod(): Promise<void> {
        // If payment is in preview mode (registered shopper with saved card),
        // click Edit to enter edit mode before looking for the new-card radio.
        const inPreview = (await I.grabNumberOfVisibleElements(this.locators.paymentEditButton)) > 0;
        if (inPreview) {
            I.click(this.locators.paymentEditButton);
        }

        await (I.usePlaywrightTo('select new card payment method', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            await paymentContent.waitFor({ state: 'visible', timeout: 15_000 });

            const cardInput = page.locator('input[name="cardNumber"]');
            const newCardLabel = paymentContent.locator('label[for="new-payment"]');

            await Promise.race([
                cardInput.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'card' as const),
                newCardLabel.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'label' as const),
            ]).catch(() => 'timeout' as const);

            if (await cardInput.isVisible()) {
                return;
            }

            const viewAll = paymentContent.locator('button:has-text("View all")');
            if (await viewAll.isVisible()) {
                await viewAll.click();
                await newCardLabel.waitFor({ state: 'visible', timeout: 5_000 });
            }

            if (await newCardLabel.isVisible()) {
                await newCardLabel.click();
            }

            await cardInput.waitFor({ state: 'visible', timeout: 15_000 });
        }) as unknown as Promise<void>);
    }

    /**
     * Select a saved payment method by index (0-based)
     * @param index - Index of the saved payment method to select
     */
    async selectSavedPaymentMethod(index: number): Promise<void> {
        await (I.usePlaywrightTo('select saved payment method', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            await paymentContent.waitFor({ state: 'visible', timeout: 15_000 });

            const paymentRadios = await paymentContent.locator('[role="radio"]:not([id="new-payment"])').all();

            if (index >= paymentRadios.length) {
                throw new Error(
                    `Cannot select payment at index ${index}, only ${paymentRadios.length} saved payment methods available`
                );
            }

            const targetRadio = paymentRadios[index];
            const radioId = await targetRadio.getAttribute('id');

            if (!radioId) {
                throw new Error('Payment radio button does not have an id attribute');
            }

            const label = paymentContent.locator(`label[for="${radioId}"]`);
            await label.click();
        }) as unknown as Promise<void>);
    }

    /** Wait for the payment step to be ready (card number input visible). */
    waitForPaymentStep(timeout: number = 10): void {
        I.waitForElement(this.locators.cardNumberInput, timeout);
    }

    /** Wait for the shipping address step to be ready (first name input visible). */
    waitForShippingAddressStep(timeout: number = 15): void {
        I.waitForElement(this.locators.firstNameInput, timeout);
    }

    /** Wait for the main content container to be visible. */
    waitForMainContent(timeout: number = 15): void {
        I.waitForElement(this.locators.checkoutContainer, timeout);
    }

    /** Check whether the order confirmation page/message is shown. */
    async isOrderConfirmationShown(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(
            'text=/thank you|order placed|order confirmed|your order is confirmed/i'
        );
        return count > 0;
    }

    /** Check whether shipping address form inputs are visible. */
    async isShippingAddressStepVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(
            '[data-testid="sf-toggle-card-shipping-address"] input[name="firstName"]'
        );
        return count > 0;
    }

    /** Check whether shipping method radio buttons are visible. */
    async isShippingMethodStepVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements('input[type="radio"][name="shippingMethodId"]');
        return count > 0;
    }

    /** Check whether the contact info form content section is visible. */
    async isContactInfoFormVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements('[data-testid="sf-toggle-card-contact-info-content"]');
        return count > 0;
    }

    async waitForMyCartItemCount(minCount: number, timeoutSeconds: number = 20): Promise<number> {
        const count = (await I.executeScript(
            (params: { min: number; timeout: number }) =>
                new Promise<number>((resolve) => {
                    const deadline = Date.now() + params.timeout;
                    const check = (): void => {
                        const root =
                            document.querySelector('[data-testid="checkout-order-summary-sidebar"]') ?? document;
                        const n = root.querySelectorAll('[data-testid^="my-cart-item-"]').length;
                        if (n >= params.min || Date.now() >= deadline) {
                            resolve(n);
                            return;
                        }
                        setTimeout(check, 200);
                    };
                    check();
                }),
            { min: minCount, timeout: timeoutSeconds * 1000 }
        )) as number;
        return count;
    }

    // =========================================================================
    // Saved Payment Methods
    // =========================================================================

    async getSavedPaymentMethodCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.savedPaymentRadio);
    }

    // =========================================================================
    // Order Summary
    // =========================================================================

    async isOrderSummaryVisible(): Promise<boolean> {
        // The order summary can appear in two ways:
        // 1. Desktop: Directly visible in sidebar
        // 2. Mobile: Inside a collapsed accordion (still in DOM but hidden)

        // Wait for the order summary to load, then check if it exists
        let exists = false;
        await I.usePlaywrightTo('wait for and check if order summary exists', async ({ page }) => {
            try {
                // Wait for the order summary element to appear in DOM (visible or hidden)
                // Use attached state which works for both visible and hidden elements
                await page.locator('[data-testid="sf-order-summary"]').waitFor({
                    state: 'attached',
                    timeout: 5_000,
                });
                exists = true;
            } catch {
                // Element didn't appear within timeout
                exists = false;
            }
        });
        return exists;
    }

    async getOrderSummaryText(): Promise<string> {
        // First, ensure the order summary is loaded (wait for it to be attached to DOM)
        await I.usePlaywrightTo('ensure order summary is loaded', async ({ page }) => {
            await page.locator('[data-testid="sf-order-summary"]').waitFor({
                state: 'attached',
                timeout: 5_000,
            });
        });

        // Check if order summary is already visible (desktop layout)
        const visibleCount = await I.grabNumberOfVisibleElements(this.locators.orderSummary);
        if (visibleCount > 0) {
            return await I.grabTextFrom(this.locators.orderSummary);
        }

        // On mobile, the summary is in a collapsed accordion. Expand it.
        await I.usePlaywrightTo('expand order summary accordion', async ({ page }) => {
            // Find any accordion trigger button with data-state="closed"
            const trigger = page.locator('button[data-state="closed"]').first();
            const triggerExists = await trigger.count();

            if (triggerExists > 0) {
                // Click to expand the accordion
                await trigger.click();
                // Wait for the order summary to become visible
                await page.locator('[data-testid="sf-order-summary"]').waitFor({ state: 'visible', timeout: 5000 });
            }
        });

        return await I.grabTextFrom(this.locators.orderSummary);
    }

    async getConfirmationPageText(): Promise<string> {
        return await I.grabTextFrom(locate('main'));
    }

    async getCurrentUrl(): Promise<string> {
        return await I.grabCurrentUrl();
    }

    async getPaymentSectionText(): Promise<string> {
        return await I.grabTextFrom(locate('[data-testid="sf-toggle-card-payment"]'));
    }

    async isPaymentStepVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements('[data-testid="sf-toggle-card-payment-content"]');
        return count > 0;
    }

    waitForShippingMethods(timeout: number = 30): void {
        I.waitForElement(locate('input[type="radio"][name="shippingMethodId"]'), timeout);
    }

    async expandPaymentStep(): Promise<void> {
        I.waitForElement(locate('[data-testid="sf-toggle-card-payment"]'), 15);
        const editButtonCount = await I.grabNumberOfVisibleElements(this.locators.paymentEditButton);
        if (editButtonCount > 0) {
            I.click(this.locators.paymentEditButton);
            I.waitForElement('[data-testid="sf-toggle-card-payment-content"]', 15);
        }
    }

    waitForUseDifferentBillingCheckbox(timeout: number = 15): void {
        I.waitForElement(this.locators.useDifferentBillingCheckbox, timeout);
    }

    async getEmailFieldValue(): Promise<string> {
        const count = await I.grabNumberOfVisibleElements(this.locators.emailInput);
        if (count === 0) return '';
        return await I.grabValueFrom(this.locators.emailInput);
    }

    waitForShippingOptionsStep(timeout: number = 15): void {
        I.waitForElement(locate('[data-testid="sf-toggle-card-shipping-options"]').find('button'), timeout);
    }

    async isPaymentSectionVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(locate('[data-testid="sf-toggle-card-payment"]'));
        return count > 0;
    }

    // =========================================================================
    // OTP Modal Methods (Checkout Registration with Email Verification)
    // =========================================================================

    async getOtpModalText(): Promise<string> {
        return await I.grabTextFrom('[data-testid="otp-modal"]');
    }

    clickOtpCheckoutAsGuest(): void {
        I.click('[data-testid="otp-modal"] button:has-text("Checkout as Guest")');
    }

    waitForOtpModalClosed(timeout: number = 10): void {
        I.waitForInvisible('[data-testid="otp-modal"]', timeout);
    }

    clickOtpResendCode(): void {
        const resendButton = locate('[data-testid="otp-modal"]').find('button').withText('Resend Code');
        I.click(resendButton);
    }

    waitForOtpResendCooldown(timeout: number = 5): void {
        I.waitForText('Resend in', timeout, locate('[data-testid="otp-modal"]'));
    }

    async hasRegistrationError(): Promise<boolean> {
        const registerSection = locate('[data-testid="register-customer-checkbox"]');
        const count = await I.grabNumberOfVisibleElements(registerSection.find('.text-destructive'));
        return count > 0;
    }

    async isCreateAccountCheckboxChecked(): Promise<string | null> {
        return await I.grabAttributeFrom('#create-account-checkbox', 'checked');
    }

    waitForPlaceOrderButton(timeout: number = 20): void {
        I.waitForElement(locate('button[type="submit"]').withText('Place Order'), timeout);
    }

    async isPlaceOrderButtonVisible(): Promise<boolean> {
        const placeOrderLocator = locate('button[type="submit"]').withText('Place Order');
        const count = await I.grabNumberOfVisibleElements(placeOrderLocator);
        return count > 0;
    }

    waitForOrderConfirmationElement(timeout: number = 30): void {
        I.waitForElement('[data-testid="order-confirmation-container"]', timeout);
    }

    async getOrderNumberFromConfirmation(): Promise<string> {
        return await I.grabTextFrom('[data-testid="order-number"]');
    }

    navigateToHomepage(): void {
        I.amOnPage('/');
        I.waitForElement(locate('main'), 10);
    }

    waitForUiSettle(seconds: number = 2): void {
        I.wait(seconds);
    }

    async getSavedAddressText(index: number): Promise<string> {
        const addressLocator = locate(
            '[data-testid="sf-toggle-card-shipping-address"] label[for^="saved-address-"]'
        ).at(index + 1);
        return await I.grabTextFrom(addressLocator);
    }

    /**
     * Select a saved shipping address by index (0-based)
     * @param index - Index of the saved address to select (0 = default/preferred address)
     */
    async selectSavedAddress(index: number): Promise<void> {
        await (I.usePlaywrightTo('select saved shipping address', async ({ page }) => {
            const shippingAddressContent = page.locator('[data-testid="sf-toggle-card-shipping-address-content"]');
            await shippingAddressContent.waitFor({ state: 'visible', timeout: 10_000 });

            const addressLabels = await shippingAddressContent.locator('label[for^="saved-address-"]').all();

            if (index >= addressLabels.length) {
                throw new Error(
                    `Cannot select address at index ${index}, only ${addressLabels.length} saved addresses available`
                );
            }

            await addressLabels[index].click();
        }) as unknown as Promise<void>);
    }

    /**
     * Add multiple addresses to the current customer profile via SCAPI
     * Note: Requires an active authenticated session
     */
    async addMultipleAddressesToProfile(
        addresses: Array<{
            addressId: string;
            firstName: string;
            lastName: string;
            address1: string;
            city: string;
            stateCode: string;
            postalCode: string;
            countryCode: string;
            phone: string;
            preferred: boolean;
        }>
    ): Promise<void> {
        const { getScapiConfig, createCustomerAddress } = await import('../utils/scapi-helper');
        const config = getScapiConfig();

        if (config) {
            await (I.usePlaywrightTo('add addresses via SCAPI', async ({ browserContext }) => {
                const cookies = await browserContext.cookies();
                const siteId = config.siteId;

                const accessTokenCookie = cookies.find((c: { name: string }) => c.name === `cc-at_${siteId}`);
                const refreshTokenCookie = cookies.find((c: { name: string }) => c.name === `cc-nx_${siteId}`);

                if (!accessTokenCookie) {
                    throw new Error('Customer session cookies not found - user may not be logged in');
                }

                const { customerId, usid } = extractCustomerIdAndUsidFromJwt(accessTokenCookie.value);
                const tokens = {
                    accessToken: accessTokenCookie.value,
                    refreshToken: refreshTokenCookie?.value ?? '',
                    usid,
                    customerId,
                    expiresIn: 1800,
                };

                for (const address of addresses) {
                    await createCustomerAddress(config, tokens, address);
                }
            }) as unknown as Promise<void>);
            return;
        }

        // UI fallback when SCAPI config is unavailable (e.g. CI)
        I.amOnPage(buildSitePath('/account/addresses'));
        I.waitForElement(locate('h1').withText('Addresses'), 15);
        I.waitForElement(locate('button').withText('Add new address'), 10);

        for (const address of addresses) {
            I.click(locate('button').withText('Add new address'));
            I.waitForElement(locate('[data-slot="dialog-title"]').withText('Add new address'), 10);

            // Note: addressId is auto-generated by the form, no longer a user input field
            I.fillField('input[name="firstName"]', address.firstName);
            I.fillField('input[name="lastName"]', address.lastName);
            I.fillField('input[name="phone"]', address.phone);
            I.fillField('input[name="address1"]', address.address1);
            I.fillField('input[name="city"]', address.city);
            I.selectOption('select[name="stateCode"]', address.stateCode);
            I.fillField('input[name="postalCode"]', address.postalCode);

            I.click(locate('button[type="submit"]').withText('Save'));
            I.waitForElement(locate('[data-sonner-toast][data-type="success"]'), 10);
            I.waitForInvisible(locate('[role="dialog"]:has([data-slot="dialog-title"])'), 5);
        }
    }

    // =========================================================================
    // Shipping Method Helpers
    // =========================================================================

    async getShippingMethodCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.shippingMethodOption);
    }

    async getShippingOptionsText(): Promise<string> {
        return await I.grabTextFrom(locate('[data-testid="sf-toggle-card-shipping-options"]'));
    }

    /**
     * Add multiple payment methods to the current customer profile via SCAPI
     * Note: Requires an active authenticated session
     */
    async addMultiplePaymentMethodsToProfile(
        payments: Array<{
            cardNumber: string;
            cardholderName: string;
            expiryMonth: number;
            expiryYear: number;
            cardType: string;
        }>
    ): Promise<void> {
        const { getScapiConfig, createCustomerPaymentInstrument } = await import('../utils/scapi-helper');
        const config = getScapiConfig();

        if (config) {
            await (I.usePlaywrightTo('add payment methods via SCAPI', async ({ browserContext }) => {
                const cookies = await browserContext.cookies();
                const siteId = config.siteId;

                const accessTokenCookie = cookies.find((c: { name: string }) => c.name === `cc-at_${siteId}`);
                const refreshTokenCookie = cookies.find((c: { name: string }) => c.name === `cc-nx_${siteId}`);

                if (!accessTokenCookie) {
                    throw new Error('Customer session cookies not found - user may not be logged in');
                }

                const { customerId, usid } = extractCustomerIdAndUsidFromJwt(accessTokenCookie.value);
                const tokens = {
                    accessToken: accessTokenCookie.value,
                    refreshToken: refreshTokenCookie?.value ?? '',
                    usid,
                    customerId,
                    expiresIn: 1800,
                };

                for (const payment of payments) {
                    await createCustomerPaymentInstrument(config, tokens, payment);
                }
            }) as unknown as Promise<void>);
            return;
        }

        // UI fallback when SCAPI config is unavailable (e.g. CI)
        I.amOnPage(buildSitePath('/account/payment-methods'));
        I.waitForElement(locate('h1').withText('Payment Methods'), 15);
        I.waitForElement(locate('button').withText('Add payment method'), 10);

        for (const payment of payments) {
            I.click(locate('button').withText('Add payment method'));
            I.waitForElement(locate('[role="dialog"]'), 5);

            I.fillField(locate('[role="dialog"] input[name="cardholderName"]'), payment.cardholderName);
            I.fillField(locate('[role="dialog"] input[name="cardNumber"]'), payment.cardNumber);

            const expiryDate = `${String(payment.expiryMonth).padStart(2, '0')}/${String(payment.expiryYear).slice(-2)}`;
            I.fillField(locate('[role="dialog"] input[name="expiryDate"]'), expiryDate);
            I.fillField(
                locate(
                    '[role="dialog"] input[name="cvv"], [role="dialog"] input[name="securityCode"], [role="dialog"] input[name="cvn"]'
                ),
                '123'
            );

            // Select the first available billing address
            await (I.usePlaywrightTo('select first billing address', async ({ page }) => {
                const select = page.locator('[role="dialog"] select#billing-address');
                const options = select.locator('option');
                const count = await options.count();
                for (let i = 0; i < count; i++) {
                    const value = await options.nth(i).getAttribute('value');
                    if (value && value !== '') {
                        await select.selectOption(value);
                        break;
                    }
                }
            }) as unknown as Promise<void>);

            I.click(locate('[role="dialog"] button').withText('Save'));
            I.waitForElement(locate('[data-sonner-toast][data-type="success"]'), 10);
            I.waitForInvisible(locate('[role="dialog"]'), 10);
        }
    }

    /**
     * Get the number of visible saved payment method radio buttons
     */
    async getSavedPaymentMethodsCount(): Promise<number> {
        let count = 0;
        await (I.usePlaywrightTo('count saved payment methods', async ({ page }) => {
            const paymentContent = page.locator('[data-testid="sf-toggle-card-payment-content"]');
            await paymentContent.waitFor({ state: 'visible', timeout: 10_000 });
            const radios = paymentContent.locator('[role="radio"]:not([id="new-payment"])');
            try {
                await radios.first().waitFor({ state: 'attached', timeout: 5_000 });
            } catch {
                count = 0;
                return;
            }
            count = await radios.count();
        }) as unknown as Promise<void>);
        return count;
    }

    /**
     * Check if payment "View All" button is visible
     */
    async isPaymentViewAllButtonVisible(): Promise<boolean> {
        const viewAllButton = locate('[data-testid="sf-toggle-card-payment"] button').withText('View all');
        return (await I.grabNumberOfVisibleElements(viewAllButton)) > 0;
    }

    /**
     * Check if payment "View Less" button is visible
     */
    async isPaymentViewLessButtonVisible(): Promise<boolean> {
        const viewLessButton = locate('[data-testid="sf-toggle-card-payment"] button').withText('View less');
        return (await I.grabNumberOfVisibleElements(viewLessButton)) > 0;
    }

    /**
     * Click "View All" button in payment section
     */
    async clickPaymentViewAll(): Promise<void> {
        await (I.usePlaywrightTo('click payment View All', async ({ page }) => {
            const paymentSection = await page.locator('[data-testid="sf-toggle-card-payment"]');
            const viewAllButton = paymentSection.locator('button:has-text("View all")');
            await viewAllButton.click();
        }) as unknown as Promise<void>);
    }

    /**
     * Click "View Less" button in payment section
     */
    async clickPaymentViewLess(): Promise<void> {
        await (I.usePlaywrightTo('click payment View Less', async ({ page }) => {
            const paymentSection = await page.locator('[data-testid="sf-toggle-card-payment"]');
            const viewLessButton = paymentSection.locator('button:has-text("View less")');
            await viewLessButton.click();
        }) as unknown as Promise<void>);
    }

    // =========================================================================
    // Passwordless OTP Modal Helpers (Checkout Context)
    // =========================================================================

    /**
     * Mock the registration API to return unavailable (SLAS "Email not verified" 400).
     * The component should silently uncheck the checkbox with no toast or error.
     */
    async mockRegistrationUnavailable(): Promise<void> {
        await (I.usePlaywrightTo('mock registration API with unavailable', async ({ browserContext }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await browserContext.route('**/action/initiate-checkout-registration.data**', async (route: any) => {
                const body = JSON.stringify([
                    { _1: 2 },
                    'data',
                    { _3: 4, _5: 6 },
                    'success',
                    false,
                    'unavailable',
                    true,
                ]);
                await route.fulfill({
                    status: 200,
                    contentType: 'text/x-script; charset=utf-8',
                    body,
                });
            });
        }) as unknown as Promise<void>);
    }

    async clickCreateAccountCheckboxAndWaitForUncheck(timeoutSeconds: number = 15): Promise<boolean> {
        I.waitForElement('[data-testid="create-account-checkbox"]', 10);
        I.scrollTo('[data-testid="create-account-checkbox"]');
        I.click('#create-account-checkbox');

        const deadline = Date.now() + timeoutSeconds * 1000;
        while (Date.now() < deadline) {
            const checked = await I.grabAttributeFrom('#create-account-checkbox', 'data-state');
            if (checked === 'unchecked') return true;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
    }

    /**
     * Wait for login modal to appear (standard login form within a dialog)
     */
    waitForLoginModal(timeoutSeconds: number = 10): boolean {
        try {
            I.waitForElement('[role="dialog"] input[name="password"]', timeoutSeconds);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if login modal is visible
     */
    async isLoginModalVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements('[role="dialog"] input[name="password"]');
        return count > 0;
    }

    /**
     * Fill email and password fields in the login modal
     */
    fillLoginModalCredentials(email: string, password: string): void {
        I.waitForElement('[role="dialog"] input[name="password"]', 5);
        const emailField = locate('[role="dialog"] input[type="email"], [role="dialog"] input[name="email"]');
        I.fillField(emailField, email);
        I.fillField(locate('[role="dialog"] input[name="password"]'), password);
    }

    /**
     * Click "Checkout as Guest" button in the login modal (shown when launched from checkout)
     */
    clickLoginModalCheckoutAsGuest(): void {
        const checkoutAsGuestButton = locate('[role="dialog"]').find('button').withText('Checkout as Guest');
        I.waitForElement(checkoutAsGuestButton, 5);
        I.click(checkoutAsGuestButton);
    }

    /**
     * Wait for the login modal to close
     */
    waitForLoginModalClosed(timeoutSeconds: number = 10): void {
        I.waitForInvisible('[role="dialog"] input[name="password"]', timeoutSeconds);
    }

    /**
     * Fill contact info email field only (without phone)
     */
    fillContactInfoEmail(email: string): void {
        I.waitForElement(this.locators.emailInput, 10);
        I.fillField(this.locators.emailInput, email);
    }

    /**
     * Fill contact info phone field only (without email)
     */
    fillContactInfoPhone(phone: string): void {
        I.waitForElement(this.locators.phoneInputContactInfo, 10);
        I.fillField(this.locators.phoneInputContactInfo, phone);
    }

    /**
     * Blur the email field to trigger passwordless detection
     */
    async blurEmailField(): Promise<void> {
        await (I.usePlaywrightTo('blur email field', async ({ page }) => {
            const emailInput = await page.locator('input[type="email"]').first();
            await emailInput.blur();
        }) as unknown as Promise<void>);
    }

    /**
     * Fill contact info for the passwordless flow without prematurely triggering the OTP modal.
     *
     * The email field's onBlur fires passwordless detection. Filling email first and then moving focus
     * to the phone field blurs the email mid-sequence, opening the OTP modal while the phone is still
     * being entered. The remaining phone characters land in the OTP input and the flow breaks. Filling
     * the phone first makes the explicit email blur the only blur that reaches the detection handler.
     */
    async fillContactInfoForPasswordless(email: string, phone: string): Promise<void> {
        this.fillContactInfoPhone(phone);
        this.fillContactInfoEmail(email);
        await this.blurEmailField();
    }

    /**
     * Wait for passwordless OTP modal to appear
     */
    waitForPasswordlessOtpModal(timeoutSeconds: number = 10): boolean {
        try {
            I.waitForElement('[data-testid="otp-modal"]', timeoutSeconds);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if passwordless OTP modal is visible
     */
    async isPasswordlessOtpModalVisible(): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements('[data-testid="otp-modal"]');
        return count > 0;
    }

    /**
     * Click "Checkout as Guest" button in the passwordless OTP modal
     */
    clickPasswordlessOtpCheckoutAsGuest(): void {
        const checkoutAsGuestButton = locate('[data-testid="otp-modal"]').find('button').withText('Checkout as Guest');
        I.waitForElement(checkoutAsGuestButton, 5);
        I.click(checkoutAsGuestButton);
    }

    /**
     * Wait for passwordless OTP modal to close
     */
    async waitForPasswordlessOtpModalClosed(timeoutSeconds: number = 10): Promise<void> {
        const deadline = Date.now() + timeoutSeconds * 1000;
        while (Date.now() < deadline) {
            const count = await I.grabNumberOfVisibleElements('[data-testid="otp-modal"]');
            if (count === 0) return;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error('Passwordless OTP modal did not close within timeout');
    }

    // =========================================================================
    // Accessibility / Tab-order helpers
    // =========================================================================

    /**
     * Tab forward until the element matching `selector` becomes the active
     * element. Resets focus to the document body first so traversal is
     * deterministic. Returns true when the element is reached before maxTabs.
     */
    async tabUntilFocused(selector: string, maxTabs: number = 60): Promise<boolean> {
        return (await I.usePlaywrightTo(`tab until "${selector}" is focused`, async ({ page }) => {
            // Reset focus to body so traversal always starts from page top
            await page.evaluate(() => {
                const active = document.activeElement as HTMLElement | null;
                if (active && typeof active.blur === 'function') active.blur();
            });
            await page.mouse.click(2, 2);

            for (let i = 0; i < maxTabs; i++) {
                await page.keyboard.press('Tab');
                const matched = await page.evaluate((s: string) => {
                    const el = document.activeElement;
                    return el ? !!el.matches?.(s) : false;
                }, selector);
                if (matched) return true;
            }
            return false;
        })) as unknown as boolean;
    }

    /**
     * Capture the Tab-press index at which each of the named targets first becomes
     * the active element. Resets focus to the document body before starting so the
     * traversal always begins from the top of the page.
     *
     * Selectors are matched via `element.matches(selector)` on the active element at
     * each step. Use structural or data-testid selectors for locale-independence.
     *
     * @param targets - Map of logical name to CSS selector
     * @param maxTabs - Maximum Tab presses before giving up (default 40)
     * @returns Map of name to Tab-press index (-1 if not reached)
     */
    async captureTabOrderPositions(
        targets: Record<string, string>,
        maxTabs: number = 40
    ): Promise<Record<string, number>> {
        await (I.usePlaywrightTo('wait for checkout-order-summary-sidebar to be attached', async ({ page }) => {
            await page
                .locator('[data-testid="checkout-order-summary-sidebar"]')
                .first()
                .waitFor({ state: 'attached', timeout: 20_000 });
        }) as unknown as Promise<void>);

        const positions = (await I.usePlaywrightTo('capture tab-order positions of key sections', async ({ page }) => {
            // Blur any autofocused control and reset focus to the document body so
            // Tab traversal starts from the top of the page.
            await page.evaluate(() => {
                const active = document.activeElement as HTMLElement | null;
                if (active && typeof active.blur === 'function') active.blur();
            });
            await page.mouse.click(2, 2);

            const keys = Object.keys(targets);
            const selectorEntries = Object.entries(targets);
            const seen: Record<string, number> = Object.fromEntries(keys.map((k) => [k, -1]));

            for (let i = 1; i <= maxTabs; i++) {
                await page.keyboard.press('Tab');
                for (const [key, sel] of selectorEntries) {
                    if (seen[key] !== -1) continue;
                    const matched = await page.evaluate((s: string) => {
                        const el = document.activeElement;
                        return el ? !!el.matches?.(s) : false;
                    }, sel);
                    if (matched) seen[key] = i;
                }
                if (keys.every((k) => seen[k] !== -1)) break;
            }
            return seen;
        })) as unknown as Record<string, number>;

        return positions;
    }
}

export = new CheckoutPage();
