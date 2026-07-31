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
 * Shared test utilities for configuration
 *
 * This file provides reusable mock configuration objects and wrapper components
 * for testing components and hooks that depend on the ConfigProvider context.
 */

import { createElement, type ReactNode } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { deepMerge } from '@/test-utils/deep-merge';
import type { Config } from '@/types/config';
import { TrackingConsent } from '@/types/tracking-consent';

/**
 * Mock build-time configuration for tests
 * Used by both vitest unit tests and Storybook
 */
export const mockBuildConfig: Config = {
    metadata: {
        projectName: 'Test Project',
        projectSlug: 'test-project',
    },
    runtime: {
        defaultMrtProject: '',
        defaultMrtTarget: '',
        ssrOnly: ['loader.js'],
        ssrShared: ['static/**/*'],
        ssrParameters: { ssrFunctionNodeVersion: '24.x' },
    },
    app: {
        pages: {
            navigation: {
                rootCategoryId: 'root',
                maxDepth: 2,
            },
            home: { featuredProductsCount: 12 },
            cart: {
                quantityUpdateDebounce: 750,
                enableRemoveConfirmation: true,
                maxQuantityPerItem: 999,
                enableSaveForLater: false,
                removeAction: '/action/cart-item-remove',
                ruleBasedProductLimit: 4,
                confirmDescription: 'Are you sure you want to remove this item from your cart?',
                showLineItemDescription: false,
                miniCart: {
                    enableViewCartButton: true,
                },
            },
            search: {
                placeholder: 'Search',
                enableSearchSuggestions: true,
                maxSuggestions: 8,
                enableRecentSearches: true,
                suggestionsDebounce: 100,
            },
            maintenancePage: {
                sharedMaintenancePage: false,
                cdnUrl: 'http://prd.cmp.cdn.commercecloud.salesforce.com',
                forwardedHost: '',
            },
        },
        commerce: {
            api: {
                clientId: 'test-client',
                organizationId: 'test-org',
                shortCode: 'test123',
                proxy: '/mobify/proxy/api',
                callback: '/callback',
                privateKeyEnabled: false,
                registeredRefreshTokenExpirySeconds: undefined,
                guestRefreshTokenExpirySeconds: undefined,
            },
            sites: [
                {
                    id: 'RefArchGlobal',
                    defaultLocale: 'en-GB',
                    defaultCurrency: 'GBP',
                    supportedLocales: [
                        { id: 'en-GB', preferredCurrency: 'GBP' },
                        { id: 'it-IT', preferredCurrency: 'EUR' },
                    ],
                    supportedCurrencies: ['EUR', 'GBP'],
                },
                {
                    id: 'RefArch',
                    defaultLocale: 'en-US',
                    defaultCurrency: 'USD',
                    supportedLocales: [{ id: 'en-US', preferredCurrency: 'USD' }],
                    supportedCurrencies: ['USD'],
                },
            ],
            sitesFromDal: false,
        },
        defaultSiteId: 'RefArchGlobal',
        features: {
            passkey: {
                enabled: false,
                mode: 'email',
                callbackUri: '',
            },
            guestCheckout: true,
            googleCloudAPI: {
                apiKey: '',
            },
            passwordlessLogin: {
                mode: 'email' as const,
                callbackUri: '/passwordless-login-callback',
                landingUri: '/passwordless-login-landing',
            },
            otpRequest: {
                mode: 'email' as const,
                callbackUri: '',
            },
            resetPassword: {
                mode: 'email' as const,
                callbackUri: '/reset-password-callback',
                landingUri: '/reset-password-landing',
            },
            socialLogin: { enabled: true, callbackUri: '/social-callback', providers: ['Apple', 'Google'] },
            socialShare: { enabled: true, providers: ['Twitter', 'Facebook', 'LinkedIn', 'Email'] },
            shopperContext: {
                enabled: false,
            },
            mrtBasedPageDesignerResolution: false,
        },
        hybrid: {
            enabled: false,
            legacyRoutes: [],
        },
        auth: {
            otpLength: 6 as const,
        },
        i18n: {
            fallbackLng: 'en-GB',
            supportedLngs: ['it-IT', 'en-GB'], // Fallback language should be last
        },
        global: {
            branding: { name: 'Test Store', logoAlt: 'Home' },
            productListing: {
                defaultProductTileImgAspectRatio: 1,
            },
            inventory: { lowStockThreshold: 5 },
            carousel: { defaultItemCount: 4 },
            badges: [
                { propertyName: 'c_isSale', label: 'Sale', color: 'orange', priority: 1 },
                { propertyName: 'c_isNew', label: 'New', color: 'green', priority: 2 },
            ],
            skeleton: {
                thumbnails: 4,
                colorVariants: 4,
                sizeVariants: 3,
                accordionSections: 3,
                defaultItemCount: 4,
            },
            recommendations: {
                search_limit: {
                    youMightLike: 8,
                    completeLook: 12,
                    recentlyViewed: 6,
                },
                types: {
                    'you-may-also-like': {
                        enabled: true,
                        priority: 1,
                        sort: 'best-matches',
                        titleKey: 'product.recommendations.youMightAlsoLike',
                    },
                    'complete-the-look': {
                        enabled: true,
                        priority: 2,
                        sort: 'price-low-to-high',
                        titleKey: 'product.recommendations.completeTheLook',
                    },
                    'recently-viewed': {
                        enabled: false,
                        priority: 3,
                        sort: 'most-popular',
                        titleKey: 'product.recommendations.recentlyViewed',
                    },
                },
            },
        },
        links: {
            preconnect: ['https://edge.disstg.commercecloud.salesforce.com'],
        },
        images: {
            host: 'https://edge.disstg.commercecloud.salesforce.com',
            quality: 70,
            formats: ['webp'],
            fallbackFormat: 'jpg',
        },
        search: {
            products: {
                refine: {
                    orderableOnly: true,
                },
                hits: {
                    limit: 24,
                    critical: 2,
                },
            },
        },
        performance: {
            caching: { apiCacheTtl: 300, staticAssetCacheTtl: 31536000 },
            metrics: {
                serverPerformanceMetricsEnabled: true,
                serverTimingHeaderEnabled: false,
                clientPerformanceMetricsEnabled: true,
            },
        },
        engagement: {
            adapters: {
                einstein: {
                    enabled: false,
                    host: '',
                    einsteinId: '',
                    isProduction: false,
                    realm: '',
                    siteId: '',
                    eventToggles: {
                        view_page: true,
                        view_product: true,
                        view_search: true,
                        view_category: true,
                        view_recommender: true,
                        click_product_in_category: true,
                        click_product_in_search: true,
                        click_product_in_recommender: true,
                        cart_item_add: true,
                        checkout_start: true,
                        checkout_step: true,
                        view_search_suggestion: true,
                        click_search_suggestion: true,
                        wishlist_item_added: true,
                        wishlist_item_removed: true,
                        wishlist_viewed: true,
                        wishlist_item_merged: true,
                        wishlist_merged: true,
                    },
                },
                data360: {
                    enabled: false,
                    appSourceId: '',
                    tenantId: '',
                    siteId: '',
                    webStoreId: 'sfnext',
                    eventToggles: {
                        view_page: true,
                        view_product: true,
                        view_search: true,
                        view_category: true,
                        view_recommender: true,
                        click_product_in_category: false,
                        click_product_in_search: false,
                        click_product_in_recommender: false,
                        cart_item_add: false,
                        checkout_start: false,
                        checkout_step: false,
                        view_search_suggestion: false,
                        click_search_suggestion: false,
                        wishlist_item_added: false,
                        wishlist_item_removed: false,
                        wishlist_viewed: false,
                        wishlist_item_merged: false,
                        wishlist_merged: false,
                    },
                },
                activeData: {
                    enabled: false,
                    host: '',
                    siteId: '',
                    locale: '',
                    siteUUID: '',
                    eventToggles: {
                        view_page: true,
                        view_product: true,
                        view_search: true,
                        view_category: true,
                        view_recommender: false,
                        click_product_in_category: false,
                        click_product_in_search: false,
                        click_product_in_recommender: false,
                        cart_item_add: false,
                        checkout_start: false,
                        checkout_step: false,
                        view_search_suggestion: false,
                        click_search_suggestion: false,
                        wishlist_item_added: false,
                        wishlist_item_removed: false,
                        wishlist_viewed: false,
                        wishlist_item_merged: false,
                        wishlist_merged: false,
                    },
                },
            },
            analytics: {
                pageViewsBlocklist: [],
                pageViewsResetDuration: 30000,
                trackingConsent: {
                    enabled: true,
                    position: 'bottom-center',
                    defaultTrackingConsent: TrackingConsent.Declined,
                },
            },
        },
        development: {
            enableDevtools: true,
            hotReload: true,
            strictMode: true,
        },
        siteAliasMap: {
            RefArchGlobal: 'global',
        },
        url: {
            prefix: '/:siteId/:localeId',
            excludeRoutes: ['/resource/**', '/action/**'],
        },
    },
};

