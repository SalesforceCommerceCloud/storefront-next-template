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
 * Validates that the Place Order button is hidden while editing shipping address
 * or shipping method, preventing orders with stale basket data.
 */

Feature('Checkout Place Order Button Visibility Tests').tag('@core').tag('@checkout').tag('@place-order-visibility');

const { checkoutPage, apiCartSetupFlow, registeredShopperSetupFlow, storefrontPage } = inject();
import { expect } from 'chai';
import { TEST_PRODUCT_CATEGORIES } from '../../test-data/checkout.data';

After(async (test: unknown) => {
    const tags = (test as { tags?: string[] }).tags ?? [];
    if (Array.isArray(tags) && tags.includes('@place-order-visibility')) {
        await storefrontPage.logout();
    }
});

Scenario('Place Order button is hidden when editing shipping address', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const placeOrderVisibleInitially = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderVisibleInitially, 'Place Order button should be visible in summary view').to.be.true;

    checkoutPage.expandShippingAddressStep();
    checkoutPage.waitForPlaceOrderButtonHidden();

    const placeOrderVisibleDuringEdit = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderVisibleDuringEdit, 'Place Order button should be hidden while editing shipping address').to.be
        .false;

    checkoutPage.clickContinueToShippingOptions();
    checkoutPage.waitForShippingOptionsStep(15);

    const placeOrderVisibleAfterContinue = await checkoutPage.isPlaceOrderButtonVisible();
    expect(
        placeOrderVisibleAfterContinue,
        'Place Order button should become visible after continuing from address edit'
    ).to.be.true;
}).tag('@shipping-address-edit');

Scenario('Place Order button is hidden when editing shipping method', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const placeOrderVisibleInitially = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderVisibleInitially, 'Place Order button should be visible in summary view').to.be.true;

    checkoutPage.expandShippingOptionsStep();
    checkoutPage.waitForPlaceOrderButtonHidden();

    const placeOrderVisibleDuringEdit = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderVisibleDuringEdit, 'Place Order button should be hidden while editing shipping method').to.be
        .false;

    const shippingMethodCount = await checkoutPage.getShippingMethodCount();
    if (shippingMethodCount > 1) {
        await checkoutPage.selectShippingMethod(1);
    } else {
        checkoutPage.continueFromShippingOptions();
    }

    checkoutPage.waitForPlaceOrderButton();

    const placeOrderVisibleAfterContinue = await checkoutPage.isPlaceOrderButtonVisible();
    expect(
        placeOrderVisibleAfterContinue,
        'Place Order button should become visible after continuing from shipping method edit'
    ).to.be.true;
}).tag('@shipping-method-edit');

Scenario('Clicking Edit on a checkout section does not accidentally place the order', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.validateAllCheckoutSectionsPrefilled();

    const placeOrderBefore = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderBefore, 'Place Order button should be visible before editing').to.be.true;

    // Click Edit on Shipping Address — Place Order should disappear
    checkoutPage.expandShippingAddressStep();
    checkoutPage.waitForPlaceOrderButtonHidden();

    const placeOrderDuringEdit = await checkoutPage.isPlaceOrderButtonVisible();
    expect(placeOrderDuringEdit, 'Place Order button should be hidden while editing shipping address').to.be.false;

    // Verify order was NOT placed by clicking Edit
    const orderConfirmed = await checkoutPage.isOrderConfirmationShown();
    expect(orderConfirmed, 'Order should NOT have been placed by clicking Edit').to.be.false;
}).tag('@edit-safety');

export {};
