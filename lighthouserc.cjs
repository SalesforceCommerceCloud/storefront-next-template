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
                            { maxNumericValue: 52000, aggregationMethod: 'median' },
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
                        // main baseline: product-page script bundle measures ~442183 on main
                        // (deterministic across 5-run medians); main set the ceiling to 445000
                        // (~2.8KB headroom) after the prior 442000 sat just under its real size.
                        // feature/passkeys raises it further to absorb this feature's growth:
                        //   445000 → 446000: the account.passkeys i18n keys nudged the shared chunk
                        //   to 445551 on the cosmetic mirror.
                        //   446000 → 447000: the round-2 review fix extracted bufferToBase64Url into
                        //   a shared @/lib/auth/webauthn module imported by both the login hook and
                        //   the registration modal, so the bundler hoists it into the shared route
                        //   chunk the product page loads (cosmetic mirror measured 446288).
                        //   447000 → 449000: merging main (Data 360 analytics adapter, ECB content
                        //   blocks, et al.) grew the shared route chunk by ~1.4KB independently of
                        //   this feature (cosmetic mirror measured 447721). ~1.3KB headroom above
                        //   that absorbs main's drift plus run-to-run variance.
                        //   449000 → 451000: stabilizing the recommender click handler (reading
                        //   analytics through a ref so useCallback no longer re-creates every render,
                        //   preserving ProductTile's memo()) added ~0.4KB to the PDP shared chunk the
                        //   product-recommendations carousel loads (cosmetic mirror measured 449364).
                        //   ~1.6KB headroom absorbs main's drift plus run-to-run variance.
                        //   451000 → 453000: mega-menu embedded region wiring grew the PDP shared chunk
                        //   (CI measured 452830 across 5 runs).
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 453000, aggregationMethod: 'median' },
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
                        // Raised 490000 → 495000: the feature/passkeys baseline grew the cart route
                        // chunk (cosmetic mirror measured 492663). Raised further 495000 → 500000
                        // on main; keep the higher ceiling to absorb both baselines.
                        // Raised 500000 → 502000: mega-menu embedded region wiring grew the cart
                        // shared chunk (CI measured 501930 across 5 runs).
                        // Raised 502000 → 502500: the shared CarouselSection `centerWhenPartial`
                        // opt-in (a prop default + one conditional `justify-center-safe` class)
                        // ships in the cart recommendations carousel chunk (CI measured 502064
                        // across 5 runs). The prop is irreducible — it is the feature — so absorb
                        // the ~64B with a small headroom bump rather than dropping the capability.
                        'resource-summary:script:size': [
                            'error',
                            { maxNumericValue: 502500, aggregationMethod: 'median' },
                        ],
                        // Raised 31000 → 32000: baseline document growth (cosmetic mirror measured 31068).
                        // Cart SSR HTML sits right at ~31025-31040 bytes across 5 runs.
                        // The 31000 ceiling was too tight - multiple unrelated PRs hit
                        // 25-40 byte overshoots even on retry. 32000 gives ~1kB headroom
                        // above the observed variance without loosening the intent.
                        'resource-summary:document:size': [
                            'error',
                            { maxNumericValue: 32000, aggregationMethod: 'median' },
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