/**
 * Pre-created mock config for convenience
 */
export const mockConfig = mockBuildConfig.app;

/**
 * Derived site objects and values for use in test assertions and mock return values.
 * Never hardcode site IDs in test files — always derive from the mock config.
 */

/** The full primary mock site object */
export const mockSiteObject = mockBuildConfig.app.commerce.sites[0];

/** The full alternative mock site object */
export const mockAltSiteObject = mockBuildConfig.app.commerce.sites[1];

/**
 * Resolves the URL-visible site reference (alias if configured, otherwise site ID).
 *
 * @example
 * ```ts
 * // Primary site (default)
 * useCurrentSiteAndLocaleRef: () => ({ siteRef: getSiteRef(), localeRef: mockSiteObject.defaultLocale })
 *
 * // Alt site
 * useCurrentSiteAndLocaleRef: () => ({ siteRef: getSiteRef(mockAltSiteObject), ... })
 * ```
 */
export function getSiteRef(site = mockSiteObject) {
    return mockBuildConfig.app.siteAliasMap?.[site.id] ?? site.id;
}

/**
 * Builds the URL prefix for a given site (e.g., `/RefArchGlobal/en-GB`).
 *
 * @example
 * ```ts
 * expect(link).toHaveAttribute('href', `${getSitePrefix()}/product/123`);
 * ```
 */
