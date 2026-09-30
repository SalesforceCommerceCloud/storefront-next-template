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

const { I, loginFlow, productListPage, productDetailPage, storefrontPage } = inject();
import { buildSitePath } from '../utils/url-utils';

/**
 * Add to Wishlist Flow
 * Reusable flow for adding a product to wishlist via PDP
 *
 * This flow encapsulates the complete journey:
 * 1. Login via loginFlow (creates account if needed)
 * 2. Navigate directly to category URL
 * 3. Click first product to open PDP
 * 4. Add product to wishlist (master product — no variant selection needed)
 * 5. Return product title for validation
 *
 * Uses direct URL navigation for reliability and speed.
 */
interface AddToWishlistOptions {
    /** Direct URL to category page. */
    categoryUrl?: string;
    /**
     * Skip the internal login step. Set to true when the caller has already
     * authenticated the session and wants to reuse it.
     */
    skipLogin?: boolean;
}

class AddToWishlistFlow {
    /**
     * Execute the complete add-to-wishlist flow
     *
     * @param options - Flow options
     * @returns Promise<string> - Title of the product that was added to wishlist
     */
    async execute(options: AddToWishlistOptions = {}): Promise<string> {
        const { categoryUrl = '/c/mens-clothing-jackets', skipLogin = false } = options;
        try {
            if (!skipLogin) {
                await loginFlow.execute();
            }

            I.amOnPage(buildSitePath(categoryUrl));
            const productUrl = await productListPage.getFirstProductUrl();
            // productUrl is extracted from the DOM and already contains the
            // url prefix rendered by the storefront — do not apply
            // buildSitePath() here or it would be double-prefixed.
            I.amOnPage(productUrl);

            productDetailPage.validatePageLoaded();
            const productTitle = await productDetailPage.getProductTitle();

            await storefrontPage.handleTrackingConsent();

            productDetailPage.addToWishlist();
            productDetailPage.validateAddedToWishlist();

            return productTitle;
        } catch (error) {
            I.saveScreenshot(`add-to-wishlist-error-${Date.now()}.png`);
            throw error;
        }
    }
}

export = new AddToWishlistFlow();
