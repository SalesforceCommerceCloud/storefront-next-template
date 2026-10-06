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

/**
 * Checkout Registered Shopper Payment & Step Navigation Tests
 *
 * Test Coverage:
 * - Placing an order using a saved payment method (no manual card entry)
 * - Editing a shipping address step and continuing through the remaining steps
 *
 * Prerequisites:
 * - Registered shopper with full profile (saved address + payment) via registeredShopperSetupFlow
 * - Product added to cart and navigated to checkout
 */

Feature('Checkout Registered Shopper Payment & Step Navigation Tests').tag('@core').tag('@checkout');

const { checkoutPage, apiCartSetupFlow, registeredShopperSetupFlow, storefrontPage, accountPaymentMethodsPage } =
    inject();
import { expect } from 'chai';
import {
    TEST_PRODUCT_CATEGORIES,
    TEST_PAYMENT_MASTERCARD,
    TEST_SHIPPING_ADDRESS,
    generateTestEmail,
} from '../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../utils/login-prefs-stub';

// Guest-style contact step stubs — registered skipPayment flow may still hit email blur prefs.
installLoginPrefsStubHooks();

After(async (test: unknown) => {
    const tags = (test as { tags?: string[] }).tags ?? [];
    if (Array.isArray(tags) && tags.includes('@registered-shopper')) {
        await storefrontPage.logout();
    }
});

