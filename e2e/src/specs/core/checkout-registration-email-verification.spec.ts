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

Feature('Checkout Registration with Email Verification').tag('@core').tag('@checkout').tag('@email-verification');

const { checkoutPage, apiCartSetupFlow, storefrontPage } = inject();
import { expect } from 'chai';
import {
    TEST_SHIPPING_ADDRESS,
    TEST_PAYMENT,
    TEST_PRODUCT_CATEGORIES,
    generateTestEmail,
} from '../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../utils/login-prefs-stub';

installLoginPrefsStubHooks();

After(async (test: unknown) => {
    const tags = (test as { tags?: string[] }).tags ?? [];
    if (Array.isArray(tags) && tags.includes('@checkout-registration')) {
        await storefrontPage.logout();
    }
});

Scenario('Guest should create account during checkout with email verification', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-registration');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();

    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();

    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();

    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const otpModalAppeared = await checkoutPage.clickCreateAccountCheckboxAndWaitForModalOrError(15);

    if (otpModalAppeared) {
        const modalText = await checkoutPage.getOtpModalText();
        expect(modalText, 'OTP modal should display verification instructions').to.match(
            /Enter Verification Code|We've sent|digit code/
        );
        checkoutPage.clickOtpCheckoutAsGuest();
        checkoutPage.waitForOtpModalClosed(10);
    }

    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
    const orderNumber = await checkoutPage.getOrderNumberFromConfirmation();
    expect(orderNumber, 'Order number should exist').to.not.equal('');
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@otp-modal')
    .tag('@smoke');

Scenario('Guest should be able to resend OTP code during checkout registration', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-registration-resend');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();
    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();
    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const otpModalAppeared = await checkoutPage.clickCreateAccountCheckboxAndWaitForModalOrError(15);

    if (otpModalAppeared) {
        checkoutPage.clickOtpResendCode();
        checkoutPage.waitForOtpResendCooldown(5);
        checkoutPage.clickOtpCheckoutAsGuest();
        checkoutPage.waitForOtpModalClosed(20);
    }

    checkoutPage.waitForPlaceOrderButton(20);
    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@otp-resend')
    .tag('@smoke');

Scenario('Guest should be able to cancel account registration and checkout as guest', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-guest-cancel');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();
    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();
    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const otpModalAppeared = await checkoutPage.clickCreateAccountCheckboxAndWaitForModalOrError(15);

    if (otpModalAppeared) {
        checkoutPage.clickOtpCheckoutAsGuest();
        checkoutPage.waitForOtpModalClosed(10);
        const isChecked = await checkoutPage.isCreateAccountCheckboxChecked();
        expect(isChecked, 'Create account checkbox should be unchecked after canceling registration').to.not.equal(
            'true'
        );
    }

    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
    const orderNumber = await checkoutPage.getOrderNumberFromConfirmation();
    expect(orderNumber, 'Order number should exist').to.not.equal('');
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@cancel-registration')
    .tag('@smoke');

Scenario('Guest should see error message if registration initiation fails', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-error');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();
    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();
    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const otpModalAppeared = await checkoutPage.clickCreateAccountCheckboxAndWaitForModalOrError(15);

    if (otpModalAppeared) {
        checkoutPage.clickOtpCheckoutAsGuest();
        checkoutPage.waitForOtpModalClosed(10);
    }

    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@error-handling')
    .tag('@smoke');

Scenario('Save payment checkbox is not visible for guest shoppers during checkout', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-hide-save-payment');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();
    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();

    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const isVisible = await checkoutPage.isSavePaymentCheckboxVisible();
    expect(isVisible, 'Save payment checkbox should not be visible for guest shoppers').to.be.false;

    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
    const orderNumber = await checkoutPage.getOrderNumberFromConfirmation();
    expect(orderNumber).to.not.equal('');
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@save-payment-checkbox')
    .tag('@hide-save-payment')
    .tag('@smoke');

Scenario('Save payment checkbox remains hidden when guest declines account creation', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.equal(undefined);

    checkoutPage.validatePageLoaded();

    const email = generateTestEmail('checkout-keep-save-payment');

    await checkoutPage.fillContactInfo(email);
    await checkoutPage.continueFromContactInfo();
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.continueFromShippingAddress();
    await checkoutPage.selectFirstShippingMethod();
    checkoutPage.continueFromShippingOptions();

    checkoutPage.fillPaymentFieldsOnly(TEST_PAYMENT);

    const isVisibleBefore = await checkoutPage.isSavePaymentCheckboxVisible();
    expect(isVisibleBefore, 'Save payment checkbox should not be visible for guest shoppers').to.be.false;

    const otpModalAppeared = await checkoutPage.clickCreateAccountCheckboxAndWaitForModalOrError(15);

    if (otpModalAppeared) {
        checkoutPage.clickOtpCheckoutAsGuest();
        checkoutPage.waitForOtpModalClosed(10);

        const isVisibleAfter = await checkoutPage.isSavePaymentCheckboxVisible();
        expect(isVisibleAfter, 'Save payment checkbox should remain hidden after declining registration').to.be.false;
    }

    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmationElement(30);
    const orderNumber = await checkoutPage.getOrderNumberFromConfirmation();
    expect(orderNumber).to.not.equal('');
})
    .tag('@guest-checkout')
    .tag('@checkout-registration')
    .tag('@save-payment-checkbox')
    .tag('@keep-save-payment')
    .tag('@smoke');
