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
 * <Link to={routeHref(routes.product, { productId: '12345' })}>Product</Link>
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
 * ## Customizing route paths
 *
 * To rename a route (e.g., `/product` → `/p`):
 * 1. Rename the route file: `_app.product.$productId.tsx` → `_app.p.$productId.tsx`
 * 2. Update the constant here: `product: '/p/:productId'`
 * 3. Run `pnpm typecheck` and `pnpm test` to verify nothing broke.
 *
 * All references across the codebase will automatically pick up the new path.
 */

/**
 * Page routes — navigable URLs rendered by layout routes under `src/routes/`.
 * Used with `<Link>`, `navigate()`, `redirect()`.
 * Defined WITHOUT the `/:siteId/:localeId` prefix — the Link wrapper adds it.
 */
export const routes = {
    home: '/',
    product: '/product/:productId',
    category: '/category/:categoryId',
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
    wishlist: '/wishlist',
    orderConfirmation: '/order-confirmation/:orderNo',
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
    stores: '/resource/stores',
    analyticsProxy: '/resource/analytics-proxy',
    apiClient: '/resource/api/client/:resource',
} as const;

/**
 * Interpolate dynamic segments (`:param`) in a route pattern with actual values.
 * Throws if a required param is missing — catches broken links at runtime rather than
 * silently producing malformed URLs.
 *
 * @example
 * routeHref(routes.product, { productId: 'sneaker-123' })
 * // → '/product/sneaker-123'
 *
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
        // eslint-disable-next-line no-console
        console.warn(
            `[routeHref] Pattern "${pattern}" is not declared in route-paths.ts. ` +
                `Add it to routes or resourceRoutes to keep paths centralized.`
        );
    }
    // Delegate to React Router's href() for param interpolation.
    // The cast is needed because RR's generated Pages type only includes prefixed patterns
    // (/:siteId/:localeId/...), but our constants use the short form without the prefix.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return href(pattern as any, params);
}
