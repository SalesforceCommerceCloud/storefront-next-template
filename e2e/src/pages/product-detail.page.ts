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

import { expect, type Page } from '@playwright/test';
import { getCartActionButton } from '../utils/cart-action-button';
import { buildSitePath } from '../utils/url-utils';
import { isCartMutationResponse } from '../utils/cart-response';

const { I } = inject();

/**
 * Product Detail Page Object (PDP)
 * Handles interactions with product detail pages including variant selection
 */
class ProductDetailPage {
    // Locators for product detail elements
    locators = {
        // Product information
        // Changed from `[data-testid="product-title"]` to also match `main h1` as a fallback,
        // because some template variants don't render the data-testid. Scoped to `main` so it
        // doesn't accidentally match headings on error or category pages during navigation.
        productTitle: locate('[data-testid="product-title"], main h1').as('Product Title'),
        productPrice: locate('[data-testid*="price"], [class*="price"]').as('Product Price'),
        productDescription: locate('[data-testid*="description"], [class*="description"]').as('Product Description'),
        productSKU: locate('[data-testid*="sku"], [class*="sku"]').as('Product SKU'),

        // Variant selectors (dynamic - size, color, etc.)
        // Based on actual HTML: <div role="radiogroup"><a role="radio" href="/product/...">...</a></div>
        variantGroups: locate('[role="radiogroup"]').as('Variant Groups'),

        // Link-based variant options (actual HTML structure)
        // More specific: <a> tag with role="radio" and href to product page
        variantLinks: locate('a[role="radio"][href*="/product/"]').as('Variant Links'),

        // Legacy button-based variants (fallback)
        variantButtons: locate(
            'button[data-testid*="variant"], button[data-testid*="size"], button[data-testid*="color"], button[class*="swatch"]'
        ).as('Variant Buttons'),

        // Dropdown-based variants (fallback)
        variantDropdowns: locate(
            'select[data-testid*="variant"], select[data-testid*="size"], select[data-testid*="color"]'
        ).as('Variant Dropdowns'),

        // Quantity selector
        quantityInput: locate('input[data-testid*="quantity"], input[type="number"]').as('Quantity Input'),
        quantityIncrement: locate('button[data-testid*="increment"], button[aria-label*="increase" i]').as(
            'Quantity Increment'
        ),
        quantityDecrement: locate('button[data-testid*="decrement"], button[aria-label*="decrease" i]').as(
            'Quantity Decrement'
        ),

        // Add to cart
        addToCartButton: locate(
            'button[data-testid*="add-to-cart"], button:has-text("Add to Cart"), button:has-text("Add to Bag")'
        ).as('Add to Cart Button'),

        // Out of stock message
        outOfStockMessage: locate(
            '[data-testid*="out-of-stock"], :has-text("Out of stock"), :has-text("Unavailable")'
        ).as('Out of Stock Message'),

        // Wishlist toast: success (item added) or info/no-type (item already in wishlist)
        wishlistToast: locate('[data-sonner-toast][data-type="success"], [data-sonner-toast]:not([data-type])').as(
            'Wishlist Toast'
        ),

        // Product images
        productImage: locate('[data-testid*="product-image"], img[alt*="product" i]').as('Product Image'),
        productThumbnails: locate('[data-testid*="thumbnail"], button img').as('Product Thumbnails'),

        // Wishlist/favorites
        wishlistButton: locate(
            'button[data-testid*="wishlist"], button[data-testid*="favorite"], button[aria-label*="wishlist" i], button:has-text("Add to Wishlist"), button:has-text("Add to wishlist"), button:has-text("Remove from wishlist")'
        ).as('Wishlist Button'),
    };

    /**
     * Navigate directly to a product detail page.
     * @param path - Product path including any query string (e.g. '/product/25752235M?color=YELLOSI&pid=682875540326M').
     */
    navigate(path: string): void {
        I.amOnPage(buildSitePath(path));
    }

    /**
     * Get the product title
     * @returns Promise<string> - Product title text
     */
    async getProductTitle(): Promise<string> {
        const title = await I.grabTextFrom(this.locators.productTitle);
        return title.trim();
    }

    /**
     * Get the product price
     * @returns Promise<string> - Product price text
     */
    async getProductPrice(): Promise<string> {
        const price = await I.grabTextFrom(this.locators.productPrice);
        return price.trim();
    }

    /**
     * Select all available product variants (first available option for each)
     * Dynamically detects variant types (size, color, etc.) and selects first available option
     */
    async selectAllVariants(): Promise<void> {
        // Check for link-based variants (actual HTML pattern)
        const variantLinkCount = await I.grabNumberOfVisibleElements(this.locators.variantLinks);

        if (variantLinkCount > 0) {
            await this.selectVariantLinks();
            return;
        }

        // Check for button-style variants (swatches) - fallback
        const variantButtonCount = await I.grabNumberOfVisibleElements(this.locators.variantButtons);

        if (variantButtonCount > 0) {
            await this.selectVariantButtons();
        }

        // Check for dropdown-style variants - fallback
        const variantDropdownCount = await I.grabNumberOfVisibleElements(this.locators.variantDropdowns);

        if (variantDropdownCount > 0) {
            await this.selectVariantDropdowns();
        }
    }

