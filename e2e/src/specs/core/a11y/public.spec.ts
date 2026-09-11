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

// Infrastructure failures (timeouts, nav errors) should be retried.
// A11yBaselineError (real violations) suppresses retries via the a11yNoRetry plugin.
Feature('Accessibility Tests').tag('@a11y').tag('@public-a11y').retry(2);

const {
    storefrontPage,
    productListPage,
    productDetailPage,
    cartPage,
    checkoutPage,
    loginPage,
    signupPage,
    addToCartFlow,
} = inject();
import { TEST_PRODUCT_CATEGORIES } from '../../../test-data/checkout.data';
import { beginScan, scanAndAssert, navigateTo } from '../../../utils/a11y-utils';
import { SEVERITY_LEGEND } from '../../../utils/a11y-report-utils';

BeforeSuite(() => {
    console.log(`\n${SEVERITY_LEGEND}\n`);
});

// =============================================================================
// Scenarios
// =============================================================================

// Every scenario waits on its page's real content before scanning. That wait is
// what keeps axe from racing the document-commit window and scanning before the
// `<head>` is in place, when the document has no `<html lang>` / `<title>` yet. That
// was the flake that hit the homepage legs, which previously scanned straight after
// navigate() with no readiness wait.
//
// The homepage uses waitForHomepageReady(), not validatePageLoaded(): it waits for the nav
// menu PRESENCE (real body content) AND directly for a non-empty `<html lang>` / `<title>`
// (the attributes html-has-lang / document-title read), falling through to the scan on
// timeout so a genuine violation still surfaces. Presence, not visibility, because the a11y
// suite scans both desktop and mobile and on mobile the nav is collapsed behind the
// hamburger. See the method's docs.
//
// Login and Signup use validateA11yReady(), not validatePageLoaded(): they wait only for
// controls shared by both auth modes (the email field; and for signup, name fields + the
// submit button matched by type). validatePageLoaded() asserts the password / "Sign In"
// controls, which email-verification (passwordless) login/signup does not render, so it
// would fail before axe under that supported configuration. See the methods' docs.

Scenario('Homepage accessibility', async () => {
    const viewport = await beginScan('homepage');
    storefrontPage.navigate();
    await storefrontPage.waitForHomepageReady();
    await scanAndAssert('homepage', viewport);
}).tag('@homepage');

Scenario('Product List Page accessibility', async () => {
    const viewport = await beginScan('plp');
    navigateTo('/category/womens-clothing-tops');
    productListPage.validateProductsDisplayed();
    await scanAndAssert('plp', viewport);
}).tag('@plp');

Scenario('Product Detail Page accessibility', async () => {
    const viewport = await beginScan('pdp');
    navigateTo('/product/25502228M');
    await productDetailPage.waitForPageReady();
    await scanAndAssert('pdp', viewport);
}).tag('@pdp');

Scenario('Search Results accessibility', async () => {
    const viewport = await beginScan('search');
    storefrontPage.navigate();
    storefrontPage.searchForProduct('shirt');
    productListPage.validateProductsDisplayed();
    await scanAndAssert('search', viewport);
}).tag('@search');

Scenario('Cart Page accessibility', async () => {
    const viewport = await beginScan('cart');
    await addToCartFlow.execute(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    cartPage.navigate();
    cartPage.validatePageLoaded();
    await scanAndAssert('cart', viewport);
}).tag('@cart');

Scenario('Checkout Page accessibility', async () => {
    const viewport = await beginScan('checkout');
    await addToCartFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    checkoutPage.validatePageLoaded();
    await scanAndAssert('checkout', viewport);
}).tag('@checkout');

Scenario('Login Page accessibility', async () => {
    const viewport = await beginScan('login');
    loginPage.navigate();
    loginPage.validateA11yReady();
    await scanAndAssert('login', viewport);
}).tag('@login');

Scenario('Signup Page accessibility', async () => {
    const viewport = await beginScan('signup');
    signupPage.navigate();
    signupPage.validateA11yReady();
    await scanAndAssert('signup', viewport);
}).tag('@signup');

export {};