export function getSitePrefix(site = mockSiteObject) {
    return `/${site.id}/${site.defaultLocale}`;
}

/**
 * The primary mock locale object for use with `SiteProvider` in tests.
 */
export const mockLocale =
    mockSiteObject.supportedLocales.find((l) => l.id === mockSiteObject.defaultLocale) ??
    mockSiteObject.supportedLocales[0];

/**
 * React Testing Library wrapper component that provides ConfigProvider context
 *
 * @example
 * ```typescript
 * import { ConfigWrapper } from '@/test-utils/config';
 *
 * renderHook(() => useConfig(), { wrapper: ConfigWrapper });
 * ```
 */
export function ConfigWrapper({ children }: { children: ReactNode }) {
    return createElement(ConfigProvider, { config: mockConfig, children } as never);
}

/**
 * Helper to create a custom config wrapper with overrides
 *
 * @example
 * ```typescript
 * const CustomWrapper = createConfigWrapper({
 *   app: {
 *     pages: {
 *       cart: { quantityUpdateDebounce: 1000 }
 *     }
 *   }
 * });
 *
 * renderHook(() => useConfig(), { wrapper: CustomWrapper });
 * ```
 */
export function createConfigWrapper(configOverrides?: Partial<Config>) {
    const customConfig = configOverrides
        ? deepMerge(mockBuildConfig, configOverrides as Record<string, unknown>).app
        : mockConfig;

    return function CustomConfigWrapper({ children }: { children: ReactNode }) {
        return createElement(ConfigProvider, { config: customConfig, children } as never);
    };
}
