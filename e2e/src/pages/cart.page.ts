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

import { buildSitePath } from '../utils/url-utils';

const { I } = inject();

/**
 * Cart Page Object
 * Handles interactions with the shopping cart page
 */
class CartPage {
    // Locators for cart page elements
    locators = {
        // Cart container
        cartContainer: locate('main, [data-testid*="cart"], [class*="cart"]').as('Cart Container'),

        // Cart items - based on actual HTML: data-testid="sf-product-item-..."
        cartItems: locate('[data-testid*="product-item"]').as('Cart Items'),

        // Item details within cart items
        // Title: <h2><a title="Product Name">...</a></h2>
        itemTitle: locate('h2 a').as('Item Title'),

        // Price: the visible price text of a cart line item. The accessible name ("Current
        // price: $...") now lives in an adjacent sr-only span, so grab the aria-hidden visible
        // span to get clean price text. Scoped to the price column because the product-image
        // link in the item is also aria-hidden. On-sale items add a second aria-hidden span
        // (list price) after the current price, so getItemPrice takes .first().
        itemPrice: locate('[data-testid="desktop-product-price"] [aria-hidden="true"]').as('Item Price'),

        // Quantity: number input (aria-label may be "Quantity:" or "Qty:"; fallback to any number input in item)
        itemQuantity: locate('input[type="number"]').as('Item Quantity'),

        // Cart summary
        subtotal: locate('[data-testid*="subtotal"], [class*="subtotal"]').as('Cart Subtotal'),
        totalPrice: locate('[data-testid*="total"], [class*="total-price"]').as('Total Price'),
        itemCount: locate('[data-testid*="item-count"], [class*="item-count"]').as('Item Count'),

        // Cart actions
        checkoutButton: locate(
            'button[data-testid*="checkout"], button:has-text("Checkout"), a:has-text("Checkout")'
        ).as('Checkout Button'),
        continueShoppingButton: locate('button:has-text("Continue Shopping"), a:has-text("Continue Shopping")').as(
            'Continue Shopping Button'
        ),

        // removeButton: data-testid only (bo-selector parser rejects :has-text and i flag)
        removeButton: locate('button[data-testid*="remove"]').as('Remove Button'),
        // Cart uses RemoveItemButtonWithConfirmation; confirm dialog must be accepted to complete removal
        removeConfirmButton: locate('[role="alertdialog"]')
            .find(locate('button').withText('Yes, remove item'))
            .as('Remove Confirm Button'),
        updateQuantityButton: locate('button[data-testid*="update"]').as('Update Quantity Button'),

        // Empty cart state
        emptyCartMessage: locate(
            '[data-testid*="empty-cart"], :has-text("Your cart is empty"), :has-text("No items in cart")'
        ).as('Empty Cart Message'),

        // Cart icon badge (item count)
        cartBadge: locate('[data-testid*="cart-count"], [data-testid*="cart-badge"], [class*="badge"]').as(
            'Cart Badge'
        ),

        // Promo code form (cart page)
        promoCodeForm: locate('[data-testid="promo-code-form"]').as('Promo Code Form'),
        promoCodeAccordionTrigger: locate('button')
            .withText('Enter a Promotion Code')
            .as('Promo Code Accordion Trigger'),
        promoCodeInput: locate('[data-testid="promo-code-form"] input[name="code"]').as('Promo Code Input'),
        promoCodeApplyButton: locate('[data-testid="promo-code-form"] button[type="submit"]').as(
            'Promo Code Apply Button'
        ),
        // The applied coupons list — wraps each badge + Remove button row.
        appliedCouponsList: locate('[data-testid="applied-coupons"]').as('Applied Coupons List'),
        // Remove (X) button next to an applied coupon badge. Scoped to the applied-coupons list
        // so the locator never collides with cart line-item remove buttons elsewhere on the page.
        promoCodeRemoveButton: locate('[data-testid="applied-coupons"] button[aria-label^="Remove"]').as(
            'Promo Code Remove Button'
        ),
    };

