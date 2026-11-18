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
 * Checkout Shipping Address Modal Tests (Registered Shopper)
 *
 * Test Coverage:
 * - Saved addresses list display and selection at checkout
 * - Add new address via modal during checkout — verifies address applied to basket and saved to profile
 * - Edit existing saved address via modal during checkout — verifies changes in basket and profile
 *
 * Prerequisites:
 * - Registered shopper with saved addresses (created via registeredShopperSetupFlow)
 * - Product added to cart and navigated to checkout
 *
 * Integration Value:
 * - Real SCAPI address creation/update during live checkout flow
 * - Modal state management within the checkout step context
 * - Saved addresses list interaction with basket address binding
 * - Address changes reflected in both basket (shipping preview) and customer profile
 */

Feature('Checkout Shipping Address Modal Tests').tag('@core').tag('@checkout').tag('@shipping-address');

const { checkoutPage, apiCartSetupFlow, registeredShopperSetupFlow, storefrontPage, accountAddressesPage } = inject();
import { expect } from 'chai';
import { TEST_SHIPPING_ADDRESS_ALT, TEST_PRODUCT_CATEGORIES } from '../../test-data/checkout.data';

After(async (test: unknown) => {
    const tags = (test as { tags?: string[] }).tags ?? [];
    if (Array.isArray(tags) && tags.includes('@shipping-address')) {
        await storefrontPage.logout();
    }
});

// =============================================================================
// Saved Addresses List Display and Continue
// =============================================================================

Scenario('Registered shopper sees saved addresses and can continue checkout', async () => {
    const setupResult = await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    await checkoutPage.expandShippingAddressForSavedAddresses();

    const hasSavedAddresses = await checkoutPage.isSavedAddressesListVisible();
    expect(hasSavedAddresses, 'Saved addresses list should be visible for registered shopper').to.be.true;

    const addressCount = await checkoutPage.getSavedAddressCount();
    expect(addressCount, 'Should display at least one saved address').to.be.at.least(1);

    const addButtonVisible = await checkoutPage.isAddNewAddressButtonVisible();
    expect(addButtonVisible, 'Add New Address button should be visible').to.be.true;

    checkoutPage.clickContinueToShippingOptions();

    const previewText = await checkoutPage.getShippingAddressPreviewText();
    expect(previewText, 'Shipping preview should show the saved address city').to.include(setupResult.addressData.city);

    accountAddressesPage.navigate();
    accountAddressesPage.validatePageLoaded();
    const profileAddressCount = await accountAddressesPage.getAddressCount();
    expect(profileAddressCount, 'Profile should have at least one saved address').to.be.at.least(1);
}).tag('@saved-addresses');

// =============================================================================
// Add New Address via Modal
// =============================================================================

Scenario('Registered shopper can add new address via modal at checkout', async () => {
    await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    await checkoutPage.expandShippingAddressForSavedAddresses();

    const initialAddressCount = await checkoutPage.getSavedAddressCount();

    checkoutPage.clickAddNewAddress();

    const modalOpen = await checkoutPage.isAddressModalOpen();
    expect(modalOpen, 'Address modal should open').to.be.true;

    const modalTitle = await checkoutPage.getAddressModalTitle();
    expect(modalTitle, 'Modal title should be "Add New Address"').to.equal('Add New Address');

    checkoutPage.fillAddressModal({
        firstName: TEST_SHIPPING_ADDRESS_ALT.firstName,
        lastName: TEST_SHIPPING_ADDRESS_ALT.lastName,
        address1: TEST_SHIPPING_ADDRESS_ALT.address1,
        city: TEST_SHIPPING_ADDRESS_ALT.city,
        stateCode: TEST_SHIPPING_ADDRESS_ALT.stateCode,
        postalCode: TEST_SHIPPING_ADDRESS_ALT.postalCode,
    });

    checkoutPage.clickAddressModalSave();
    checkoutPage.waitForAddressModalClosed();

    const modalStillOpen = await checkoutPage.isAddressModalOpen();
    expect(modalStillOpen, 'Address modal should close after save').to.be.false;

    const previewText = await checkoutPage.getShippingAddressPreviewText();
    expect(previewText, 'Shipping preview should show the new address city').to.include(TEST_SHIPPING_ADDRESS_ALT.city);
    expect(previewText, 'Shipping preview should show the new address name').to.include(
        TEST_SHIPPING_ADDRESS_ALT.firstName
    );

    accountAddressesPage.navigate();
    accountAddressesPage.validatePageLoaded();
    const profileAddressCount = await accountAddressesPage.getAddressCount();
    expect(profileAddressCount, 'Profile should have one more address after add').to.be.greaterThan(
        initialAddressCount
    );
})
    .tag('@add-address')
    .tag('@address-modal');

