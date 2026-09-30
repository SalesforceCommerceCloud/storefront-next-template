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

const { I } = inject();

/**
 * Product List Page Object (PLP)
 * Handles interactions with product listing pages (category pages, search results)
 */
class ProductListPage {
    // Locators for product listing elements
    locators = {
        // Product tiles/cards in the grid - using actual DOM structure
        productTiles: locate('[data-slot="card"]').as('Product Tiles'),

        // "More Options" button - simplified based on actual HTML
        // HTML: <div data-slot="card-footer"><button>More Options</button></div>
        moreOptionsButton: locate('[data-slot="card-footer"] button')
            .withText('More Options')
            .as('More Options Button'),

        // Even simpler fallback - just find any button with "More Options" text
        moreOptionsButtonSimple: locate('button').withText('More Options').as('More Options Button Simple'),

        // Quick add buttons (if available)
        quickAddButton: locate('[data-testid*="quick-add"], button:has-text("Quick Add")').as('Quick Add Button'),

        // Product grid container - parent of product cards
        productGrid: locate('main').as('Product Grid'),

        // More specific grid if needed
        productGridSpecific: locate(
            '[data-testid*="product-grid"], [class*="product-grid"], [class*="product-list"], :has([data-slot="card"])'
        ).as('Product Grid Specific'),

        // Product images
        productImages: locate('a[href*="/p/"] img').as('Product Images'),

        // Product name links in tile info section (h3 > a, below image area — safe from Quick Add overlay)
        productNameLinks: locate('h3 a[href*="/p/"]').as('Product Name Links'),

        // Product titles
        productTitles: locate('h3 a[href*="/p/"]').as('Product Titles'),

        // Product prices
        productPrices: locate('[data-testid*="price"]').as('Product Prices'),

        // Sorting dropdown
        sortDropdown: locate('select[data-testid*="sort"], [data-testid*="sort-select"]').as('Sort Dropdown'),

        // Filter options
        filterButtons: locate('[data-testid*="filter"], button[aria-label*="filter" i]').as('Filter Buttons'),

        // Loading state
        loadingIndicator: locate('[data-testid*="loading"]').as('Loading Indicator'),

        // No results message
        noResultsMessage: locate('[data-testid*="no-results"], :has-text("No products found")').as(
            'No Results Message'
        ),
    };

    /**
     * Get the href of the first product link on the page.
     * More reliable than clicking "More Options" for SPA navigation,
     * since client-side navigate() can be disrupted by overlays (e.g. consent dialogs).
     */
    async getFirstProductUrl(): Promise<string> {
        return await I.grabAttributeFrom(locate('a[href*="/p/"]').first(), 'href');
    }

    /**
     * Click "More Options" button for the first product in the list
     * Falls back to clicking the product tile directly if "More Options" button not found
     */
    async clickMoreOptionsForFirstProduct(): Promise<void> {
        await this.clickMoreOptionsForProductByIndex(0);
    }

    /**
     * Click "More Options" (or product name link) for the product at the given index.
     * Falls back to the product name link in the info section to avoid triggering the
     * Quick Add overlay that sits on top of the card image area.
     * @param index - 0-based index of the product in the list
     */
    async clickMoreOptionsForProductByIndex(index: number): Promise<void> {
        const moreOptionsCount = await I.grabNumberOfVisibleElements(this.locators.moreOptionsButtonSimple);

        if (moreOptionsCount > index) {
            I.click(this.locators.moreOptionsButtonSimple.at(index + 1));
        } else {
            I.click(this.locators.productNameLinks.at(index + 1));
        }
    }

    /**
     * Click on a specific product tile by index (0-based)
     * @param index - Index of the product to click (default: 0 for first product)
     */
    clickProductByIndex(index: number = 0): void {
        I.click(this.locators.productTiles.at(index + 1)); // CodeceptJS uses 1-based indexing
    }

    /**
     * Get the total count of product tiles on the page
     * @returns Promise<number> - Number of products displayed
     */
    async getProductCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.productTiles);
    }

    /**
     * Get the 0-based index of the first product tile that shows a Sale (promotion) badge.
     * Use to add a promoted product to cart when validating My Cart promotions.
     * @returns Promise<number | null> - Index of first product with Sale badge, or null if none
     */
    async getIndexOfFirstProductWithSaleBadge(): Promise<number | null> {
        const total = await I.grabNumberOfVisibleElements(this.locators.productTiles);
        for (let i = 0; i < total; i++) {
            const tile = this.locators.productTiles.at(i + 1);
            const hasSale = await I.grabNumberOfVisibleElements(tile.find(locate().withText('Sale')));
            if (hasSale > 0) {
                return i;
            }
        }
        return null;
    }

    /**
     * Get the title of a product by index
     * @param index - Index of the product (0-based)
     * @returns Promise<string> - Product title text
     */
    async getProductTitle(index: number = 0): Promise<string> {
        const title = await I.grabTextFrom(this.locators.productTitles.at(index + 1));
        return title.trim();
    }

    /**
     * Get the price of a product by index
     * @param index - Index of the product (0-based)
     * @returns Promise<string> - Product price text
     */
    async getProductPrice(index: number = 0): Promise<string> {
        const price = await I.grabTextFrom(this.locators.productPrices.at(index + 1));
        return price.trim();
    }

    /**
     * Validate that products are displayed on the page
     */
    validateProductsDisplayed(timeoutSeconds: number = 30): void {
        I.waitForElement(this.locators.productGrid, timeoutSeconds);
        I.waitForElement(this.locators.productTiles, timeoutSeconds);
    }

    /**
     * Validate no results message is shown
     */
    validateNoResults(): void {
        I.seeElement(this.locators.noResultsMessage);
    }

    /**
     * Apply sorting option
     * @param sortOption - Sort option text (e.g., "Price: Low to High")
     */
    sortBy(sortOption: string): void {
        I.selectOption(this.locators.sortDropdown, sortOption);
    }

    /**
     * Scroll to load more products (if lazy loading is implemented)
     */
    scrollToLoadMore(): void {
        I.scrollPageToBottom();
    }
}

// Export as singleton following CodeceptJS pattern
const productListPageInstance = new ProductListPage();
export = productListPageInstance;
