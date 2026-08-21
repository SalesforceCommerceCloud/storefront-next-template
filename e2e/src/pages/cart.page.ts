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

        // Mobile order-summary panel — position: fixed at narrow widths, hidden at md and up.
        mobileSummaryPanel: locate('[data-testid="sf-cart-mobile-summary-panel"]').as('Mobile Summary Panel'),
        mobileSummaryAccordionTrigger: locate('[data-testid="sf-cart-mobile-summary-panel"] button')
            .first()
            .as('Mobile Summary Accordion Trigger'),
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
     * Expand the mobile order-summary accordion (the fixed-bottom panel's trigger) if collapsed.
     */
    async expandMobileSummaryAccordion(): Promise<void> {
        const expanded = await I.grabAttributeFrom(this.locators.mobileSummaryAccordionTrigger, 'data-state');
        if (expanded !== 'open') {
            I.click(this.locators.mobileSummaryAccordionTrigger);
        }
    }

    /**
     * Read the mobile summary panel's live height and the cart container's real computed
     * bottom padding. cart-content.tsx mirrors one into the other via a ResizeObserver
     * (`--cart-mobile-summary-spacer`) so cart content always has genuine layout space under
     * the fixed panel - this is what a regression in that wiring would desync.
     *
     * Polls briefly for the two values to agree before reading, since they are only guaranteed
     * synchronized at the instant the ResizeObserver callback fires (e.g. right after an
     * accordion-expand click, before the panel's transition settles). Falls through to a final
     * read on timeout so a genuine desync still produces a readable assertion failure instead of
     * an opaque Playwright timeout.
     */
    async getMobileSummarySpacerSync(): Promise<{ panelHeightPx: number; containerPaddingBottomPx: number }> {
        return await (I.usePlaywrightTo(
            'measure mobile summary panel height vs container padding',
            async ({ page }) => {
                const read = () =>
                    page.evaluate(() => {
                        const panel = document.querySelector('[data-testid="sf-cart-mobile-summary-panel"]');
                        const container = document.querySelector('[data-testid="sf-cart-container"]');
                        return {
                            panelHeightPx: panel ? (panel as HTMLElement).offsetHeight : -1,
                            containerPaddingBottomPx: container
                                ? parseFloat(getComputedStyle(container).paddingBottom)
                                : -1,
                        };
                    });

                await page
                    .waitForFunction(
                        () => {
                            const panel = document.querySelector('[data-testid="sf-cart-mobile-summary-panel"]');
                            const container = document.querySelector('[data-testid="sf-cart-container"]');
                            if (!panel || !container) return false;
                            const panelHeight = (panel as HTMLElement).offsetHeight;
                            const paddingBottom = parseFloat(getComputedStyle(container).paddingBottom);
                            return panelHeight > 0 && panelHeight === paddingBottom;
                        },
                        undefined,
                        { timeout: 2000 }
                    )
                    .catch(() => {
                        /* settle didn't converge in time; fall through to a final read so a real desync fails loudly */
                    });

                return read();
            }
        ) as unknown as Promise<{ panelHeightPx: number; containerPaddingBottomPx: number }>);
    }

    /**
     * Prove the TRUE last focusable control in the final cart line item - the last cart action a
     * keyboard user actually reaches - stays fully usable under the fixed mobile summary panel at
     * high zoom / narrow width (WCAG 2.4.11 Focus Not Obscured).
     *
     * Targeting the last Remove button is not enough: `ProductItem` renders the secondary actions
     * (Remove / Edit / Add to wishlist) BEFORE the quantity picker and `lineItemExtra` (the gift
     * checkbox and its "Learn more" control), so a later control can still be obscured while the
     * Remove-button assertion passes. This enumerates every visible focusable control in the last
     * line item and targets the last one in DOM (tab) order, marking it with a temporary attribute so
     * it can be recognised mid-traversal regardless of whether it carries a testid. Stronger than a
     * bounding-box overlap check, it:
     *   1. reaches the control by REAL Tab traversal (`page.keyboard.press('Tab')`), not a
     *      programmatic `.focus()`, so tab order and native focus scroll-into-view (which respects
     *      `scroll-padding-bottom`) are exercised exactly as a keyboard user experiences them;
     *   2. asserts the focused control is fully inside the viewport (top >= 0 && bottom <= innerHeight),
     *      i.e. not scrolled off-screen behind the panel or below the fold;
     *   3. asserts it sits fully above the fixed panel (control bottom <= panel top);
     *   4. asserts it clears any header pinned across the top of the viewport (control top >= the
     *      bottom of a fixed/sticky header) - the lift must not park it behind the header instead.
     *      Canonical drops its header to `static` at short heights so this is trivially clear there;
     *      cosmetic keeps a fixed header, so this is the assertion that catches header overlap;
     *   5. pointer hit-tests the control centre (`elementFromPoint`) and confirms the topmost element
     *      there is the control (or a descendant) - i.e. the panel does not overlay it.
     *
     * `isRemoveButton` is reported so a caller can assert the target is a control AFTER the Remove
     * button (i.e. the coverage gap is genuinely closed), and `controlLabel` aids diagnostics.
     */
    async tabToLastFocusableCartControlAndCheckUsable(maxTabs: number = 300): Promise<{
        found: boolean;
        isRemoveButton: boolean;
        controlLabel: string;
        reachedByTab: boolean;
        tabCount: number;
        fullyInViewport: boolean;
        abovePanel: boolean;
        clearOfTopChrome: boolean;
        pointerHitsControl: boolean;
    }> {
        return await (I.usePlaywrightTo('tab to last focusable cart control and check usability', async ({ page }) => {
            const MARK = 'data-a11y-last-focusable';
            // Enumerate the visible focusable controls in the last line item and mark the last one.
            const target = await page.evaluate((mark: string) => {
                const items = Array.from(document.querySelectorAll('[data-testid^="sf-product-item-"]'));
                const lastItem = items[items.length - 1] as HTMLElement | undefined;
                if (!lastItem) {
                    return { found: false, isRemoveButton: false, controlLabel: '' };
                }
                const focusableSelector =
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
                const focusables = Array.from(lastItem.querySelectorAll(focusableSelector))
                    // The [tabindex] branch can match non-HTML elements (e.g. focusable SVG), which
                    // have no offsetParent — narrow to HTMLElement before measuring visibility.
                    .filter((el): el is HTMLElement => el instanceof HTMLElement)
                    // Keep only rendered controls (offsetParent is null for display:none subtrees).
                    .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
                const last = focusables[focusables.length - 1];
                if (!last) {
                    return { found: false, isRemoveButton: false, controlLabel: '' };
                }
                last.setAttribute(mark, '1');
                const testid = last.getAttribute('data-testid') ?? '';
                const controlLabel =
                    testid ||
                    last.getAttribute('aria-label') ||
                    (last.textContent ?? '').trim().slice(0, 40) ||
                    last.tagName;
                return { found: true, isRemoveButton: testid.includes('remove-item-'), controlLabel };
            }, MARK);

            if (!target.found) {
                return {
                    found: false,
                    isRemoveButton: false,
                    controlLabel: '',
                    reachedByTab: false,
                    tabCount: 0,
                    fullyInViewport: false,
                    abovePanel: false,
                    clearOfTopChrome: false,
                    pointerHitsControl: false,
                };
            }

            // Start from the top with focus cleared so Tab traversal is deterministic and doesn't
            // inherit focus from a prior interaction (e.g. the accordion-expand click).
            await page.evaluate(() => {
                (document.activeElement as HTMLElement | null)?.blur?.();
                window.scrollTo(0, 0);
            });

            let reachedByTab = false;
            let tabCount = 0;
            for (let i = 0; i < maxTabs; i++) {
                await page.keyboard.press('Tab');
                tabCount++;
                const onTarget = await page.evaluate(
                    (mark: string) => document.activeElement?.hasAttribute?.(mark) === true,
                    MARK
                );
                if (onTarget) {
                    reachedByTab = true;
                    break;
                }
            }

            // Measure the focused control vs the panel and any pinned header, and pointer hit-test it.
            const measured = await page.evaluate((mark: string) => {
                const el = document.querySelector(`[${mark}]`) as HTMLElement | null;
                const panel = document.querySelector('[data-testid="sf-cart-mobile-summary-panel"]');
                if (!el || !panel) {
                    return {
                        fullyInViewport: false,
                        abovePanel: false,
                        clearOfTopChrome: false,
                        pointerHitsControl: false,
                    };
                }
                const b = el.getBoundingClientRect();
                const p = panel.getBoundingClientRect();
                const vh = window.innerHeight;
                const fullyInViewport = b.top >= 0 && b.bottom <= vh && b.height > 0;
                const abovePanel = b.bottom <= p.top;
                // Bottom edge of any fixed/sticky header pinned across the top of the viewport.
                let chromeBottom = 0;
                for (const header of Array.from(document.querySelectorAll('header'))) {
                    const position = getComputedStyle(header).position;
                    if (position !== 'fixed' && position !== 'sticky') {
                        continue;
                    }
                    const hr = header.getBoundingClientRect();
                    if (hr.top <= 0 && hr.bottom > chromeBottom) {
                        chromeBottom = hr.bottom;
                    }
                }
                const clearOfTopChrome = b.top >= chromeBottom;
                const cx = b.left + b.width / 2;
                const cy = b.top + b.height / 2;
                const hit = document.elementFromPoint(cx, cy);
                const pointerHitsControl = !!hit && (hit === el || el.contains(hit));
                return { fullyInViewport, abovePanel, clearOfTopChrome, pointerHitsControl };
            }, MARK);

            // Remove the marker so it can't affect later assertions.
            await page.evaluate((mark: string) => {
                document.querySelector(`[${mark}]`)?.removeAttribute(mark);
            }, MARK);

            return {
                found: true,
                isRemoveButton: target.isRemoveButton,
                controlLabel: target.controlLabel,
                reachedByTab,
                tabCount,
                ...measured,
            };
        }) as unknown as Promise<{
            found: boolean;
            isRemoveButton: boolean;
            controlLabel: string;
            reachedByTab: boolean;
            tabCount: number;
            fullyInViewport: boolean;
            abovePanel: boolean;
            clearOfTopChrome: boolean;
            pointerHitsControl: boolean;
        }>);
    }

    /**
     * Regression probe for the scoping of the panel's focus-clearance lift (WCAG 2.4.11 fix).
     *
     * cart-content.tsx keeps a keyboard-focused control clear of the fixed summary panel with a
     * document-level `focusin` handler that scrolls the page when the focused element's lower edge
     * overlaps the panel's top. That handler must be scoped to controls inside the cart's scrolling
     * container (`sf-cart-container`): a fixed or portaled overlay rendered at the app root (a
     * consent banner, a dialog/menu React portals to `document.body`) reports its focus at the
     * document too, and if it overlaps the panel the unscoped handler would scroll the cart behind
     * it for no reason (the overlay is pinned to the viewport, so scrolling never clears the
     * overlap - it just moves the cart while the overlay stays put).
     *
     * To exercise that exact class deterministically, this appends a `position: fixed` control to
     * `document.body` (outside the cart container) positioned over the panel band, focuses it, and
     * reports the page scroll offset before and after. It also confirms the structural invariant the
     * scoping relies on: the panel lives inside `sf-cart-container` while the injected control (like
     * any root-level overlay) does not. `hadOverflow` is reported so a "no scroll" result is only
     * meaningful when the page could in fact have scrolled. The injected control is removed before
     * returning so it cannot affect later assertions.
     */
    async focusOverlappingRootOverlayAndMeasureScroll(): Promise<{
        panelPresent: boolean;
        panelInsideCart: boolean;
        overlayInsideCart: boolean;
        overlayOverlapsPanel: boolean;
        overlayFocused: boolean;
        hadOverflow: boolean;
        scrollBefore: number;
        scrollAfter: number;
    }> {
        return await (I.usePlaywrightTo('focus overlapping root overlay and measure scroll', async ({ page }) => {
            return await page.evaluate(async () => {
                const panel = document.querySelector(
                    '[data-testid="sf-cart-mobile-summary-panel"]'
                ) as HTMLElement | null;
                const cart = document.querySelector('[data-testid="sf-cart-container"]');

                // Give the page room to scroll so a spurious lift would actually move it.
                window.scrollTo(0, 0);
                const panelPresent = !!panel;
                const panelInsideCart = !!(panel && cart && cart.contains(panel));
                const hadOverflow = document.documentElement.scrollHeight > window.innerHeight;

                // A stand-in for a fixed/portaled overlay: pinned to the viewport bottom (so it
                // overlaps the fixed panel's top edge) and appended at the document root, outside
                // the cart container - exactly the shape the unscoped handler wrongly acted on.
                const overlay = document.createElement('button');
                overlay.textContent = 'root-overlay-probe';
                overlay.setAttribute('data-testid', 'sf-root-overlay-probe');
                overlay.style.cssText = 'position:fixed;left:0;bottom:0;width:120px;height:44px;z-index:99999;';
                document.body.appendChild(overlay);

                const overlayInsideCart = !!(cart && cart.contains(overlay));
                const overlayOverlapsPanel = !!(
                    panel && overlay.getBoundingClientRect().bottom - panel.getBoundingClientRect().top > 0
                );

                const scrollBefore = window.scrollY;
                overlay.focus();
                const overlayFocused = document.activeElement === overlay;
                // The focusin handler and its window.scrollBy run synchronously on focus; wait one
                // frame anyway so any queued scroll is reflected before we read.
                await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                const scrollAfter = window.scrollY;

                overlay.remove();

                return {
                    panelPresent,
                    panelInsideCart,
                    overlayInsideCart,
                    overlayOverlapsPanel,
                    overlayFocused,
                    hadOverflow,
                    scrollBefore,
                    scrollAfter,
                };
            });
        }) as unknown as Promise<{
            panelPresent: boolean;
            panelInsideCart: boolean;
            overlayInsideCart: boolean;
            overlayOverlapsPanel: boolean;
            overlayFocused: boolean;
            hadOverflow: boolean;
            scrollBefore: number;
            scrollAfter: number;
        }>);
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