    /**
     * Navigate to cart page
     * @param url - Cart URL (defaults to /cart)
     */
    navigate(url: string = '/cart'): void {
        I.amOnPage(buildSitePath(url));
    }

    /**
     * Get the title of a cart item by index
     * @param index - Cart item index (0-based, default: 0 for first item)
     * @returns Promise<string> - Item title text
     */
    async getItemTitle(index: number = 0): Promise<string> {
        const cartItem = this.locators.cartItems.at(index + 1);
        const title = await I.grabTextFrom(cartItem.find(this.locators.itemTitle));
        return title.trim();
    }

    /**
     * Get the price of a cart item by index
     * @param index - Cart item index (0-based, default: 0 for first item)
     * @returns Promise<string> - Item price text
     */
    async getItemPrice(index: number = 0): Promise<string> {
        const cartItem = this.locators.cartItems.at(index + 1);
        const price = await I.grabTextFrom(cartItem.find(this.locators.itemPrice).first());
        return price.trim();
    }

    /**
     * Get the quantity of a cart item by index
     * @param index - Cart item index (0-based, default: 0 for first item)
     * @returns Promise<string> - Item quantity
     */
    async getItemQuantity(index: number = 0): Promise<string> {
        const cartItem = this.locators.cartItems.at(index + 1);

        try {
            // Try to grab value from input field
            const quantity = await I.grabValueFrom(cartItem.find(this.locators.itemQuantity));
            return quantity.trim();
        } catch {
            // Fallback: grab text content if not an input field
            const quantity = await I.grabTextFrom(cartItem.find(this.locators.itemQuantity));
            return quantity.trim();
        }
    }

