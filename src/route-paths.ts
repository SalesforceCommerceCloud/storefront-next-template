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

import { href } from 'react-router';
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';

/**
 * Centralized route path constants for the storefront application.
 *
 * ## Purpose
 *
 * This file is the single source of truth for all navigable URL patterns in the app.
 * Instead of hardcoding path strings like `'/product/123'` or `'/action/cart-item-add'`
 * throughout components, hooks, and route modules, all code references these constants.
 * This makes route renaming a single-file change rather than a codebase-wide find-and-replace.
 *
 * ## Keeping this file in sync with file-system routing
 *
 * Route paths are derived from the file-system routing convention in `src/routes/`.
 * React Router v7's flat-routes naming scheme maps filenames to URL segments:
 *
 *   `_app.product.$productId.tsx` → `/product/:productId`
 *   `_app.account.orders.$orderNo.tsx` → `/account/orders/:orderNo`
 *   `action.cart-item-add.tsx` → `/action/cart-item-add`
 *   `resource.recommendations.ts` → `/resource/recommendations`
 *
 * **When you rename, move, or delete a route file, you MUST update this file to match.**
 * Similarly, when you add a new route file, add its corresponding entry here so other
 * code can reference it without hardcoding the path.
 *
 * The generated types at `.react-router/types/+routes.ts` (produced by `react-router typegen`
 * or `pnpm dev`) list all registered route patterns — use it as the reference to verify
 * this file stays in sync.
 *
 * ## Two categories of routes
 *
 * - **`routes`** — Page routes that render UI. Used with `<Link>`, `navigate()`, and
 *   `redirect()`. Defined WITHOUT the multi-site prefix (`/:siteId/:localeId`) because
 *   the project's `<Link>` wrapper and `useNavigate` hook add it automatically via `buildUrl()`.
 *
 * - **`resourceRoutes`** — Server-side resource endpoints (both action and data routes).
 *   Used with `<Form action={...}>`, `fetcher.submit()`, and `fetcher.load(...)`.
 *   These have no site prefix (excluded via `config.server.ts` → `url.excludeRoutes`).
 *
 * ## Usage with `routeHref()`
 *
 * For routes with dynamic segments (`:param`), use `routeHref()` to interpolate values:
 *
 * ```tsx
 * import { routes, routeHref } from '@/route-paths';
 * import { Link } from '@/components/link';
 *
 * // Static route — use the constant directly
 * <Link to={routes.cart}>View Cart</Link>
 *
 * // Dynamic route — interpolate params with routeHref()
 * <Link to={createProductUrl({ productId: '12345' }, seoUrlContext)}>Product</Link>
 * <Link to={routeHref(routes.accountOrderDetail, { orderNo: 'ORD-001' })}>Order</Link>
 * ```
 *
 * For server-side redirects with site context:
 *
 * ```ts
 * import { routes } from '@/route-paths';
 * import { buildUrlFromContext } from '@/lib/url.server';
 *
 * throw redirect(buildUrlFromContext(routes.login, context));
 * ```
 *
 * Product and category routes are build-time configurable. Use `createProductUrl()` and
 * `createCategoryUrl()` instead of static route patterns for those destinations.
 */

/**
 * Page routes — navigable URLs rendered by layout routes under `src/routes/`.
 * Used with `<Link>`, `navigate()`, `redirect()`.
 * Defined WITHOUT the `/:siteId/:localeId` prefix — the Link wrapper adds it.
 */
export const routes = {
    home: '/',
    cart: '/cart',
    checkout: '/checkout',
    login: '/login',
    signup: '/signup',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    account: '/account',
    accountOverview: '/account/overview',
    accountOrders: '/account/orders',
    accountOrderDetail: '/account/orders/:orderNo',
    accountAddresses: '/account/addresses',
    accountPaymentMethods: '/account/payment-methods',
    accountStorePreferences: '/account/store-preferences',
    accountWishlist: '/account/wishlist',
    accountPasskeys: '/account/passkeys',
    wishlist: '/wishlist',
    orderConfirmation: '/order-confirmation/:orderNo',
    orderLookup: '/order-lookup',
    orderLookupVerify: '/order-lookup/verify/:orderNo',
    orderLookupResults: '/order-lookup/results/:orderNo',
    search: '/search',
    aboutUs: '/about-us',
    storeLocator: '/store-locator',
    maintenance: '/maintenance',
    logout: '/logout',
    componentPreview: '/preview/component',
} as const;