Scenario('Registered shopper can place order with saved payment method', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const paymentInPreview = await checkoutPage.isPaymentInPreviewMode();
    expect(paymentInPreview, 'Payment section should be in preview mode with saved payment').to.be.true;

    const paymentText = await checkoutPage.getPaymentSectionText();
    expect(paymentText, 'Payment preview should show card info').to.have.length.greaterThan(0);

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@saved-payment')
    .tag('@place-order');

Scenario('Registered shopper can enter a new MasterCard and place order', async () => {
    // skipPayment: this realm blocks BASIC_CREDIT customer-PI create via SCAPI when SFP is on.
    // New-card checkout still exercises catalog-resolved cardType (Master Card / MasterCard).
    await registeredShopperSetupFlow.execute({ skipPayment: true });

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    // No saved payment — fill shipping if needed then payment with MasterCard BIN
    const email = generateTestEmail('reg-mc');
    const orderNumber = await checkoutPage.completeCheckout({
        email,
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT_MASTERCARD,
    });

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@add-new-card')
    .tag('@place-order')
    .tag('@mastercard');

Scenario('Registered shopper can edit payment, verify default at top, and place order without changes', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const paymentInPreview = await checkoutPage.isPaymentInPreviewMode();
    expect(paymentInPreview, 'Payment section should be in preview mode with saved payment').to.be.true;

    const paymentPreviewText = await checkoutPage.getPaymentSectionText();
    expect(paymentPreviewText, 'Payment preview should show card info').to.have.length.greaterThan(0);

    await checkoutPage.expandPaymentStep();
    checkoutPage.waitForUiSettle(2);

    const savedPaymentCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(savedPaymentCount, 'Should have at least 1 saved payment method').to.be.at.least(1);

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@saved-payment')
    .tag('@edit-payment')
    .tag('@place-order');

Scenario('Registered shopper can edit shipping address and continue checkout', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();

    const shippingInPreview = await checkoutPage.isShippingAddressInPreviewMode();
    expect(shippingInPreview, 'Shipping address should be in preview mode').to.be.true;

    checkoutPage.expandShippingAddressStep();

    const hasSavedAddresses = await checkoutPage.isSavedAddressesListVisible();
    expect(hasSavedAddresses, 'Saved addresses list should be visible after expanding').to.be.true;

    checkoutPage.clickContinueToShippingOptions();

    checkoutPage.waitForShippingOptionsStep(15);
    const shippingOptionsInPreview = await checkoutPage.isShippingOptionsInPreviewMode();
    expect(shippingOptionsInPreview, 'Shipping options should advance to preview mode').to.be.true;

    const paymentVisible = await checkoutPage.isPaymentSectionVisible();
    expect(paymentVisible, 'Payment section should be reachable').to.be.true;
})
    .tag('@registered-shopper')
    .tag('@step-navigation');

Scenario('Registered shopper can change shipping method and place order', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const shippingOptionsInPreview = await checkoutPage.isShippingOptionsInPreviewMode();
    expect(shippingOptionsInPreview, 'Shipping options should be in preview mode initially').to.be.true;

    checkoutPage.expandShippingOptionsStep();
    checkoutPage.waitForUiSettle(1);

    const shippingMethodCount = await checkoutPage.getShippingMethodCount();
    expect(shippingMethodCount, 'Should have multiple shipping methods to test selection').to.be.at.least(2);

    await checkoutPage.selectShippingMethod(1);
    checkoutPage.waitForUiSettle(2);

    const paymentInPreview = await checkoutPage.isPaymentInPreviewMode();
    expect(paymentInPreview, 'Payment should advance to preview mode').to.be.true;

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@change-shipping-method')
    .tag('@place-order');

Scenario('Registered shopper with 4+ saved payments can use View All/View Less and add new card', async () => {
    await registeredShopperSetupFlow.execute();

    await checkoutPage.addMultiplePaymentMethodsToProfile([
        {
            cardNumber: '5555555555554444',
            cardholderName: 'Payment Two',
            expiryMonth: 12,
            expiryYear: 2028,
            cardType: 'Mastercard',
        },
        {
            cardNumber: '378282246310005',
            cardholderName: 'Payment Three',
            expiryMonth: 6,
            expiryYear: 2029,
            cardType: 'Amex',
        },
        {
            cardNumber: '6011111111111117',
            cardholderName: 'Payment Four',
            expiryMonth: 3,
            expiryYear: 2030,
            cardType: 'Discover',
        },
    ]);

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const paymentInPreview = await checkoutPage.isPaymentInPreviewMode();
    expect(paymentInPreview, 'Payment should be in preview mode initially').to.be.true;

    await checkoutPage.expandPaymentStep();
    checkoutPage.waitForUiSettle(1);

    const initialVisibleCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(initialVisibleCount, 'Should display exactly 3 saved payment methods initially').to.equal(3);

    const viewAllVisible = await checkoutPage.isPaymentViewAllButtonVisible();
    expect(viewAllVisible, 'View All button should be visible with 4+ payment methods').to.be.true;

    await checkoutPage.clickPaymentViewAll();
    checkoutPage.waitForUiSettle(1);

    const expandedCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(expandedCount, 'Should display all 4 payment methods after View All').to.equal(4);

    const viewLessVisible = await checkoutPage.isPaymentViewLessButtonVisible();
    expect(viewLessVisible, 'View Less button should be visible after expanding').to.be.true;

    await checkoutPage.clickPaymentViewLess();
    checkoutPage.waitForUiSettle(1);

    const collapsedCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(collapsedCount, 'Should display 3 payment methods again after View Less').to.equal(3);

    await checkoutPage.selectNewCardPaymentMethod();
    checkoutPage.waitForUiSettle(1);

    checkoutPage.fillPaymentFieldsOnly({
        cardNumber: '4111111111111111',
        cardholderName: 'New Test Card',
        expiryDate: '12/29',
        cvv: '123',
    });

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@view-all-payments')
    .tag('@multiple-payments')
    .tag('@add-new-card')
    .tag('@place-order');

Scenario('Registered shopper can save new card during checkout and card is saved to profile', async () => {
    await registeredShopperSetupFlow.execute();

    accountPaymentMethodsPage.navigate();
    accountPaymentMethodsPage.validatePageLoaded();
    const initialPaymentCount = await accountPaymentMethodsPage.getPaymentMethodCount();

    await checkoutPage.addMultiplePaymentMethodsToProfile([
        {
            cardNumber: '5555555555554444',
            cardholderName: 'Payment Two',
            expiryMonth: 12,
            expiryYear: 2028,
            cardType: 'Mastercard',
        },
        {
            cardNumber: '378282246310005',
            cardholderName: 'Payment Three',
            expiryMonth: 6,
            expiryYear: 2029,
            cardType: 'Amex',
        },
        {
            cardNumber: '6011111111111117',
            cardholderName: 'Payment Four',
            expiryMonth: 3,
            expiryYear: 2030,
            cardType: 'Discover',
        },
    ]);

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    await checkoutPage.expandPaymentStep();
    checkoutPage.waitForUiSettle(1);

    const initialVisibleCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(initialVisibleCount, 'Should display exactly 3 saved payment methods initially').to.equal(3);

    const viewAllVisible = await checkoutPage.isPaymentViewAllButtonVisible();
    expect(viewAllVisible, 'View All button should be visible').to.be.true;

    await checkoutPage.clickPaymentViewAll();
    checkoutPage.waitForUiSettle(1);

    const expandedCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(expandedCount, 'Should display all 4 payment methods after View All').to.equal(4);

    await checkoutPage.clickPaymentViewLess();
    checkoutPage.waitForUiSettle(1);

    const collapsedCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(collapsedCount, 'Should display 3 payment methods after View Less').to.equal(3);

    await checkoutPage.selectNewCardPaymentMethod();
    checkoutPage.waitForUiSettle(1);

    checkoutPage.fillPaymentFieldsOnly({
        cardNumber: '4012888888881881',
        cardholderName: 'SavedCard Test',
        expiryDate: '09/31',
        cvv: '789',
    });

    const saveCheckboxVisible = await checkoutPage.isSavePaymentCheckboxVisible();
    expect(saveCheckboxVisible, 'Save payment checkbox should be visible for registered shoppers').to.be.true;

    await checkoutPage.checkSavePaymentCheckbox();

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);

    accountPaymentMethodsPage.navigate();
    accountPaymentMethodsPage.validatePageLoaded();

    const finalPaymentCount = await accountPaymentMethodsPage.getPaymentMethodCount();
    expect(finalPaymentCount, 'Profile should have one more payment method (4 initial + 1 new)').to.equal(
        initialPaymentCount + 4
    );
})
    .tag('@registered-shopper')
    .tag('@save-new-card')
    .tag('@payment-persistence')
    .tag('@place-order');

Scenario('Registered shopper places order with new card without saving and card is NOT saved to profile', async () => {
    await registeredShopperSetupFlow.execute();

    accountPaymentMethodsPage.navigate();
    accountPaymentMethodsPage.validatePageLoaded();
    const initialPaymentCount = await accountPaymentMethodsPage.getPaymentMethodCount();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    await checkoutPage.expandPaymentStep();
    checkoutPage.waitForUiSettle(1);

    await checkoutPage.selectNewCardPaymentMethod();
    checkoutPage.waitForUiSettle(1);

    checkoutPage.fillPaymentFieldsOnly({
        cardNumber: '4012888888881881',
        cardholderName: 'Unsaved Card Test',
        expiryDate: '09/31',
        cvv: '789',
    });

    const saveCheckboxVisible = await checkoutPage.isSavePaymentCheckboxVisible();
    expect(saveCheckboxVisible, 'Save payment checkbox should be visible for registered shoppers').to.be.true;

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);

    accountPaymentMethodsPage.navigate();
    accountPaymentMethodsPage.validatePageLoaded();

    const finalPaymentCount = await accountPaymentMethodsPage.getPaymentMethodCount();
    expect(finalPaymentCount, 'Profile should have same number of payment methods (new card was not saved)').to.equal(
        initialPaymentCount
    );
})
    .tag('@registered-shopper')
    .tag('@no-save-card')
    .tag('@payment-persistence')
    .tag('@place-order');

Scenario('Registered shopper can select different saved payment method and place order', async () => {
    await registeredShopperSetupFlow.execute();

    await checkoutPage.addMultiplePaymentMethodsToProfile([
        {
            cardNumber: '5555555555554444',
            cardholderName: 'Payment Two',
            expiryMonth: 12,
            expiryYear: 2028,
            cardType: 'Mastercard',
        },
        {
            cardNumber: '378282246310005',
            cardholderName: 'Payment Three',
            expiryMonth: 6,
            expiryYear: 2029,
            cardType: 'Amex',
        },
        {
            cardNumber: '6011111111111117',
            cardholderName: 'Payment Four',
            expiryMonth: 3,
            expiryYear: 2030,
            cardType: 'Discover',
        },
    ]);

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const paymentInPreview = await checkoutPage.isPaymentInPreviewMode();
    expect(paymentInPreview, 'Payment should be in preview mode with default payment').to.be.true;

    await checkoutPage.expandPaymentStep();
    checkoutPage.waitForUiSettle(1);

    const initialVisibleCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(initialVisibleCount, 'Should display exactly 3 saved payment methods initially').to.equal(3);

    const viewAllVisible = await checkoutPage.isPaymentViewAllButtonVisible();
    expect(viewAllVisible, 'View All button should be visible').to.be.true;

    await checkoutPage.clickPaymentViewAll();
    checkoutPage.waitForUiSettle(1);

    const expandedCount = await checkoutPage.getSavedPaymentMethodsCount();
    expect(expandedCount, 'Should display all 4 payment methods after View All').to.equal(4);

    await checkoutPage.clickPaymentViewLess();
    checkoutPage.waitForUiSettle(1);

    await checkoutPage.selectSavedPaymentMethod(1);
    checkoutPage.waitForUiSettle(1);

    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@registered-shopper')
    .tag('@change-saved-payment')
    .tag('@place-order');