// =============================================================================
// Edit Saved Address via Modal
// =============================================================================

Scenario('Registered shopper can edit saved address via modal at checkout', async () => {
    const setupResult = await registeredShopperSetupFlow.execute();

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    await checkoutPage.expandShippingAddressForSavedAddresses();

    checkoutPage.clickEditAddress(0);

    const modalOpen = await checkoutPage.isAddressModalOpen();
    expect(modalOpen, 'Address modal should open for editing').to.be.true;

    const modalTitle = await checkoutPage.getAddressModalTitle();
    expect(modalTitle, 'Modal title should be "Edit Address"').to.equal('Edit Address');

    const prefilledFirstName = await checkoutPage.getAddressModalFieldValue('firstName');
    expect(prefilledFirstName, 'First name should be pre-populated').to.equal(setupResult.addressData.firstName);

    const prefilledCity = await checkoutPage.getAddressModalFieldValue('city');
    expect(prefilledCity, 'City should be pre-populated').to.equal(setupResult.addressData.city);

    const newCity = 'Los Angeles';
    checkoutPage.editAddressModalCity(newCity);

    checkoutPage.clickAddressModalSave();
    checkoutPage.waitForAddressModalClosed(15);

    const modalStillOpen = await checkoutPage.isAddressModalOpen();
    expect(modalStillOpen, 'Address modal should close after edit save').to.be.false;

    const previewText = await checkoutPage.getShippingAddressPreviewText();
    expect(previewText, 'Shipping preview should show the edited city').to.include(newCity);

    accountAddressesPage.navigate();
    accountAddressesPage.validatePageLoaded();
    const cardText = await accountAddressesPage.getAddressCardText(0);
    expect(cardText, 'Address card should show the edited city').to.include(newCity);
})
    .tag('@edit-address')
    .tag('@address-modal');

// =============================================================================
// Multiple Addresses with View All / View Less
// =============================================================================

Scenario('Registered shopper with 4+ addresses can use View All/View Less and add new address', async () => {
    const setupResult = await registeredShopperSetupFlow.execute();

    await checkoutPage.addMultipleAddressesToProfile([
        {
            addressId: `addr_shipping_${Date.now()}_1`,
            firstName: 'Address',
            lastName: 'Two',
            address1: '200 Second St',
            city: 'Cambridge',
            stateCode: 'MA',
            postalCode: '02139',
            countryCode: 'US',
            phone: '5559876543',
            preferred: false,
        },
        {
            addressId: `addr_shipping_${Date.now()}_2`,
            firstName: 'Address',
            lastName: 'Three',
            address1: '300 Third Ave',
            city: 'Somerville',
            stateCode: 'MA',
            postalCode: '02143',
            countryCode: 'US',
            phone: '5551112222',
            preferred: false,
        },
        {
            addressId: `addr_shipping_${Date.now()}_3`,
            firstName: 'Address',
            lastName: 'Four',
            address1: '400 Fourth Rd',
            city: 'Brookline',
            stateCode: 'MA',
            postalCode: '02445',
            countryCode: 'US',
            phone: '5553334444',
            preferred: false,
        },
    ]);

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    await checkoutPage.expandShippingAddressForSavedAddresses();

    const hasSavedAddresses = await checkoutPage.isSavedAddressesListVisible();
    expect(hasSavedAddresses, 'Saved addresses list should be visible').to.be.true;

    const firstAddressText = await checkoutPage.getSavedAddressText(0);
    expect(firstAddressText, 'Default address should be at the top').to.include(setupResult.addressData.city);

    const initialVisibleCount = await checkoutPage.getSavedAddressCount();
    expect(initialVisibleCount, 'Should display exactly 3 addresses initially').to.equal(3);

    const viewAllVisible = await checkoutPage.isViewAllVisible();
    expect(viewAllVisible, 'View All button should be visible with 4+ addresses').to.be.true;

    checkoutPage.clickViewAllAddresses();

    const expandedCount = await checkoutPage.getSavedAddressCount();
    expect(expandedCount, 'Should display all 4 addresses after View All').to.equal(4);

    const viewLessVisible = await checkoutPage.isViewLessVisible();
    expect(viewLessVisible, 'View Less button should be visible after expanding').to.be.true;

    checkoutPage.clickViewLessAddresses();

    const collapsedCount = await checkoutPage.getSavedAddressCount();
    expect(collapsedCount, 'Should display 3 addresses again after View Less').to.equal(3);

    checkoutPage.clickAddNewAddress();

    const modalOpen = await checkoutPage.isAddressModalOpen();
    expect(modalOpen, 'Address modal should open').to.be.true;

    checkoutPage.fillAddressModal({
        firstName: TEST_SHIPPING_ADDRESS_ALT.firstName,
        lastName: TEST_SHIPPING_ADDRESS_ALT.lastName,
        address1: TEST_SHIPPING_ADDRESS_ALT.address1,
        city: TEST_SHIPPING_ADDRESS_ALT.city,
        stateCode: TEST_SHIPPING_ADDRESS_ALT.stateCode,
        postalCode: TEST_SHIPPING_ADDRESS_ALT.postalCode,
    });

    checkoutPage.clickAddressModalSave();
    checkoutPage.waitForAddressModalClosed();

    const previewText = await checkoutPage.getShippingAddressPreviewText();
    expect(previewText, 'Shipping preview should show the new address').to.include(TEST_SHIPPING_ADDRESS_ALT.city);

    await checkoutPage.selectShippingMethod(0);
    checkoutPage.clickPlaceOrder();

    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();
    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);

    accountAddressesPage.navigate();
    accountAddressesPage.validatePageLoaded();
    const profileAddressCount = await accountAddressesPage.getAddressCount();
    expect(profileAddressCount, 'Profile should have at least 5 addresses after adding a new one').to.be.at.least(5);
})
    .tag('@view-all-addresses')
    .tag('@multiple-addresses')
    .tag('@add-address')
    .tag('@address-modal')
    .tag('@place-order');