/**
 * Resource routes — server-side endpoints under `src/routes/action.*.ts(x)` and
 * `src/routes/resource.*.ts`. Used with `<Form action={...}>`, `fetcher.submit()`,
 * and `fetcher.load(...)`.
 * No site prefix — excluded via `config.server.ts` → `url.excludeRoutes`.
 */
export const resourceRoutes = {
    cartItemAdd: '/action/cart-item-add',
    cartItemRemove: '/action/cart-item-remove',
    cartItemUpdate: '/action/cart-item-update',
    cartBundleAdd: '/action/cart-bundle-add',
    cartBundleUpdate: '/action/cart-bundle-update',
    cartSetAdd: '/action/cart-set-add',
    promoCodeAdd: '/action/promo-code-add',
    promoCodeRemove: '/action/promo-code-remove',
    placeOrder: '/action/place-order',
    placeOrderPrepare: '/action/place-order-prepare',
    placeOrderFinalize: '/action/place-order-finalize',
    updateBasketBillingAddress: '/resource/update-basket-billing-address',
    wishlistAdd: '/action/wishlist-add',
    wishlistRemove: '/action/wishlist-remove',
    wishlistState: '/action/wishlist-state',
    paymentMethodAdd: '/action/payment-method-add',
    paymentMethodRemove: '/action/payment-method-remove',
    paymentMethodSetDefault: '/action/payment-method-set-default',
    requestPasswordReset: '/action/request-password-reset',
    otpRequest: '/action/otp-request',
    otpVerify: '/action/otp-verify',
    postOrderRegister: '/action/post-order-register',
    initiateCheckoutRegistration: '/action/initiate-checkout-registration',
    bonusProductAdd: '/action/bonus-product-add',
    setSiteContext: '/action/set-site-context',
    updateShopperContext: '/action/update-shopper-context',
    authorizePasswordlessEmail: '/action/authorize-passwordless-email',
    verifyPasswordlessOtp: '/action/verify-passwordless-otp',
    updateMarketingConsent: '/action/update-marketing-consent',
    updateTrackingConsent: '/action/update-tracking-consent',
    customerPreferencesUpdate: '/action/customer-preferences-update',
    cartPickupStoreUpdate: '/action/cart-pickup-store-update',
    setSelectedStore: '/action/set-selected-store',
    addReview: '/action/add-review',
    recommendations: '/resource/recommendations',
    basketProducts: '/resource/basket-products',
    reviewsSummary: '/resource/reviews-summary',
    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
    shippingDestination: '/resource/shipping-destination',
    categoryProducts: '/resource/category-products',
    stores: '/resource/stores',
    analyticsProxy: '/resource/analytics-proxy',
    apiClient: '/resource/api/client/:resource',
    passkeyStatus: '/resource/passkey-status',
    turnstileSession: '/resource/turnstile-session',
    passkeyDeleteCredential: '/action/passkey-delete-credential',
    passkeyStartAuthentication: '/action/passkey-start-authentication',
    passkeyFinishAuthentication: '/action/passkey-finish-authentication',
} as const;

/**
 * Interpolate dynamic segments (`:param`) in a route pattern with actual values.
 * Throws if a required param is missing — catches broken links at runtime rather than
 * silently producing malformed URLs.
 *
 * @example
 * routeHref(routes.accountOrderDetail, { orderNo: 'ORD-456' })
 * // → '/account/orders/ORD-456'
 *
 * routeHref(routes.cart)
 * // → '/cart' (no params needed for static routes)
 */
type RoutePattern = (typeof routes)[keyof typeof routes] | (typeof resourceRoutes)[keyof typeof resourceRoutes];

const allPatterns: ReadonlySet<string> = new Set([...Object.values(routes), ...Object.values(resourceRoutes)]);

