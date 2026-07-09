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
 * Template-specific configuration types.
 *
 * `AppConfig` defines the full `app` shape for this template — SCAPI credentials,
 * pages, features, engagement, etc. `Config` wraps it in `BaseConfig<AppConfig>`
 * which adds `metadata` and `runtime` sections.
 */
import type { BaseConfig, Url } from '@salesforce/storefront-next-runtime/config';
import type { ConsentCategory } from '@salesforce/storefront-next-runtime/events';
import type { SecurityConfig } from '@salesforce/storefront-next-runtime/security';
import type { EngagementAdapterConfig } from '@/lib/adapters';
// `import type` only — app-config-client.ts also imports `AppConfig` from this file,
// so a value import here would create a runtime cycle. Erased at emit by
// verbatimModuleSyntax; do not promote to `import { ClientAppConfig }`.
import type { ClientAppConfig } from '@/lib/app-config-client';
import type { TrackingConsent } from '@/types/tracking-consent';
// Auto-generated barrel of installed extensions' config defaults. Its type is the source
// for `AppConfig['extension']`, so the type and the runtime value (config.server.ts) can't drift.
// Explicit `/config/index`: a bare `@/extensions/config` resolves to the sibling config.json
// extension registry instead of this barrel.
import type GeneratedExtensionConfig from '@/extensions/config/index';
// Auto-generated barrel of installed extensions' server-only config defaults. Its type is the
// source for `AppConfig['serverExtension']`. Values are reachable via getConfig(context) on the
// server only — the client extractor strips this namespace before window.__APP_CONFIG__, and a
// Vite plugin fails the build if any client chunk imports the runtime barrel.
import type GeneratedServerExtensionConfig from '@/extensions/config/server';

import type { DetectionConfig, Site, SiteConfig } from '@salesforce/storefront-next-runtime/site-context';

export type BadgeDetail = {
    propertyName: string;
    label: string;
    color: 'green' | 'yellow' | 'orange' | 'purple' | 'red' | 'blue' | 'pink';
    priority?: number;
};

/**
 * Recursively strip `readonly` so an extension config authored with `as const` still merges
 * into the mutable `AppConfig`. The generated barrel is the source of both the value (in
 * config.server.ts) and this type, so the two can never drift.
 */
type DeepWritable<T> = T extends object ? { -readonly [K in keyof T]: DeepWritable<T[K]> } : T;