    /**
     * Select first available option for all link-based variants
     * HTML pattern: <div role="radiogroup"><a role="radio" href="/product/...">...</a></div>
     */
    private async selectVariantLinks(): Promise<void> {
        const variantGroupCount = await I.grabNumberOfVisibleElements(this.locators.variantGroups);

        if (variantGroupCount === 0) {
            const allLinks = await I.grabNumberOfVisibleElements(this.locators.variantLinks);
            if (allLinks > 0) {
                I.click(this.locators.variantLinks.first());
            }
            return;
        }

        for (let groupIndex = 1; groupIndex <= variantGroupCount; groupIndex++) {
            const group = this.locators.variantGroups.at(groupIndex);
            const linksInGroup = group.find('a[role="radio"]');
            const linkCount = await I.grabNumberOfVisibleElements(linksInGroup);

            if (linkCount === 0) {
                continue;
            }

            const firstLink = linksInGroup.first();
            I.click(firstLink);
        }
    }

    /**
     * Select first available option for all button-style variants
     */
    private async selectVariantButtons(): Promise<void> {
        // Get all variant buttons
        const buttonCount = await I.grabNumberOfVisibleElements(this.locators.variantButtons);

        // Group buttons by their parent container to handle different variant types
        for (let i = 1; i <= buttonCount; i++) {
            const button = this.locators.variantButtons.at(i);

            // Check if button is already selected
            const isSelected = await this.isButtonSelected(i);

            if (!isSelected) {
                I.click(button);
                break;
            }
        }
    }

    /**
     * Check if a variant button is already selected
     * @param index - Button index (1-based for CodeceptJS)
     * @returns Promise<boolean> - True if button is selected
     */
    private async isButtonSelected(index: number): Promise<boolean> {
        try {
            const button = this.locators.variantButtons.at(index);
            // Check for common "selected" indicators
            const ariaSelected = await I.grabAttributeFrom(button, 'aria-selected');
            const ariaPressed = await I.grabAttributeFrom(button, 'aria-pressed');
            const className = await I.grabAttributeFrom(button, 'class');

            return (
                ariaSelected === 'true' ||
                ariaPressed === 'true' ||
                (typeof className === 'string' && className.includes('selected'))
            );
        } catch {
            return false;
        }
    }

    /**
     * Select first available option for all dropdown-style variants
     */
    private async selectVariantDropdowns(): Promise<void> {
        const dropdownCount = await I.grabNumberOfVisibleElements(this.locators.variantDropdowns);

        for (let i = 1; i <= dropdownCount; i++) {
            const dropdown = this.locators.variantDropdowns.at(i);

            // Get all options in the dropdown
            const options = await I.grabTextFromAll(`${dropdown.toString()} option`);

            // Select the first non-placeholder option (skip "Select..." or empty options)
            for (const option of options) {
                const optionText = option.trim();
                if (optionText && !optionText.toLowerCase().includes('select')) {
                    I.selectOption(dropdown, optionText);
                    break;
                }
            }
        }
    }

    /**
     * Set product quantity
     * @param quantity - Desired quantity
     */
    setQuantity(quantity: number): void {
        I.fillField(this.locators.quantityInput, quantity.toString());
    }

    /**
     * Get current quantity value
     * @returns Promise<string> - Current quantity
     */
    async getQuantity(): Promise<string> {
        const quantity = await I.grabValueFrom(this.locators.quantityInput);
        return quantity.trim();
    }

    /**
     * Gets the quantity that will be added from the PDP.
     *
     * The pre-select mode exposes a numeric input, while inline mode begins with
     * a single-unit Add to Cart CTA and renders its stepper only after the add.
     */
    async getInitialAddQuantity(): Promise<string> {
        const quantityInputCount = await I.grabNumberOfVisibleElements(this.locators.quantityInput);
        return quantityInputCount > 0 ? this.getQuantity() : '1';
    }

