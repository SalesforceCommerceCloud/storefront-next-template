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
 * Multi-Site Switching Tests
 *
 * Tests site switching by navigating directly between site/locale URL prefixes.
 * Only runs for the prefix-site-locale config (/:siteId/:localeId) since that is
 * the only configuration where both sites are accessible via path prefix.
 *
 * Site switching is done via direct URL navigation (the SiteSwitcher component
 * is not currently rendered in the storefront layout).
 *
 * Self-skips for other URL configs via Scenario.skip when SITE_ALIAS and LOCALE
 * don't match the prefix-site-locale preset (global / en-GB).
 */

Feature('Multi-Site Switching').tag('@multi-site').tag('@multi-site-switch');

const { storefrontPage, productListPage, addToCartFlow, cartPage, checkoutPage, loginFlow } = inject();
import { expect } from 'chai';
import { TEST_SHIPPING_ADDRESS, TEST_PAYMENT, generateTestEmail } from '../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../utils/login-prefs-stub';

installLoginPrefsStubHooks();

// Only run site-switching tests for the prefix-site-locale config
const isPrefixSiteLocale = process.env.SITE_ALIAS === 'global' && process.env.LOCALE === 'en-GB';
const scenarioFn = isPrefixSiteLocale ? Scenario : Scenario.skip;

Before(async () => {
    await storefrontPage.clearCookies();
});

scenarioFn('Navigate to RefArchGlobal site and verify SFCC cookies', async () => {
    storefrontPage.navigateToUrl('/global/en-GB/c/mens-clothing-jackets');
    storefrontPage.validatePageLoaded();

    const productCount = await productListPage.getProductCount();
    expect(productCount, 'RefArchGlobal category page should display products').to.be.greaterThan(0);

    await storefrontPage.validateSFCCCookies('RefArchGlobal');
}).tag('@refarchglobal');

scenarioFn('Navigate to RefArch (US) site and verify SFCC cookies', async () => {
    storefrontPage.navigateToUrl('/us/en-US/c/mens-clothing-jackets');
    storefrontPage.validatePageLoaded();

    const productCount = await productListPage.getProductCount();
    expect(productCount, 'RefArch category page should display products').to.be.greaterThan(0);

    await storefrontPage.validateSFCCCookies('RefArch');
}).tag('@refarch');

scenarioFn('Switch between sites and verify each loads correctly', async () => {
    // Start on RefArchGlobal
    storefrontPage.navigateToUrl('/global/en-GB/c/mens-clothing-jackets');
    storefrontPage.validatePageLoaded();
    await storefrontPage.validateSFCCCookies('RefArchGlobal');

    const globalProductCount = await productListPage.getProductCount();
    expect(globalProductCount, 'RefArchGlobal should display products').to.be.greaterThan(0);

    // Switch to RefArch (US)
    storefrontPage.navigateToUrl('/us/en-US/c/mens-clothing-jackets');
    storefrontPage.validatePageLoaded();
    await storefrontPage.validateSFCCCookies('RefArch');

    const usProductCount = await productListPage.getProductCount();
    expect(usProductCount, 'RefArch should display products').to.be.greaterThan(0);

    // Switch back to RefArchGlobal
    storefrontPage.navigateToUrl('/global/en-GB/c/mens-clothing-jackets');
    storefrontPage.validatePageLoaded();
    await storefrontPage.validateSFCCCookies('RefArchGlobal');
}).tag('@site-switch-roundtrip');

scenarioFn('Add to cart on RefArch (US) site via URL prefix', async () => {
    const sitePrefix = '/us/en-US';
    const productInfo = await addToCartFlow.execute('c/mens-clothing-jackets', { sitePrefix });

    storefrontPage.navigateToUrl(`${sitePrefix}/cart`);
    cartPage.validateCartHasItems();

    const cartItemCount = await cartPage.getCartItemCount();
    expect(cartItemCount, 'Cart should have at least 1 item on RefArch site').to.be.greaterThan(0);

    let foundItem = false;
    for (let i = 0; i < cartItemCount; i++) {
        const cartItemTitle = await cartPage.getItemTitle(i);
        if (cartItemTitle.toLowerCase().includes(productInfo.title.toLowerCase())) {
            foundItem = true;
            break;
        }
    }
    expect(foundItem, `RefArch cart should contain product "${productInfo.title}"`).to.be.true;
}).tag('@add-to-cart-us');

scenarioFn('Guest checkout on RefArch (US) site completes successfully', async () => {
    const sitePrefix = '/us/en-US';
    await addToCartFlow.executeAndNavigateToCheckout('c/mens-clothing-jackets', 3, { sitePrefix });

    checkoutPage.validatePageLoaded();

    const orderNumber = await checkoutPage.completeCheckout({
        email: generateTestEmail('multi-site-us'),
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT,
    });

    expect(orderNumber, 'Should receive a valid order number on RefArch site').to.match(/^\d+$/);
})
    .tag('@checkout-us')
    .tag('@smoke');

scenarioFn('Registered shopper checkout on RefArch (US) site completes successfully', async () => {
    // Login on default site — session cookies are shared across sites
    await loginFlow.execute();

    const sitePrefix = '/us/en-US';
    await addToCartFlow.executeAndNavigateToCheckout('c/mens-clothing-jackets', 3, { sitePrefix });

    checkoutPage.validatePageLoaded();

    const prefilledEmail = await checkoutPage.getPrefilledEmail();
    const emailToUse = prefilledEmail || generateTestEmail('multi-site-us-registered');

    const orderNumber = await checkoutPage.completeCheckout({
        email: emailToUse,
        shippingAddress: TEST_SHIPPING_ADDRESS,
        payment: TEST_PAYMENT,
    });

    expect(orderNumber, 'Registered shopper should receive a valid order number on RefArch site').to.match(/^\d+$/);
})
    .tag('@checkout-us-registered')
    .tag('@smoke');

export {};