export type AppConfig = {
    auth: {
        otpLength: 6 | 8;
    };
    commerce: {
        api: {
            clientId: string;
            organizationId: string;
            shortCode: string;
            proxy?: string;
            callback?: string;
            privateKeyEnabled?: boolean;
            registeredRefreshTokenExpirySeconds?: number;
            guestRefreshTokenExpirySeconds?: number;
        };
        sites: Array<Site>;
    };
    /**
     * Global default cookie attributes applied to ALL storefront cookies (auth/session and
     * site-context). The per-site `commerce.sites[].cookies.domain` overrides `domain`. When
     * unset (empty/absent), cookies use host-only scoping — setting a domain is opt-in.
     * Override via `PUBLIC__app__cookies__domain=.example.com`.
     */
    cookies?: {
        /** Cookie domain, e.g. `.example.com` to share across subdomains. */
        domain?: string;
    };
    cimulateAgent?: {
        enabled: string | boolean;
        commerceClientScriptSourceUrl: string;
        scrt2Url: string;
        salesforceOrgId: string;
        esDeveloperName: string;
        commerceClientDisplayMode?: 'panel' | 'dialog' | 'modal';
        commerceClientElementId?: string;
        commerceClientLogoUrl?: string;
        commerceClientPanelWidth?: string;
        commerceClientMode?: string;
        headerText?: string;
        disclaimerMarkdown?: string;
        commerceClientSearchConfig?: {
            placeholder?: string;
            buttonLabel?: string;
            buttonType?: string;
            buttonIconUrl?: string;
        };
        commerceClientTheme?: Record<string, string>;
        routingAttributes?: Record<string, unknown>;
        isDevelopment?: string;
    };
    defaultSiteId: string;
    development: {
        enableDevtools: boolean;
        hotReload: boolean;
        strictMode: boolean;
    };
    engagement: {
        adapters: {
            einstein: EngagementAdapterConfig & {
                enabled: boolean;
                host: string;
                einsteinId: string;
                realm: string;
                siteId: string;
                isProduction: boolean;
            };
            dataCloud: EngagementAdapterConfig & {
                enabled: boolean;
                appSourceId: string;
                tenantId: string;
                siteId: string;
            };
            activeData: EngagementAdapterConfig & {
                enabled: boolean;
                host: string;
                siteUUID: string;
            };
            [key: string]: EngagementAdapterConfig;
        };
        analytics: {
            trackingConsent?: {
                enabled: boolean;
                defaultTrackingConsent: TrackingConsent;
                consentCategories?: ConsentCategory[];
                position?: 'bottom-left' | 'bottom-right' | 'bottom-center';
            };
            pageViewsBlocklist: string[];
            pageViewsResetDuration: number;
        };
    };
    /**
     * Config defaults contributed by installed extensions, keyed by the camelCase of each
     * extension folder name. Auto-discovered from each extension's `config.ts` — the shape
     * is derived from the generated barrel, never hand-edited. See docs/README-CONFIG.md.
     */
    extension?: DeepWritable<typeof GeneratedExtensionConfig>;
    /**
     * Server-only config defaults contributed by installed extensions, keyed by the camelCase
     * of each extension folder name. Auto-discovered from each extension's `server-config.ts`.
     * Reachable via `getConfig(context).serverExtension.<key>` in server loaders, actions, and
     * middleware. The client config extractor strips this namespace before serializing into
     * `window.__APP_CONFIG__`, and a Vite plugin fails the build if any client chunk imports
     * the generated barrel. Use this for vendor-side defaults that aren't merchant-overridable
     * (SCAPI service overrides, retry budgets, internal endpoints) — for true secrets, read
     * `process.env` from a server route handler instead.
     */
    serverExtension?: DeepWritable<typeof GeneratedServerExtensionConfig>;
    features: {
        passwordlessLogin: {
            enabled?: boolean;
            callbackUri?: string;
            landingUri?: string;
            mode: 'callback' | 'email' | 'sms';
        };
        otpRequest: {
            callbackUri?: string;
            mode: 'callback' | 'email' | 'sms';
        };
        resetPassword: {
            callbackUri?: string;
            landingUri?: string;
            mode: 'callback' | 'email' | 'sms';
        };
        socialLogin: {
            enabled: boolean;
            callbackUri: string;
            providers: Array<'Apple' | 'Google' | 'Facebook' | 'Twitter'>;
        };
        socialShare: {
            enabled: boolean;
            providers: Array<'Twitter' | 'Facebook' | 'LinkedIn' | 'Email'>;
        };
        guestCheckout: boolean;
        shopperContext: {
            enabled: boolean;
        };
        googleCloudAPI: {
            apiKey: string;
        };
        mrtBasedPageDesignerResolution: boolean;
    };
    global: {
        branding: {
            name: string;
            logoAlt: string;
        };
        productListing: {
            defaultProductTileImgAspectRatio: number;
        };
        inventory: {
            lowStockThreshold: number;
        };
        carousel: {
            defaultItemCount: number;
        };
        badges: BadgeDetail[];
        skeleton: {
            thumbnails: number;
            colorVariants: number;
            sizeVariants: number;
            accordionSections: number;
            defaultItemCount: number;
        };
        recommendations: {
            search_limit: {
                youMightLike: number;
                completeLook: number;
                recentlyViewed: number;
            };
            types: {
                'you-may-also-like': {
                    enabled: boolean;
                    priority: number;
                    sort: string;
                    titleKey: string;
                };
                'complete-the-look': {
                    enabled: boolean;
                    priority: number;
                    sort: string;
                    titleKey: string;
                };
                'recently-viewed': {
                    enabled: boolean;
                    priority: number;
                    sort: string;
                    titleKey: string;
                };
            };
        };
    };
    hybrid: {
        enabled: boolean;
        /**
         * Routes owned by the legacy backend (SFRA / SiteGenesis). A `<Link>` click to one of
         * these forces a full-page navigation so the CDN (eCDN in production, the Vite proxy
         * locally) can hand the request to the legacy backend.
         *
         * Each entry is either a bare pattern string or an object that pairs a pattern with a
         * `suffix` to append when rebuilding the redirect URL. The suffix exists because legacy
         * SEO URLs are not uniform: SFCC appends `.html` to product/category SEO URLs (when
         * `StorefrontURLsEnabled` is on) but serves routes like `/cart` and `/checkout` as clean
         * paths. A per-route suffix lets `/product/:id` redirect to `/product/123.html` while
         * `/cart` stays `/cart`.
         *
         * @example
         * legacyRoutes: ['/cart', '/checkout', { pattern: '/product/:id', suffix: '.html' }]
         */
        legacyRoutes?: Array<string | { pattern: string; suffix?: string }>;
    };
    i18n: {
        fallbackLng: string;
        supportedLngs: string[];
    };
    /**
     * Supported target formats of Salesforce's Dynamic Imaging Service are: avif, gif, jp2, jpg, jpeg, jxr, png, and webp.
     * @see {@link https://help.salesforce.com/s/articleView?id=cc.b2c_image_transformation_service.htm&type=5}
     * @see {@link https://help.salesforce.com/s/articleView?id=cc.b2c_creating_image_transformation_urls.htm&type=5}
     */
    images?: {
        quality?: number;
        formats?: Array<'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png' | 'webp'>;
        fallbackFormat?: 'avif' | 'gif' | 'jp2' | 'jpg' | 'jpeg' | 'jxr' | 'png' | 'webp';
        host?: string;
        enableDis?: boolean;
        /**
         * Custom host suffix → realm mappings for vanity domains and non-standard SFCC hosts.
         * Checked before built-in SFCC domain inference. Use this to support custom storefront
         * domains (e.g., `shop.example.com`), internal dev environments, or multi-realm setups
         * without forking `getRealmFromUrl`. Realm values are automatically uppercased.
         *
         * @example
         * realmHostMappings: [
         *   { hostSuffix: '.storefront-next-demo.com', realm: 'bjnl_dev' },
         *   { hostSuffix: 'shop.example.com', realm: 'prod_001' },
         * ]
         */
        realmHostMappings?: Array<{ hostSuffix: string; realm: string }>;
    };
    links?: {
        preconnect?: string[];
        prefetch?: string[];
        prefetchDns?: string[];
    };
    localeAliasMap?: Record<string, string>;
    localeDetectionConfig?: DetectionConfig;
    pages: {
        navigation: {
            rootCategoryId: string;
            maxDepth: number;
        };
        home: {
            featuredProductsCount: number;
        };
        cart: {
            quantityUpdateDebounce: number;
            enableRemoveConfirmation: boolean;
            maxQuantityPerItem: number;
            enableSaveForLater: boolean;
            removeAction: string;
            ruleBasedProductLimit: number;
            confirmDescription?: string;
            /** When true, cart line items show product short/long description (default false). */
            showLineItemDescription?: boolean;
            miniCart?: {
                enableViewCartButton: boolean;
            };
        };
        search: {
            placeholder: string;
            enableSearchSuggestions: boolean;
            maxSuggestions: number;
            enableRecentSearches: boolean;
            suggestionsDebounce: number;
        };
        maintenancePage: {
            sharedMaintenancePage: boolean;
            cdnUrl: string;
            forwardedHost: string;
        };
    };
    performance: {
        caching: {
            apiCacheTtl: number;
            staticAssetCacheTtl: number;
        };
        metrics?: {
            serverPerformanceMetricsEnabled?: boolean;
            serverTimingHeaderEnabled?: boolean;
            clientPerformanceMetricsEnabled?: boolean;
        };
    };
    search: {
        products: {
            refine?: {
                orderableOnly?: boolean;
            };
            hits: {
                limit: number;
                critical?: number;
            };
            /**
             * Discrete viewType declarations the storefront uses for product images. Each role
             * names the viewType that a specific consumer reads (the product tile hero, the
             * swatch builder, etc.). The search filter derives its SCAPI `imgTypes` query
             * parameter from these values, so the same declaration drives both what SCAPI
             * returns and what tile components render — preventing drift. Set a role to
             * `undefined` to opt out of search filtering for that role.
             */
            images?: {
                /** viewType the product tile reads for the hero image. Default: `'medium'`. */
                tile?: string;
                /** viewType the swatch builder reads for color thumbnails. Default: `'swatch'`. */
                swatch?: string;
            };
        };
    };
    siteAliasMap?: Record<string, string>;
    /** Configuration for site-context cookies (site, locale, currency). */
    siteContext?: {
        /** Cookie name for persisting the selected currency. Defaults to 'currency'. */
        currencyCookieName?: string;
        /**
         * Cookie attributes (httpOnly, maxAge, secure, sameSite, etc.) applied to all site-context
         * cookies. NOTE: any `domain` here is ignored — the cookie domain is governed solely by the
         * global `app.cookies.domain` and the per-site `commerce.sites[].cookies.domain`.
         */
        cookieOptions?: SiteConfig['cookieOptions'];
    };
    siteDetectionConfig?: DetectionConfig;
    url?: Url;
    security?: {
        turnstile?: {
            sites: Record<string, Array<{ siteKey: string; domains: string[] }>>;
            enabled?: boolean;
            mode?: 'managed' | 'non-interactive' | 'invisible';
            verification?: {
                /** @deprecated Use `mode` instead. */
                enabled: boolean;
                /** Controls server-side verification behaviour. Takes precedence over `enabled`. */
                mode?: 'enforce' | 'log-only' | 'disabled';
            };
        };
        /**
         * Default security response headers (CSP, HSTS, X-Frame-Options, etc.)
         * applied by the SDK middleware. Any field omitted uses the SDK default.
         * See docs/README-SECURITY-HEADERS.md for the defaults table and recipes.
         */
        headers?: SecurityConfig;
    };
};

export type Config = BaseConfig<AppConfig>;

/**
 * Augment the SDK so `getConfig()` and `useConfig()` return the right shapes
 * without a generic argument at every call site. `getConfig(context)` (server)
 * returns the full `AppConfig` so server callers correctly read `serverExtension`;
 * `getConfig()` (no context, client) and `useConfig()` return the narrowed
 * `ClientAppConfig` (`Omit<AppConfig, ServerOnlyNamespace>`), so client modules
 * see a TypeScript error on `.serverExtension`. Both slots are filled from
 * types defined in `src/lib/app-config-client.ts`, which keeps
 * `SERVER_ONLY_NAMESPACES` the single source: the runtime extractor and the
 * type narrow can't drift. Customers writing additional templates augment both
 * interfaces in their own template's types file.
 */
declare module '@salesforce/storefront-next-runtime/config' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface AppConfigShape extends AppConfig {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ClientFacingAppConfigShape extends ClientAppConfig {}
}
