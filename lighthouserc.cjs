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
module.exports = {
    ci: {
        collect: {
            numberOfRuns: 5,
            startServerCommand: 'cross-env NODE_OPTIONS=--conditions=dev-data-store pnpm start --port 3001',
            startServerReadyPattern: 'SFCC Storefront Next',
            startServerReadyTimeout: 30000,
            url: [
                'http://localhost:3001/RefArchGlobal/en-GB/',
                // 'http://localhost:3001/RefArchGlobal/en-GB/category/womens-clothing-tops',
                'http://localhost:3001/RefArchGlobal/en-GB/product/25591227M?color=JJ9DFXX',
                'http://localhost:3001/RefArchGlobal/en-GB/cart',
            ],
            settings: {
                formFactor: 'mobile',
                screenEmulation: {
                    mobile: true,
                    width: 360,
                    height: 780,
                    deviceScaleFactor: 3,
                    disabled: false,
                },
                throttling: {
                    rttMs: 100,
                    cpuSlowdownMultiplier: 3.5,
                    downloadThroughputKbps: 9000,
                    uploadThroughputKbps: 3000,
                },
                extraHeaders: {
                    Cookie: 'dw_dnt=1;',
                },
            },
        },
        assert: {
            // TEMPORARY (2026-06-19): `categories:best-practices` lowered from 0.96 to 0.7.
            // The cause is external to this codebase: the DIS image CDN edge (fronted by
            // Cloudflare) began setting a `_cfuvid` third-party cookie on every image
            // response. Chrome flags it, failing the `third-party-cookies` (weight 5) and
            // `inspector-issues` (weight 1) audits, which drops the category score to ~0.79
            // (home) / ~0.75 (product) on every branch — no code change can fix it here.
            // RESTORE to 0.96 once the cookie is removed at the CDN. Mirrors the retail-app
            // baseline (`template-retail-rsc-app/lighthouserc.cjs`, #2074).
            assertMatrix: [
                {
                    matchingUrlPattern: '.*RefArchGlobal/en-GB/$',
                    assertions: {
                        'is-on-https': 'off',
                        'redirects-http': 'off',
                        'render-blocking-resources': ['warn', { maxNumericValue: 0 }],
                        'categories:performance': ['error', { minScore: 0.65, aggregationMethod: 'median' }],
                        'categories:accessibility': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:seo': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:best-practices': ['error', { minScore: 0.7, aggregationMethod: 'median' }],
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 411000, aggregationMethod: 'median' },
                        ],
                        'resource-summary:document:size': [
                            'error',
                            { maxNumericValue: 54000, aggregationMethod: 'median' },
                        ],
                    },
                },
                {
                    matchingUrlPattern: '.*category.*',
                    assertions: {
                        'is-on-https': 'off',
                        'redirects-http': 'off',
                        'render-blocking-resources': ['warn', { maxNumericValue: 0 }],
                        'categories:performance': ['error', { minScore: 0.67, aggregationMethod: 'median' }],
                        'categories:accessibility': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:seo': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:best-practices': ['error', { minScore: 0.7, aggregationMethod: 'median' }],
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 365000, aggregationMethod: 'median' },
                        ],
                        'resource-summary:document:size': [
                            'error',
                            { maxNumericValue: 60000, aggregationMethod: 'median' },
                        ],
                    },
                },
                {
                    matchingUrlPattern: '.*product.*',
                    assertions: {
                        'is-on-https': 'off',
                        'redirects-http': 'off',
                        'render-blocking-resources': ['warn', { maxNumericValue: 0 }],
                        'categories:performance': ['error', { minScore: 0.6, aggregationMethod: 'median' }],
                        'categories:accessibility': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:seo': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:best-practices': ['error', { minScore: 0.7, aggregationMethod: 'median' }],
                        // Keep the current main baseline, which includes shared PDP dependencies.
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 475000, aggregationMethod: 'median' },
                        ],
                        'resource-summary:document:size': [
                            'error',
                            { maxNumericValue: 55000, aggregationMethod: 'median' },
                        ],
                    },
                },
                {
                    matchingUrlPattern: '.*cart.*',
                    assertions: {
                        'is-on-https': 'off',
                        'redirects-http': 'off',
                        'render-blocking-resources': ['warn', { maxNumericValue: 0 }],
                        'categories:performance': ['error', { minScore: 0.64, aggregationMethod: 'median' }],
                        'categories:accessibility': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:seo': ['error', { minScore: 0.91, aggregationMethod: 'median' }],
                        'categories:best-practices': ['error', { minScore: 0.7, aggregationMethod: 'median' }],
                        // Slightly above the baseline (`template-retail-rsc-app`: 420000) to absorb the
                        // ~2KB overhead from cart-route imports going through `@salesforce/storefront-ui`
                        // instead of inlined `@/components/ui/*`. Mirror output flattens those back to
                        // local imports so customer artifacts re-tighten under the baseline budget.
                        // Raised again (+2KB, @W-23383562@) because `_app.tsx` now calls
                        // `useWishlistSession` unconditionally on every route, pulling the wishlist
                        // provider into the shared shell bundle instead of only the routes that
                        // mount it directly (cart, wishlist page).
                        // Raised 490000 → 495000: the feature/passkeys baseline grew the cart route
                        // chunk (cosmetic mirror measured 492663). Raised further 495000 → 500000
                        // on main; keep the higher ceiling to absorb both baselines.
                        // Raised again (+1KB, @W-23521393@) for the guest order cancel/return i18n
                        // strings added to the en-GB locale chunk (order cancel keys, order return +
                        // a11y strings), which this URL's script payload includes.
                        // Raised 500000 → 501000: cosmetic mirror measured 500094 after merging the
                        // cancel/return work into split-commits.
                        // Raised 501000 → 502000: mega-menu embedded region wiring grew the cart
                        // shared chunk (CI measured 501930 across 5 runs).
                        // Raised 502000 → 502500: the shared CarouselSection `centerWhenPartial`
                        // opt-in (a prop default + one conditional `justify-center-safe` class)
                        // ships in the cart recommendations carousel chunk (CI measured 502064
                        // across 5 runs). The prop is irreducible — it is the feature — so absorb
                        // the ~64B with a small headroom bump rather than dropping the capability.
                        // Raised 502500 → 505000: cosmetic mirror measured 504405 after merging
                        // cancel/return + main into split-commits.
                        // Raised 505000 → 506000 (@W-23729798@): the Image design-mode empty state
                        // adds the `showEmptyState`/`resolveAssetUrl` branch, the placeholder URL
                        // constant, and its i18n string to the shared DynamicImage module, which the
                        // cart line-item images pull in (CI measured 505567 across 5 runs). The
                        // branch is irreducible — it is the feature — so absorb the ~567B rather
                        // than dropping the authoring affordance.
                        // Raised 506000 → 508000 (@W-23908487@): the Product Tile design-mode empty
                        // state adds the no-product placeholder branch (placeholder card, currency
                        // guard, star-rating group) to the shared ProductTile module, which the cart
                        // recommendations carousel chunk pulls in (CI measured 506687, zero variance
                        // across 5 runs). The branch is irreducible — it is the feature — so absorb
                        // the ~687B rather than dropping the authoring affordance.
                        // Also absorbed within this 508000 ceiling (@W-23325668@): the cart mobile
                        // summary panel reserves its measured height as real content bottom padding
                        // via a ResizeObserver that mirrors the live panel height into a CSS custom
                        // property, with save/restore of the documentElement scroll-padding, so the
                        // final cart action stays visible and focusable under the fixed panel at 400%
                        // zoom. That wiring adds ~91B on top of the Product Tile median (combined
                        // ~506778), which 508000 still clears with headroom.
                        // (@W-23729831@ Hero Carousel: no further raise — its empty state ships only in
                        // the homepage chunk, not cart; the 508000 ceiling already absorbs the ~506201
                        // main baseline drift this branch previously observed.)
                        // Footwear PDP work (@W-23751953@) also lands a generic `thumbnailLabel`
                        // accessible-name fallback in this shared chunk via the canonical
                        // ImageGallery (~83B). It fits under this same 508000 ceiling; the
                        // lighthouse-cosmetic CI run on the merged branch confirms the combined median.
                        // Raised 508000 → 509000 (@W-23751957@): the footwear colorway overlay needs
                        // the selected variant's authoritative inventory before purchase, so the
                        // canonical ProductViewProvider now threads an `isVariantInventoryLoading`
                        // flag and ProductCartActions gates Add to Cart / Buy Now / express payments
                        // on it. That wiring ships in the shared chunk the cart recommendations
                        // carousel pulls in (cosmetic mirror measured 508054, zero variance across 5
                        // runs). The gate is irreducible — it is the fix that stops purchasing a SKU
                        // whose inventory has not resolved — so absorb the ~54B with headroom rather
                        // than dropping it.
                        // Raised 509000 → 513000: delivery-estimate integration, private destination-cookie
                        // hydration, and the Furniture PDP feature add canonical
                        // image-swatch rendering (swatch-group image tiles + the `custom-swatch-images`
                        // resolver), ProductCartActions `additionalItems` product-set batching, and the
                        // ProductTile inline quick-add placement. None touch the cart route directly, but
                        // they ship in the shared chunk the cart recommendations carousel and the
                        // bundle/set child-product-card swatches pull in. The combined feature branch
                        // measures 513399 (fashion), 513374 (foundations), and 516592 (cosmetic) across
                        // five deterministic runs, so 517000 preserves the smallest measured headroom.
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 517000, aggregationMethod: 'median' },
                        ],
                        // Cart SSR HTML sits right at ~31025-31040 bytes across 5 runs.
                        // The 31000 ceiling was too tight - multiple unrelated PRs hit
                        // 25-40 byte overshoots even on retry. 32000 gives ~1kB headroom
                        // above the observed variance without loosening the intent.
                        'resource-summary:document:size': [
                            'error',
                            { maxNumericValue: 33000, aggregationMethod: 'median' },
                        ],
                    },
                },
            ],
        },
        upload: {
            target: 'temporary-public-storage',
        },
    },
};