    /**
     * Get total number of items in cart
     * @returns Promise<number> - Number of cart items
     */
    async getCartItemCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.cartItems);
    }

    /**
     * Get cart subtotal
     * @returns Promise<string> - Subtotal text
     */
    async getSubtotal(): Promise<string> {
        const subtotal = await I.grabTextFrom(this.locators.subtotal);
        return subtotal.trim();
    }

    /**
     * Get cart total price
     * @returns Promise<string> - Total price text
     */
    async getTotalPrice(): Promise<string> {
        const total = await I.grabTextFrom(this.locators.totalPrice);
        return total.trim();
    }

    /**
     * Remove item by index. Clicks Remove then confirm dialog so removal completes (cart uses RemoveItemButtonWithConfirmation).
     */
    async removeItem(index: number = 0): Promise<void> {
        const cartItem = this.locators.cartItems.at(index + 1);
        I.click(cartItem.find(this.locators.removeButton));
        for (let i = 0; i < 10; i++) {
            const visible = (await I.grabNumberOfVisibleElements(this.locators.removeConfirmButton)) > 0;
            if (visible) {
                I.click(this.locators.removeConfirmButton);
                I.wait(2);
                return;
            }
            I.wait(0.5);
        }
    }

    /**
     * Update quantity for a cart item
     * @param index - Cart item index (0-based)
     * @param quantity - New quantity value
     */
    async updateItemQuantity(index: number, quantity: number): Promise<void> {
        const cartItem = this.locators.cartItems.at(index + 1);
        I.fillField(cartItem.find(this.locators.itemQuantity), quantity.toString());

        // Check if there's an "Update" button and click it
        const updateButtonVisible = await I.grabNumberOfVisibleElements(this.locators.updateQuantityButton);
        if (updateButtonVisible > 0) {
            I.click(this.locators.updateQuantityButton);
        }
    }

    /**
     * Continue to checkout
     */
    continueToCheckout(): void {
        I.click(this.locators.checkoutButton);
    }

    /**
     * Continue shopping (return to storefront)
     */
    continueShopping(): void {
        I.click(this.locators.continueShoppingButton);
    }

    /**
     * Validate cart page is loaded
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.cartContainer);
    }

    /**
     * Validate cart is empty
     */
    validateCartEmpty(): void {
        I.seeElement(this.locators.emptyCartMessage);
    }

    /**
     * Validate cart contains items. Waits for items to appear (cart may load asynchronously).
     */
    validateCartHasItems(timeoutSeconds: number = 30): void {
        I.waitForElement(this.locators.cartItems, timeoutSeconds);
        I.seeElement(this.locators.cartItems);
    }

    /**
     * Expand the promo code accordion if it is collapsed.
     */
    async expandPromoCodeAccordion(): Promise<void> {
        I.scrollTo(this.locators.promoCodeAccordionTrigger);
        const expanded = await I.grabAttributeFrom(this.locators.promoCodeAccordionTrigger, 'data-state');
        if (expanded !== 'open') {
            I.click(this.locators.promoCodeAccordionTrigger);
        }
        I.seeElement(this.locators.promoCodeInput);
    }

    /**
     * Apply a promo code in the cart promo form.
     */
    applyPromoCode(code: string): void {
        I.fillField(this.locators.promoCodeInput, code);
        I.click(this.locators.promoCodeApplyButton);
    }

    /**
     * Locator for an applied coupon badge by its code text.
     */
    appliedCouponBadge(code: string) {
        return locate('[data-slot="badge"]').withText(code).as(`Applied Coupon Badge: ${code}`);
    }

    /**
     * True if a coupon with the given code shows in the applied list.
     */
    async isCouponApplied(code: string): Promise<boolean> {
        const count = await I.grabNumberOfVisibleElements(this.appliedCouponBadge(code));
        return count > 0;
    }

    /**
     * Wait for an applied coupon badge to render after submission.
     * Apply is a fetcher submit (async SCAPI round-trip); the badge appears once the basket re-renders.
     */
    waitForCouponApplied(code: string, timeoutSeconds: number = 15): void {
        I.waitForElement(this.appliedCouponBadge(code), timeoutSeconds);
    }

    /**
     * Remove the applied coupon by clicking the X button next to its badge.
     * The button's aria-label is "Remove {code}" (e.g. "Remove 5TIES"), so we match exactly on that.
     * Scoped to `[data-testid="applied-coupons"]` to avoid collisions with cart line-item remove buttons.
     */
    removeAppliedCoupon(code: string): void {
        const removeButton = locate(`[data-testid="applied-coupons"] button[aria-label="Remove ${code}"]`).as(
            `Remove Button for Coupon: ${code}`
        );
        I.click(removeButton);
    }

    /**
     * Wait until a coupon with the given code is no longer present in the applied list.
     * The remove call is an async API request, so we poll for the badge to disappear.
     */
    waitForCouponRemoved(code: string, timeoutSeconds: number = 10): void {
        I.waitForInvisible(this.appliedCouponBadge(code), timeoutSeconds);
    }

    /**
     * Validate a specific item is in the cart
     * @param expectedTitle - Expected item title (partial match)
     * @param expectedQuantity - Expected quantity
     * @param expectedPrice - Expected price (partial match)
     */
    async validateItemInCart(expectedTitle: string, expectedQuantity: string, expectedPrice: string): Promise<void> {
        // Get first item details
        const actualTitle = await this.getItemTitle(0);
        const actualQuantity = await this.getItemQuantity(0);
        const actualPrice = await this.getItemPrice(0);

        // Validate title contains expected text (case-insensitive partial match)
        if (!actualTitle.toLowerCase().includes(expectedTitle.toLowerCase())) {
            throw new Error(`Expected cart item title to contain "${expectedTitle}", but got "${actualTitle}"`);
        }

        // Validate quantity matches
        if (actualQuantity !== expectedQuantity) {
            throw new Error(`Expected cart item quantity to be "${expectedQuantity}", but got "${actualQuantity}"`);
        }

        // Validate price matches (handle potential formatting differences)
        const normalizedActualPrice = actualPrice.replace(/\s+/g, '');
        const normalizedExpectedPrice = expectedPrice.replace(/\s+/g, '');

        if (!normalizedActualPrice.includes(normalizedExpectedPrice)) {
            throw new Error(`Expected cart item price to contain "${expectedPrice}", but got "${actualPrice}"`);
        }
    }
}

// Export as singleton following CodeceptJS pattern
const cartPageInstance = new CartPage();
export = cartPageInstance;
