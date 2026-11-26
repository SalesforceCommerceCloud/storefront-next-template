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
 * Regression: one apply or remove response must produce exactly one toast.
 * A re-render with a new callback identity used to replay the toast, and Apply
 * stayed enabled while the cart revalidated, so a second press sent a second request.
 */
Feature('Cart Promo Code Toast').tag('@core').tag('@cart').tag('@promo-code');

const { storefrontPage, productDetailPage, cartPage } = inject();
import { expect } from 'chai';

const PRODUCT_PATH = '/p/25752235M?color=YELLOSI&pid=682875540326M';
const COUPON_CODE = '5ties';
const INVALID_COUPON_CODE = 'FAKECODE123';
const APPLY_SUCCESS = 'Promotion was applied.';
const REMOVE_SUCCESS = 'Promotion was removed.';

Before(async () => {
    await storefrontPage.clearCookies();
    productDetailPage.navigate(PRODUCT_PATH);
    await productDetailPage.waitForPageReady();
    const enabled = await productDetailPage.waitForAddToCartReady();
    expect(enabled, 'Add to Cart should be enabled for the test product').to.equal(true);
    const outcome = await productDetailPage.addToCartAndWaitForOutcome(15);
    expect(outcome, 'Add to cart should succeed').to.equal('success');
    cartPage.navigate('/cart');
    cartPage.validateCartHasItems();
    await cartPage.expandPromoCodeAccordion();
});

Scenario('Applying then removing a coupon shows one toast per response', async () => {
    cartPage.applyPromoCode(COUPON_CODE);
    expect(
        await cartPage.countToastsAfterSettle(cartPage.toastWithText(APPLY_SUCCESS)),
        'apply success toasts'
    ).to.equal(1);
    cartPage.waitForCouponApplied(COUPON_CODE);

    cartPage.removeAppliedCoupon(COUPON_CODE);
    expect(
        await cartPage.countToastsAfterSettle(cartPage.toastWithText(REMOVE_SUCCESS)),
        'remove success toasts'
    ).to.equal(1);
    cartPage.waitForCouponRemoved(COUPON_CODE);
}).tag('@promo-toast-once');

Scenario('An invalid coupon shows one error toast', async () => {
    cartPage.applyPromoCode(INVALID_COUPON_CODE);
    expect(await cartPage.countToastsAfterSettle(cartPage.errorToast()), 'apply error toasts').to.equal(1);
}).tag('@promo-toast-once');

export {};
