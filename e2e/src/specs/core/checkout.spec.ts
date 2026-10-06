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

Feature('Storefront Checkout Tests').tag('@core').tag('@checkout');

const { checkoutPage, addToCartFlow, apiCartSetupFlow, apiLoginFlow, registeredShopperSetupFlow, storefrontPage } =
    inject();
import { expect } from 'chai';
import {
    TEST_SHIPPING_ADDRESS,
    TEST_PAYMENT,
    TEST_PAYMENT_MASTERCARD,
    TEST_PRODUCT_CATEGORIES,
    generateTestEmail,
} from '../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../utils/login-prefs-stub';

// The deployed e2e target has no login-preferences entry, so the real BFF
// returns `requiresLogin: true` on email blur and pops the login modal.
// Stub every scenario in this file with the 'guest' branch so the contact
// step stays open and checkout can proceed.
installLoginPrefsStubHooks();

After(async (test: unknown) => {
    const tags = (test as { tags?: string[] }).tags ?? [];
    if (Array.isArray(tags) && tags.includes('@prefilled-checkout')) {
        await storefrontPage.logout();
    }
});

Scenario('Guest shopper should complete checkout and place order', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    const orderNumber = await checkoutPage.completeCheckout({
        email: generateTestEmail('guest'),
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT,
    });

    expect(orderNumber).to.not.be.empty;
    expect(orderNumber).to.match(/^\d+$/);
})
    .tag('@guest-checkout')
    .tag('@place-order')
    .tag('@smoke');

Scenario('Guest shopper should place order with MasterCard', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    const orderNumber = await checkoutPage.completeCheckout({
        email: generateTestEmail('guest-mc'),
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT_MASTERCARD,
    });

    expect(orderNumber).to.not.be.empty;
    expect(orderNumber).to.match(/^\d+$/);
})
    .tag('@guest-checkout')
    .tag('@place-order')
    .tag('@mastercard');

