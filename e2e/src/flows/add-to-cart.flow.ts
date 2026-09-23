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

const { I, productListPage, productDetailPage, checkoutPage } = inject();
import type { ProductInfo } from '../types/product.types';
import { buildSitePath } from '../utils/url-utils';

const MAX_PRODUCTS_TO_TRY = 3;
const MAX_CHECKOUT_EMPTY_RETRIES = 3;

/**
 * Add to Cart Flow
 *
 * Adds a product to cart via PLP -> PDP -> add-to-cart. Tries up to MAX_PRODUCTS_TO_TRY
 * products on the category page, skipping out-of-stock items detected via error toast.
 */
class AddToCartFlow {
    /**
     * Add to cart, then navigate to checkout.
     * Retries the full add-to-cart + navigate cycle when checkout shows an empty cart.
     *
     * @param categoryUrl - Direct URL to category page
     * @param maxRetries - Max times to retry when checkout shows empty cart
     * @param options - Optional: sitePrefix bypasses buildSitePath for multi-currency/locale tests
     */
    async executeAndNavigateToCheckout(
        categoryUrl: string,
        maxRetries: number = MAX_CHECKOUT_EMPTY_RETRIES,
        options?: { sitePrefix?: string }
    ): Promise<ProductInfo> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const productInfo = await this.execute(categoryUrl, { sitePrefix: options?.sitePrefix });
            try {
                if (options?.sitePrefix) {
                    checkoutPage.navigateWithPrefix(`${options.sitePrefix}/checkout`);
                } else {
                    await checkoutPage.navigateWithRetry();
                }
                await this.waitForCheckoutReady();
            } catch {
                continue;
            }
            const emptyShown = await checkoutPage.isEmptyCartShown();
            if (!emptyShown) {
                return productInfo;
            }
        }
        I.saveScreenshot(`add-to-cart-checkout-empty-${Date.now()}.png`);
        throw new Error(
            `Checkout still showed empty cart after ${maxRetries + 1} add-to-cart attempts for ${categoryUrl}`
        );
    }

    /**
     * Same as executeAndNavigateToCheckout but prefers a product with a Sale badge on the PLP.
     * Used by My Cart tests that validate promotion display.
     */
    async executeAndNavigateToCheckoutPreferringPromoted(
        categoryUrl: string,
        maxRetries: number = MAX_CHECKOUT_EMPTY_RETRIES
    ): Promise<ProductInfo> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const productInfo = await this.execute(categoryUrl, { preferPromotedProduct: true });
            try {
                await checkoutPage.navigateWithRetry();
                await this.waitForCheckoutReady();
            } catch {
                continue;
            }
            const emptyShown = await checkoutPage.isEmptyCartShown();
            if (!emptyShown) {
                return productInfo;
            }
        }
        I.saveScreenshot(`add-to-cart-checkout-empty-${Date.now()}.png`);
        throw new Error(
            `Checkout still showed empty cart after ${maxRetries + 1} add-to-cart attempts for ${categoryUrl}`
        );
    }

    private async waitForCheckoutReady(timeoutSeconds: number = 45): Promise<void> {
        await (I.usePlaywrightTo('wait for checkout content', async ({ page }) => {
            const content = page.locator(
                '[data-testid="sf-toggle-card-contact-info-content"], :text-matches("No items in cart")'
            );
            await content.first().waitFor({ state: 'visible', timeout: timeoutSeconds * 1000 });
        }) as unknown as Promise<void>);
    }

    /**
     * Execute the add-to-cart flow on a category page.
     *
     * @param categoryUrl - Direct URL to category page (e.g., 'category/womens-clothing-tops')
     * @param options - preferPromotedProduct: try a product with Sale badge first;
     *                  sitePrefix: bypass buildSitePath for multi-currency/locale tests
     */
    async execute(
        categoryUrl: string,
        options?: { preferPromotedProduct?: boolean; sitePrefix?: string }
    ): Promise<ProductInfo> {
        try {
            await this.navigateToPLP(categoryUrl, options?.sitePrefix);

            const productCount = await productListPage.getProductCount();
            if (productCount === 0) {
                throw new Error('No products found on category page');
            }

            const preferred =
                options?.preferPromotedProduct === true
                    ? await productListPage.getIndexOfFirstProductWithSaleBadge()
                    : null;
            const indices =
                preferred !== null && preferred >= 0 && preferred < productCount
                    ? [
                          preferred,
                          ...Array.from({ length: Math.min(productCount, MAX_PRODUCTS_TO_TRY) }, (_, i) => i).filter(
                              (i) => i !== preferred
                          ),
                      ]
                    : Array.from({ length: Math.min(productCount, MAX_PRODUCTS_TO_TRY) }, (_, i) => i);

            for (const index of indices) {
                await productListPage.clickMoreOptionsForProductByIndex(index);
                await productDetailPage.waitForPageReady();
                await productDetailPage.selectAllVariants();

                const addToCartCount = await I.grabNumberOfVisibleElements(productDetailPage.locators.addToCartButton);
                const addToCartVisible = addToCartCount > 0;
                if (!addToCartVisible) {
                    await this.navigateToPLP(categoryUrl, options?.sitePrefix);
                    continue;
                }

                // Variant selection navigates (the options are links), so the button enables a
                // beat after selectAllVariants. Wait for that rather than reading it once, or a
                // still-resolving variant looks out of stock and the product is skipped.
                const enabled = await productDetailPage.waitForAddToCartReady();
                if (!enabled) {
                    await this.navigateToPLP(categoryUrl, options?.sitePrefix);
                    continue;
                }

                const productTitle = await productDetailPage.getProductTitle();
                // Inline PDP quantity mode begins at one and only renders its stepper after
                // the first add. Pre-select mode still exposes the numeric input.
                const quantity = await productDetailPage.getInitialAddQuantity();

                const outcome = await productDetailPage.addToCartAndWaitForOutcome(15);
                if (outcome === 'error') {
                    await this.navigateToPLP(categoryUrl, options?.sitePrefix);
                    continue;
                }

                return {
                    title: productTitle,
                    quantity: quantity || '1',
                };
            }

            throw new Error(
                `Could not find an in-stock product after trying ${indices.length} products in ${categoryUrl}`
            );
        } catch (error) {
            I.saveScreenshot(`add-to-cart-error-${Date.now()}.png`);
            throw error;
        }
    }

    private async navigateToPLP(categoryUrl: string, sitePrefix?: string): Promise<void> {
        const url = sitePrefix ? `${sitePrefix}/${categoryUrl}` : buildSitePath(categoryUrl);
        I.amOnPage(url);
        const loaded = await this.waitForPLPGrid();
        if (!loaded) {
            I.amOnPage(url);
            await this.waitForPLPGrid();
        }
    }

    private async waitForPLPGrid(timeoutMs: number = 20_000): Promise<boolean> {
        try {
            await (I.usePlaywrightTo('wait for PLP product tiles', async ({ page }) => {
                await page.locator('[data-slot="card"]').first().waitFor({ state: 'visible', timeout: timeoutMs });
            }) as unknown as Promise<void>);
            return true;
        } catch {
            return false;
        }
    }
}

export = new AddToCartFlow();
