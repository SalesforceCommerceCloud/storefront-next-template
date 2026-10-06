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
 * Checkout Shipping Options - Promotional Pricing Display
 *
 * Validates that after a guest enters a shipping address, the shipping options
 * step stays open (radio group visible) so the shopper can review promotional
 * prices before continuing - instead of auto-advancing to the payment step.
 *
 * Uses the womens-jewelry-bundleM product on the global/en-GB site, which has
 * a free-shipping promotion on at least one shipping method.
 *
 * The site prefix (/global/en-GB) is intentionally hardcoded because this test
 * targets a specific site+locale combination. buildSitePath() would double-prefix
 * when SITE_ALIAS/LOCALE env vars are set, so we navigate directly via page object
 * methods that accept explicit prefixed paths.
 */

Feature('Checkout Shipping Options Promo').tag('@checkout').tag('@shipping-promo');

const { I, checkoutPage, productDetailPage } = inject();
import { expect } from 'chai';
import { TEST_SHIPPING_ADDRESS, TEST_PAYMENT, generateTestEmail } from '../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../utils/login-prefs-stub';

installLoginPrefsStubHooks();

Scenario('Guest sees shipping options form after entering address - should not skip to payment', async () => {
    // Navigate directly to the product page for the en-GB site.
    // productDetailPage.navigate() applies buildSitePath, which would double-prefix the
    // hardcoded /global/en-GB segment. Use I.amOnPage with the literal path instead
    // (same pattern as performance.spec.ts).
    I.amOnPage('/global/en-GB/p/womens-jewelry-bundleM');
    await productDetailPage.waitForPageReady();

    // The bundle has no variants to select; add directly to cart
    await productDetailPage.addToCartAndWaitForOutcome(15);

    // Navigate to checkout on the same site
    checkoutPage.navigateWithPrefix('/global/en-GB/checkout');
    checkoutPage.validatePageLoaded();

    // Fill contact info
    await checkoutPage.fillContactInfo(generateTestEmail('shipping-promo-guest'));

    // Fill shipping address and submit
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);

    // KEY ASSERTION: shipping options form must be visible (radio group open).
    // If auto-advance is broken, the page skips to the payment card instead.
    const shippingFormVisible = await checkoutPage.isShippingOptionsFormVisible();
    expect(shippingFormVisible, 'Shipping options radio inputs should be visible after address submission').to.be.true;

    // Payment card should NOT be in edit mode yet.
    const paymentOpen = await checkoutPage.isPaymentFormOpen();
    expect(paymentOpen, 'BUG: Checkout skipped shipping options and jumped to payment after address submission').to.be
        .false;

    // Wait for price recalculation (auto-submit fires on mount to apply promo prices),
    // then click Continue to Payment. The button re-enables once recalculation is done.
    await checkoutPage.waitForShippingRecalcAndContinue(30);

    // Complete checkout to confirm the full flow still works
    await checkoutPage.fillPaymentInfo(TEST_PAYMENT);
}).tag('@guest-checkout');

export {};