Scenario('Registered shopper should complete checkout', async () => {
    await apiLoginFlow.executeWithEnsuredCredentials();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    const prefilledEmail = await checkoutPage.getPrefilledEmail();
    const emailToUse = prefilledEmail || generateTestEmail('registered');

    const orderNumber = await checkoutPage.completeCheckout({
        email: emailToUse,
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT,
    });

    expect(orderNumber).to.not.be.empty;
    expect(orderNumber).to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@place-order')
    .tag('@smoke');

Scenario('Registered shopper with full profile should place order with prefilled checkout', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    const orderNumber = await checkoutPage.completePrefilledCheckout();

    expect(orderNumber).to.not.be.empty;
    expect(orderNumber).to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@place-order')
    .tag('@prefilled-checkout');

Scenario('Basket context syncs when navigating to checkout', async () => {
    const productInfo = await addToCartFlow.execute(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo).to.not.be.undefined;

    checkoutPage.navigate();
    checkoutPage.validatePageLoaded();
    checkoutPage.expandMyCart();

    const itemCount = await checkoutPage.waitForMyCartItemCount(1, 20);
    expect(itemCount).to.be.at.least(1);
})
    .tag('@basket-context')
    .tag('@checkout-navigation');

/**
 * Billing Address Fields Are Blank When Checking "Use a Different Billing Address"
 *
 * Test Flow:
 * 1. Add product to cart and navigate to checkout
 * 2. Fill contact info and shipping address
 * 3. Select shipping method to advance to payment step
 * 4. Verify "Use a different billing address" checkbox is not selected by default
 * 5. Check "Use a different billing address" checkbox
 * 6. Verify billing address fields are pre-filled with shipping address
 * 7. Uncheck "Use a different billing address" checkbox
 * 8. Verify billing fields are hidden (shipping address is used)
 *
 * This validates the acceptance criteria: when checking "Use a different billing address",
 * billing address fields should be pre-filled with the shipping address as a starting point.
 */
Scenario(
    'Guest shopper billing address fields are pre-filled with shipping address when checking "Use a different billing address"',
    async () => {
        const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
        expect(productInfo, 'Product should be added to cart').to.not.be.undefined;
        checkoutPage.validatePageLoaded();

        await checkoutPage.fillContactInfo(generateTestEmail('billing-test'), TEST_SHIPPING_ADDRESS.phone);

        await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);

        await checkoutPage.selectShippingMethod(0);

        const isDifferentBilling = await checkoutPage.isUsingDifferentBillingAddress();
        expect(isDifferentBilling, '"Use a different billing address" checkbox should not be selected by default').to.be
            .false;

        const fieldsHiddenByDefault = await checkoutPage.areBillingAddressFieldsVisible();
        expect(fieldsHiddenByDefault, 'Billing fields should be hidden by default').to.be.false;

        await checkoutPage.checkUseDifferentBillingAddress();

        const fieldsVisibleAfterCheck = await checkoutPage.areBillingAddressFieldsVisible();
        expect(
            fieldsVisibleAfterCheck,
            'Billing fields should be visible after checking "Use a different billing address"'
        ).to.be.true;

        await checkoutPage.validateBillingAddressMatchesShipping(TEST_SHIPPING_ADDRESS);

        await checkoutPage.uncheckUseDifferentBillingAddress();

        const fieldsHiddenAfterUncheck = await checkoutPage.areBillingAddressFieldsVisible();
        expect(
            fieldsHiddenAfterUncheck,
            'Billing fields should be hidden after unchecking "Use a different billing address"'
        ).to.be.false;
    }
)
    .tag('@billing-address')
    .tag('@guest-checkout')
    .tag('@smoke');

/**
 * Billing Address Can Be Filled After Checking "Use a Different Billing Address"
 *
 * Test Flow:
 * 1. Add product to cart and navigate to checkout
 * 2. Fill contact info and shipping address
 * 3. Select shipping method to advance to payment step
 * 4. Check "Use a different billing address" checkbox
 * 5. Fill custom billing address (different from shipping)
 * 6. Fill payment details and place order
 * 7. Verify order is placed successfully
 *
 * This validates that after checking "Use a different billing address", the user can
 * fill a custom billing address and complete checkout successfully.
 */
Scenario('Guest shopper can fill custom billing address and place order', async () => {
    const customBillingAddress = {
        firstName: 'Jane',
        lastName: 'Smith',
        address1: '456 Billing Ave',
        city: 'Los Angeles',
        stateCode: 'CA',
        postalCode: '90001',
    };

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;
    checkoutPage.validatePageLoaded();

    await checkoutPage.fillContactInfo(generateTestEmail('billing-toggle'), TEST_SHIPPING_ADDRESS.phone);
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.selectShippingMethod(0);

    await checkoutPage.checkUseDifferentBillingAddress();
    expect(await checkoutPage.areBillingAddressFieldsVisible(), 'Billing fields visible when checked').to.be.true;
    await checkoutPage.validateBillingAddressMatchesShipping(TEST_SHIPPING_ADDRESS);

    await checkoutPage.uncheckUseDifferentBillingAddress();
    expect(await checkoutPage.areBillingAddressFieldsVisible(), 'Billing fields hidden when unchecked').to.be.false;

    await checkoutPage.checkUseDifferentBillingAddress();
    await checkoutPage.validateBillingAddressMatchesShipping(TEST_SHIPPING_ADDRESS);
    await checkoutPage.fillBillingAddress(customBillingAddress);

    await checkoutPage.fillPaymentInfo(TEST_PAYMENT);

    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@billing-address')
    .tag('@custom-billing')
    .tag('@guest-checkout')
    .tag('@place-order')
    .tag('@smoke');

/**
 * Payment Validation: Empty Card Fields Block Place Order
 *
 * Test Flow:
 * 1. Add product to cart and navigate to checkout
 * 2. Fill contact info, shipping address, select shipping method
 * 3. Leave all credit card fields empty
 * 4. Click "Place Order"
 * 5. Verify validation errors appear for card fields (not redirected to confirmation)
 * 6. Verify the URL is still /checkout (order was NOT placed)
 *
 * This validates that clicking Place Order with empty payment fields does not
 * silently succeed — the shopper must see inline validation errors.
 */
Scenario('Place order is blocked with validation errors when payment fields are empty', async () => {
    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;
    checkoutPage.validatePageLoaded();

    await checkoutPage.fillContactInfo(generateTestEmail('payment-validation'), TEST_SHIPPING_ADDRESS.phone);
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.selectShippingMethod(0);

    checkoutPage.clickPlaceOrderAndWaitForValidation();

    const errors = await checkoutPage.getPaymentValidationErrors();
    expect(errors.length, 'Validation errors should appear for empty payment fields').to.be.greaterThan(0);

    const currentUrl = await checkoutPage.getCurrentUrl();
    expect(currentUrl, 'Should still be on checkout page (order not placed)').to.include('/checkout');
    expect(currentUrl, 'Should NOT have redirected to order confirmation').to.not.include('/order-confirmation');
})
    .tag('@payment-validation')
    .tag('@guest-checkout')
    .tag('@smoke');
