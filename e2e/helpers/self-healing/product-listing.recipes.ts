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

import type { HealingRecipe } from './types';

/**
 * Product Tiles - Product cards in listings
 * Primary: .bg-card (AI-discovered), a[href*="/p/"]
 */
export const productTilesRecipe: HealingRecipe = {
    name: 'productTiles',
    description: 'Product tile/card in product listings',
    selectors: [
        '.bg-card', // AI-discovered primary selector
        'a[href*="/p/"]', // Link to product pages
        '[data-testid*="product-tile"]', // Explicit test ID if added
        '[data-testid*="product-card"]', // Card variant
        '[data-product-id]', // SFCC product ID attribute
        '[data-pid]', // SFCC short form
        'article[class*="product"]', // Semantic product article
        '.product-tile', // Common class name
        '.product-card', // Common class name
        '[itemtype*="Product"]', // Schema.org markup
    ],
    context:
        'Product tiles on homepage (in carousel), category pages, and search results. Often wrapped in .bg-card containers',
    fallbackStrategy:
        'Look for .bg-card elements or links to /p/ or repeating elements containing product information (image, title, price)',
};

/**
 * Product Images - Images within product tiles
 * Primary: a[href*="/p/"] img
 */
export const productImagesRecipe: HealingRecipe = {
    name: 'productImages',
    description: 'Product images in product tiles',
    selectors: [
        'a[href*="/p/"] img', // Primary selector (image in product link)
        '[data-testid*="product-tile"] img', // Explicit test ID if added
        '[data-product-id] img', // Image in product container
        'img[alt*="product" i]', // Alt text contains product
        'img[data-testid*="product"]', // Product image test ID
        '.product-image img', // Common class pattern
    ],
    context: 'Product images within product tiles, typically clickable',
    fallbackStrategy: 'Look for images within product link containers or tile elements',
};

/**
 * Product Titles - Product names/titles
 * Primary: a[href*="/p/"] h3, a[href*="/p/"] h2
 */
export const productTitlesRecipe: HealingRecipe = {
    name: 'productTitles',
    description: 'Product titles/names in product tiles',
    selectors: [
        'a[href*="/p/"] h3', // Primary selector (h3 in product link)
        'a[href*="/p/"] h2', // Alternative heading level
        '[data-testid*="product-tile"] h3', // Explicit test ID if added (h3)
        '[data-testid*="product-tile"] h2', // Explicit test ID if added (h2)
        '[data-testid*="product-title"]', // Title test ID
        '[data-testid*="product-name"]', // Name test ID
        'a[href*="/p/"] [class*="title"]', // Title in product link
        '[itemprop="name"]', // Schema.org name
    ],
    context: 'Product names/titles displayed in product tiles',
    fallbackStrategy: 'Look for heading elements (h2/h3) within product links or tiles',
};

/**
 * Product Prices - Price display in product tiles
 * Primary: [data-testid*="price"]
 */
export const productPricesRecipe: HealingRecipe = {
    name: 'productPrices',
    description: 'Product price display',
    selectors: [
        '[data-testid*="price"]', // Primary selector from page object
        '[class*="price"]', // Class contains price
        '[itemprop="price"]', // Schema.org price
        '[data-price]', // Price data attribute
        '.currency', // Currency wrapper
        'span[class*="amount"]', // Amount display
    ],
    context: 'Product prices shown in product tiles and detail pages',
    fallbackStrategy: 'Look for elements containing currency symbols and numbers',
};

/**
 * Product Grid - Container for product listings
 * Primary: Container with .bg-card children, [data-testid*="product-grid"]
 */
export const productGridRecipe: HealingRecipe = {
    name: 'productGrid',
    description: 'Product grid container on listing pages',
    selectors: [
        '[data-testid*="product-grid"]',
        '[class*="product-grid"]',
        '[class*="product-list"]',
        ':has(.bg-card)', // Container that has .bg-card children
        '[role="list"][class*="product"]',
        'main [class*="grid"]',
        'main div:has(> .bg-card)',
    ],
    context: 'Container holding product tiles (.bg-card) on category/search pages',
    fallbackStrategy: 'Look for grid/list container with .bg-card children in main content area',
};

/**
 * More Options Button - Product tile action button
 * Primary: .bg-card button:has-text("More Options")
 */
export const moreOptionsButtonRecipe: HealingRecipe = {
    name: 'moreOptionsButton',
    description: 'More Options or View Details button on product tiles',
    selectors: [
        '.bg-card button:has-text("More Options")', // AI-suggested primary selector
        '.bg-card button:has-text("View Details")',
        'button:has-text("More Options")',
        'a:has-text("More Options")',
        'button:has-text("View Details")',
        'a:has-text("View Details")',
        '[data-testid*="more-options"]',
        '[data-testid*="view-details"]',
        'button[aria-label*="view details" i]',
        '[class*="product-tile"] button',
        '[class*="product-card"] button',
    ],
    context: 'Action button on product tiles to navigate to PDP, typically inside .bg-card containers',
    fallbackStrategy: 'Look for button/link with text containing "options" or "details" within product card containers',
};