export function routeHref(pattern: RoutePattern, params?: Record<string, string>): string {
    if (import.meta.env.DEV && !allPatterns.has(pattern)) {
        // oxlint-disable-next-line no-console
        console.warn(
            `[routeHref] Pattern "${pattern}" is not declared in route-paths.ts. ` +
                `Add it to routes or resourceRoutes to keep paths centralized.`
        );
    }
    // Delegate to React Router's href() for param interpolation.
    // The cast is needed because RR's generated Pages type only includes prefixed patterns
    // (/:siteId/:localeId/...), but our constants use the short form without the prefix.
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    return href(pattern as any, params);
}

export type SeoUrlContext = {
    siteId: string;
    /** Configured outer path pattern, such as `/:siteId/:localeId`. */
    urlPrefix?: string;
    seoRoutes?: SeoRoutesConfig;
};

export type ProductUrlInput = {
    productId?: string;
    slugSegments?: readonly string[];
    searchParams?: URLSearchParams;
};

export type CategoryUrlInput = {
    categoryId?: string;
    slugSegments: readonly string[];
};

function buildPath(segments: readonly string[]): string {
    if (segments.some((segment) => segment.length === 0)) {
        throw new Error('URL path segments must not be empty');
    }
    return `/${segments.map(encodePathSegment).join('/')}`;
}

function encodePathSegment(segment: string): string {
    return encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function appendSearchParams(path: string, searchParams?: URLSearchParams): string {
    const search = searchParams?.toString();
    return search ? `${path}?${search}` : path;
}

export function getSiteSeoRoutes(context?: SeoUrlContext) {
    if (!context?.seoRoutes) return undefined;

    const siteRoutes = context.seoRoutes[context.siteId];
    if (!siteRoutes) {
        throw new Error(`SEO routes are configured, but site "${context.siteId}" has no SEO route configuration`);
    }
    return siteRoutes;
}

/**
 * Rewrite a merchant-authored legacy category path through the active SEO route settings.
 * External URLs and non-category paths are returned unchanged.
 */
export function createCategoryUrlFromLegacyPath(destination: string, context?: SeoUrlContext): string {
    const match = destination.match(/^\/category\/([^?#]+)([?#].*)?$/);
    if (!match) return destination;

    const categoryConfig = getSiteSeoRoutes(context)?.category;
    if (!categoryConfig) return destination;

    let segments: string[];
    try {
        const normalizedPath = match[1].replace(/\/+$/, '');
        if (!normalizedPath) return destination;
        segments = normalizedPath.split('/').map((segment) => decodeURIComponent(segment));
    } catch {
        return destination;
    }
    const categoryId = segments.at(-1);
    const slugSegments = categoryConfig.mode === 'slug-path' ? segments : segments.slice(0, -1);
    return `${createCategoryUrl({ categoryId, slugSegments }, context)}${match[2] ?? ''}`;
}

/** Build a product URL without the outer site/locale prefix. */
export function createProductUrl(
    { productId, slugSegments = [], searchParams }: ProductUrlInput,
    context?: SeoUrlContext
): string {
    if (!productId) return '#';

    const productConfig = getSiteSeoRoutes(context)?.product;
    const segments = productConfig ? [productConfig.prefix, ...slugSegments, productId] : ['product', productId];
    return appendSearchParams(buildPath(segments), searchParams);
}

/** Build a category URL without the outer site/locale prefix. */
export function createCategoryUrl({ categoryId, slugSegments }: CategoryUrlInput, context?: SeoUrlContext): string {
    const categoryConfig = getSiteSeoRoutes(context)?.category;
    if (!categoryConfig) {
        if (categoryId === undefined) return '#';
        return categoryId ? buildPath(['category', categoryId]) : '/category/';
    }
    if (!slugSegments) {
        throw new Error('Category slug segments are required when SEO routes are configured');
    }
    if (categoryConfig.mode === 'slug-path') {
        if (slugSegments.length === 0) {
            throw new Error('Category slug-path mode requires at least one slug segment');
        }
        return buildPath([categoryConfig.prefix, ...slugSegments]);
    }
    if (!categoryId) return '#';
    return buildPath([categoryConfig.prefix, ...slugSegments, categoryId]);
}
