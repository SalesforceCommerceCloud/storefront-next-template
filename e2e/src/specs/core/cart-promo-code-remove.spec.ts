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
 * Regression: clicking the X next to an applied coupon badge in the cart did
 * nothing because the icon was a direct SVG child of <Badge>, which carries
 * `[&>svg]:pointer-events-none`. The X is now wrapped in a real <Button>, so
 * the click reaches the handler and the coupon is removed via the
 * /action/promo-code-remove route.
 */
Feature('Cart Promo Code Remove').tag('@core').tag('@cart').tag('@promo-code');

const { storefrontPage, productDetailPage, cartPage } = inject();
import { expect } from 'chai';

const PRODUCT_PATH = '/product/25752235M?color=YELLOSI&pid=682875540326M';
const COUPON_CODE = '5ties';

Before(async () => {
    await storefrontPage.clearCookies();
});

Scenario('Guest shopper can remove an applied coupon from the cart by clicking the X', async () => {
    productDetailPage.navigate(PRODUCT_PATH);
    await productDetailPage.waitForPageReady();
    // The `pid` in PRODUCT_PATH pre-selects the qualifying YELLOSI variant — the only
    // variant of this master that `5ties` discounts. Do NOT call selectAllVariants():
    // it clicks the first swatch (Cobalt), navigating off the qualifying variant so the
    // coupon parks as `no_applicable_promotion` and no badge renders.

    const enabled = await productDetailPage.waitForAddToCartReady();
    expect(enabled, 'Add to Cart should be enabled for the test product').to.equal(true);

    const outcome = await productDetailPage.addToCartAndWaitForOutcome(15);
    expect(outcome, 'Add to cart should succeed').to.equal('success');

    cartPage.navigate('/cart');
    cartPage.validateCartHasItems();

    await cartPage.expandPromoCodeAccordion();
    cartPage.applyPromoCode(COUPON_CODE);

    // Apply is a fetcher submit — wait for the badge to render after the SCAPI round-trip.
    cartPage.waitForCouponApplied(COUPON_CODE);
    const couponApplied = await cartPage.isCouponApplied(COUPON_CODE);
    expect(couponApplied, `Coupon "${COUPON_CODE}" should appear as a badge after apply`).to.equal(true);

    cartPage.removeAppliedCoupon(COUPON_CODE);
    cartPage.waitForCouponRemoved(COUPON_CODE);

    const stillApplied = await cartPage.isCouponApplied(COUPON_CODE);
    expect(stillApplied, `Coupon "${COUPON_CODE}" should be removed after clicking X`).to.equal(false);
}).tag('@coupon-remove');

export {};