Scenario('Registered shopper can select non-default saved address and place order', async () => {
    const setupResult = await registeredShopperSetupFlow.execute();

    await checkoutPage.addMultipleAddressesToProfile([
        {
            addressId: `addr_saved_${Date.now()}_1`,
            firstName: 'Shipping',
            lastName: 'AddressTwo',
            address1: '200 Second Street',
            city: 'Austin',
            stateCode: 'TX',
            postalCode: '78701',
            countryCode: 'US',
            phone: '5129998888',
            preferred: false,
        },
        {
            addressId: `addr_saved_${Date.now()}_2`,
            firstName: 'Shipping',
            lastName: 'AddressThree',
            address1: '300 Third Avenue',
            city: 'Denver',
            stateCode: 'CO',
            postalCode: '80202',
            countryCode: 'US',
            phone: '3037776666',
            preferred: false,
        },
    ]);

    const productInfo = await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    expect(productInfo, 'Product should be added to cart').to.not.be.undefined;

    checkoutPage.validatePageLoaded();
    await checkoutPage.expandShippingAddressForSavedAddresses();

    const hasSavedAddresses = await checkoutPage.isSavedAddressesListVisible();
    expect(hasSavedAddresses, 'Saved addresses list should be visible').to.be.true;

    const addressCount = await checkoutPage.getSavedAddressCount();
    expect(addressCount, 'Should have at least 3 saved addresses').to.be.at.least(3);

    const firstAddressText = await checkoutPage.getSavedAddressText(0);
    expect(firstAddressText, 'Default address should be at the top').to.include(setupResult.addressData.city);

    // Find and select the Austin address (addresses are sorted by addressId)
    let austinIndex = -1;
    for (let i = 0; i < addressCount; i++) {
        const addressText = await checkoutPage.getSavedAddressText(i);
        if (addressText.includes('Austin')) {
            austinIndex = i;
            break;
        }
    }
    expect(austinIndex, 'Should find Austin address in the list').to.be.greaterThan(-1);

    await checkoutPage.selectSavedAddress(austinIndex);

    const selectedAddressText = await checkoutPage.getSavedAddressText(austinIndex);
    expect(selectedAddressText, 'Selected address should be Austin address').to.include('Austin');

    checkoutPage.clickContinueToShippingOptions();

    const previewText = await checkoutPage.getShippingAddressPreviewText();
    expect(previewText, 'Shipping preview should show the selected address').to.include('Austin');
    expect(previewText, 'Shipping preview should show the selected address').to.include('200 Second Street');

    await checkoutPage.selectShippingMethod(0);
    checkoutPage.clickPlaceOrder();
    checkoutPage.waitForOrderConfirmation();
    checkoutPage.validateOrderConfirmation();
    const orderNumber = await checkoutPage.getOrderNumber();

    expect(orderNumber, 'Order number should be returned').to.not.be.empty;
    expect(orderNumber, 'Order number should be numeric').to.match(/^\d+$/);
})
    .tag('@select-saved-address')
    .tag('@non-default-address')
    .tag('@place-order');

export {};