    /**
     * Add a product or increment its existing cart line and report the cart mutation outcome.
     *
     * The add's authoritative signal is the POST response, not the mini-cart sheet: the
     * sheet is lazy-loaded, so under a slow target a successful add can render its feedback
     * well after the server confirmed it — waiting on the sheet reads a real success as a
     * timeout. The response arrives a bounded round-trip after the click regardless of
     * client render speed.
     *
     * The response listener is registered *before* the click and both are awaited together:
     * the POST can resolve in ~100ms, well inside the post-click settle delay, so attaching
     * the listener after clicking would miss an already-delivered response and hang.
     *
     * Classified by HTTP status: a 2xx add or quantity update is success; a non-2xx (e.g. out of
     * stock) is an error the caller can skip past. A missing response within the window also reads
     * as error.
     *
     * @param timeoutSeconds - How long to wait for the add-to-cart response
     * @returns 'success' if the server confirmed the add, 'error' otherwise
     */
    async addToCartAndWaitForOutcome(timeoutSeconds: number = 15): Promise<'success' | 'error'> {
        try {
            const ok = (await I.usePlaywrightTo('add to cart and await response', async ({ page }: { page: Page }) => {
                const responsePromise = page.waitForResponse(
                    (res) => isCartMutationResponse({ method: res.request().method(), url: res.url() }),
                    { timeout: timeoutSeconds * 1000 }
                );
                const cartActionButton = await getCartActionButton(page);
                await expect(cartActionButton).toBeEnabled({ timeout: timeoutSeconds * 1000 });
                await cartActionButton.scrollIntoViewIfNeeded();
                await cartActionButton.click();
                const response = await responsePromise;
                return response.ok();
            })) as unknown as boolean;
            return ok ? 'success' : 'error';
        } catch {
            return 'error';
        }
    }

    /**
     * Check if product is out of stock (via visible OOS message)
     * @returns Promise<boolean> - True if out of stock
     */
    async isOutOfStock(): Promise<boolean> {
        const outOfStockCount = await I.grabNumberOfVisibleElements(this.locators.outOfStockMessage);
        return outOfStockCount > 0;
    }

    /**
     * Wait until the Add to Cart button is enabled, then return true; return false on timeout.
     *
     * Variant options render as `<a role="radio" href>` links, so selecting one is a client-side
     * navigation that re-resolves the variant before the button enables. Clicking Add to Cart in
     * that window is a no-op — the handler bails and fires no request, so no feedback ever appears.
     * Waiting for the enabled state here makes the subsequent add fire a real request.
     *
     * @param timeoutSeconds - How long to wait for the button to enable
     */
    async waitForAddToCartReady(timeoutSeconds: number = 10): Promise<boolean> {
        try {
            await (I.usePlaywrightTo('wait for add-to-cart button to enable', async ({ page }) => {
                const cartActionButton = await getCartActionButton(page);
                await cartActionButton.waitFor({ state: 'visible', timeout: timeoutSeconds * 1000 });
                await expect(cartActionButton).toBeEnabled({ timeout: timeoutSeconds * 1000 });
            }) as unknown as Promise<void>);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Wait for PDP to be ready (e.g. after navigation from PLP). Use before validatePageLoaded when coming from a click.
     *
     * Changed from a synchronous `I.waitForElement(productTitle)` (which only waited for one element
     * and did not confirm the URL had navigated) to an async Playwright-based implementation that:
     *   1. Waits for the URL to contain `/product/` (event-driven via waitForURL, not polling).
     *   2. Waits for any key PDP element (title, h1, or add-to-cart button) to become visible.
     * This fixed flaky E2E failures where the old approach resolved on stale elements from the
     * previous page, or timed out when the title hadn't rendered yet but the add-to-cart button had.
     */
    async waitForPageReady(timeoutSeconds: number = 30): Promise<void> {
        const timeoutMs = timeoutSeconds * 1000;
        await (I.usePlaywrightTo('wait for PDP to be ready', async ({ page }) => {
            await page.waitForURL(/\/product\//, { timeout: timeoutMs });
            await page
                .locator(
                    '[data-testid="product-title"], main h1, [data-testid*="add-to-cart"], button:has-text("Add to Cart"), button:has-text("Add to Bag")'
                )
                .first()
                .waitFor({ state: 'visible', timeout: timeoutMs });
        }) as unknown as Promise<void>);
    }

    /**
     * Validate product detail page loaded successfully
     */
    validatePageLoaded(): void {
        I.seeElement(this.locators.productTitle);
        I.seeElement(this.locators.addToCartButton);
    }

    /**
     * Add product to wishlist
     */
    addToWishlist(): void {
        I.waitForElement(this.locators.wishlistButton, 10);
        I.click(this.locators.wishlistButton);
    }

    /**
     * Wait for the wishlist toast to appear after adding a product.
     * Accepts a success toast (item added) or an info toast (item already in wishlist).
     */
    validateAddedToWishlist(): void {
        I.waitForElement(this.locators.wishlistToast);
    }

    /**
     * Select a specific product image thumbnail
     * @param index - Thumbnail index (0-based)
     */
    selectThumbnail(index: number): void {
        I.click(this.locators.productThumbnails.at(index + 1));
    }
}

// Export as singleton following CodeceptJS pattern
const productDetailPageInstance = new ProductDetailPage();
export = productDetailPageInstance;
