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

const { I, checkoutPage, cartPage, addToCartFlow, storefrontPage } = inject();
import {
    getScapiConfig,
    createCartViaApi,
    createBasket,
    addItemToBasket,
    searchOrderableVariantIds,
    type ApiCartResult,
    type BasketInfo,
    type GuestTokens,
} from '../utils/scapi-helper';
import { getStorefrontOrigin } from '../utils/cookie-utils';
import { buildCookieDefaults, getSfccCookieNames } from '../utils/api-login-utils';
import { getSiteId } from '../utils/site-id';
import { TEST_VARIANT_PRODUCTS } from '../test-data/checkout.data';
import type { ProductInfo } from '../types/product.types';

const CATEGORY_TO_VARIANT: Record<string, string> = {
    'category/mens-clothing-jackets': TEST_VARIANT_PRODUCTS.MENS_JACKET_VARIANT,
    'category/womens-clothing-dresses': TEST_VARIANT_PRODUCTS.WOMENS_DRESS_VARIANT,
};

/**
 * API Cart Setup Flow
 *
 * Creates a basket via direct SCAPI calls and injects session cookies into the
 * browser context, bypassing the UI add-to-cart journey. Intended only for checkout
 * tests where cart setup is a prerequisite, not the subject under test.
 *
 * Falls back to addToCartFlow when SCAPI config is unavailable, the category has
 * no known variant mapping, or the API call fails.
 */
class ApiCartSetupFlow {
    /**
     * Set up a cart and navigate to checkout.
     * Tries the fast API path for guest sessions, falls back to UI flow for
     * registered shoppers (API creates a guest session that would clobber auth cookies).
     *
     * TODO: drop the registered-shopper UI fallback. With apiLoginFlow available
     * (src/flows/api-login.flow.ts), registered carts can use the API path by passing the
     * registered tokens to createBasket() instead of creating a fresh guest session.
     * Bundle with the loginFlow → apiLoginFlow migration TODO in login.flow.ts.
     *
     * TODO: extract buildCookieDefaults() to api-login-utils.ts so the inline cookie
     * construction at injectSessionCookies() below shares the domain/path/secure/sameSite
     * logic with buildRegisteredSessionCookies(). Same shape, different cookie names
     * (cc-nx-g_ for guest vs cc-nx_ for registered).
     */
    async executeAndNavigateToCheckout(
        categoryUrl: string,
        maxRetries?: number,
        options?: { sitePrefix?: string }
    ): Promise<ProductInfo> {
        if (!options?.sitePrefix && !(await this.hasRegisteredSession())) {
            const variantId = CATEGORY_TO_VARIANT[categoryUrl];
            if (variantId) {
                try {
                    const result = await this.setupCartViaApi(variantId);
                    if (result) {
                        return { title: `API-cart (${variantId})`, quantity: '1' };
                    }
                } catch {
                    /* fall through to UI flow */
                }
            }
        }

        return addToCartFlow.executeAndNavigateToCheckout(categoryUrl, maxRetries, options);
    }

    /**
     * Seed a guest cart via direct SCAPI and land on the cart page (not checkout).
     *
     * Fills the basket up to `minItems` (default 2) distinct products. The caller-supplied
     * `variantIds` are tried first as a fast path, but a shifting sandbox routinely takes a
     * hardcoded SKU out of stock (the out-of-stock failure that blocked earlier cart-panel
     * regression runs), so any that the backend rejects are skipped and the basket is then
     * topped up with currently-orderable products discovered via `product-search`. This keeps
     * setup independent of any single SKU's live stock level.
     *
     * The basket is built under the browser's OWN guest session (established by navigating to the
     * storefront first), not a separately-minted server-side session. An earlier version minted a
     * fresh guest session server-side and injected its cookies into the browser; a clean sandbox
     * rejected that injected session on basket hydration (SCAPI HTTP 400), so the regression could
     * not run with a populated cart. Reusing the browser's own token to authorize the basket writes
     * removes the cross-session mismatch entirely — the token the /cart loader replays is the same
     * one that created the basket.
     *
     * Returns false — so callers fall back to the UI add-to-cart flow — when SCAPI config is
     * unavailable, the browser never established a guest session, fewer than the requested minItems
     * products could be added, or the browser did not render the seeded items on the cart page.
     * Success is reported
     * only after the items are confirmed rendered, so a hydration failure can never masquerade as a
     * seeded cart.
     */
    async seedGuestCartAndNavigateToCart(
        variantIds: string[] = [],
        options?: { currency?: string; minItems?: number }
    ): Promise<boolean> {
        const config = getScapiConfig();
        if (!config) {
            return false;
        }

        const minItems = options?.minItems ?? 2;

        try {
            // Establish the browser's own guest session, then build the basket under it (see the
            // method doc and readBrowserGuestTokens for why this replaces the injected-session bridge).
            storefrontPage.navigate();
            const tokens = await this.readBrowserGuestTokens(config.siteId);
            if (!tokens) {
                return false;
            }

            const basketId = await createBasket(config, tokens, options?.currency);

            let basket: BasketInfo | null = null;
            // Returns the updated basket (assigned in the outer scope by the caller) or null when the
            // backend rejects the product; assigning at the call site keeps the type narrowing that a
            // closure-scoped assignment would defeat.
            const addOne = async (id: string): Promise<BasketInfo | null> => {
                try {
                    return await addItemToBasket(config, tokens, basketId, id, 1);
                } catch (error) {
                    // Skip only a product the backend refuses to add (e.g. out of stock) and keep
                    // trying others. Any other failure (auth, network) means the seed itself is
                    // broken, so let it propagate to the UI fallback rather than silently
                    // masquerading as an out-of-stock skip and running the spec on a short basket.
                    if (error instanceof Error && error.message.startsWith('Add item to basket failed')) {
                        return null;
                    }
                    throw error;
                }
            };

            // Fast path: caller-provided variant hints (may be out of stock).
            for (const variantId of variantIds) {
                if (basket && basket.uniqueProductCount >= minItems) break;
                basket = (await addOne(variantId)) ?? basket;
            }

            // Resilient top-up: discover currently-orderable products so setup never depends on a
            // specific SKU staying in stock. A search failure here is non-fatal — we still use
            // whatever the hints managed to add.
            if (!basket || basket.uniqueProductCount < minItems) {
                try {
                    const discovered = await searchOrderableVariantIds(config, tokens, { limit: 12 });
                    for (const id of discovered) {
                        if (basket && basket.uniqueProductCount >= minItems) break;
                        basket = (await addOne(id)) ?? basket;
                    }
                } catch {
                    /* discovery unavailable; fall through with whatever was added */
                }
            }

            // Report seeded only when the basket actually reached the requested item count. A short
            // basket (fewer than minItems) would let the two-item regression run on a single line
            // item, so fall back to the UI flow instead of reporting a weakened fixture as seeded.
            if (!basket || basket.uniqueProductCount < minItems) {
                return false;
            }

            // Point the browser's existing session at the basket we just built (basket snapshot
            // cookie only — the session/token cookies are the browser's own), then land on the cart.
            await this.setBasketCookie(config.siteId, basket);
            cartPage.navigate();

            // Report success only once the browser has actually hydrated the seeded items, so a
            // hydration failure falls back to the UI flow instead of proceeding on a broken cart.
            return await this.cartRenderedItems();
        } catch {
            return false;
        }
    }

    /**
     * Read the guest SLAS tokens the storefront's auth middleware set on the browser's OWN session
     * (after navigating to the storefront). Building the seeded basket under this session — rather
     * than a separately-minted server-side session injected as cookies — is what makes the seed
     * portable: the token authorizing the basket writes is the exact one the /cart loader replays,
     * so there is no cross-session mismatch for basket hydration to reject (the SCAPI HTTP 400 the
     * injected bridge hit in a clean sandbox).
     *
     * Polls briefly because the middleware sets the cookies on the first storefront response, which
     * may land just after navigation settles. Returns null (caller falls back to the UI add-to-cart
     * flow) if the guest access token never appears, or if a registered-shopper session is present
     * (seeding a guest basket over a logged-in session would clobber it).
     */
    private async readBrowserGuestTokens(siteId: string): Promise<GuestTokens | null> {
        const names = getSfccCookieNames(siteId);
        return await (I.usePlaywrightTo('read browser guest session tokens', async ({ page }) => {
            for (let attempt = 0; attempt < 10; attempt++) {
                const cookies = await page.context().cookies();
                const valueOf = (name: string) =>
                    cookies.find((c: { name: string; value: string }) => c.name === name)?.value ?? '';
                const accessToken = valueOf(names.accessToken);
                const registeredRefresh = valueOf(names.registeredRefresh);
                if (accessToken && !registeredRefresh) {
                    return {
                        accessToken,
                        refreshToken: valueOf(names.guestRefresh),
                        usid: valueOf(names.usid),
                        // customerId/expiresIn are unused by the basket writes (which authorize via
                        // the Bearer access token); the storefront derives customerId per request
                        // from the token's `isb` claim.
                        customerId: '',
                        expiresIn: 0,
                    };
                }
                await page.waitForTimeout(300);
            }
            return null;
        }) as unknown as Promise<GuestTokens | null>);
    }

    /**
     * Point the browser's existing guest session at the API-built basket by writing only the basket
     * snapshot cookie. The session/token cookies are the browser's own (set by the storefront) and
     * are deliberately left untouched — overwriting them is what made the old inject-everything
     * bridge fragile.
     */
    private async setBasketCookie(siteId: string, basket: BasketInfo): Promise<void> {
        const cookieDefaults = buildCookieDefaults(getStorefrontOrigin());
        const names = getSfccCookieNames(siteId);
        const basketSnapshot = JSON.stringify({
            basketId: basket.basketId,
            totalItemCount: basket.totalItemCount,
            uniqueProductCount: basket.uniqueProductCount,
        });
        await (I.usePlaywrightTo('set basket snapshot cookie', async ({ page }) => {
            await page
                .context()
                .addCookies([{ ...cookieDefaults, name: names.basket, value: basketSnapshot, httpOnly: false }]);
        }) as unknown as Promise<void>);
    }

    /**
     * Confirm the browser actually hydrated the seeded basket into rendered cart line items. The
     * old flow reported success on server-side basket creation alone, so a basket the browser could
     * not hydrate still read as "seeded" and the caller's UI fallback never ran. Returning the real
     * render result lets the caller fall back to the UI add-to-cart flow when hydration fails.
     */
    private async cartRenderedItems(timeoutSeconds: number = 20): Promise<boolean> {
        return await (I.usePlaywrightTo('verify cart rendered items', async ({ page }) => {
            try {
                await page
                    .locator('[data-testid*="product-item"]')
                    .first()
                    .waitFor({ state: 'visible', timeout: timeoutSeconds * 1000 });
                return true;
            } catch {
                return false;
            }
        }) as unknown as Promise<boolean>);
    }

    /**
     * Detect whether the browser already has a registered shopper session.
     * The cc-nx_ cookie (without -g suffix) is the registered refresh token,
     * only set after login. If present, API cart setup would clobber it.
     */
    private async hasRegisteredSession(): Promise<boolean> {
        const siteId = getSiteId();
        const cookieName = getSfccCookieNames(siteId).registeredRefresh;
        return await (I.usePlaywrightTo('check for registered session', async ({ page }) => {
            const cookies = await page.context().cookies();
            return cookies.some((c: { name: string; value: string }) => c.name === cookieName && c.value.length > 0);
        }) as unknown as Promise<boolean>);
    }

    private async setupCartViaApi(
        productId: string,
        options?: { quantity?: number; currency?: string }
    ): Promise<ApiCartResult | null> {
        const config = getScapiConfig();
        if (!config) {
            return null;
        }

        const result = await createCartViaApi(config, productId, {
            quantity: options?.quantity ?? 1,
            currency: options?.currency,
        });

        await this.injectSessionCookies(config.siteId, result);
        await checkoutPage.navigateWithRetry();
        await this.waitForCheckoutReady();

        const emptyShown = await checkoutPage.isEmptyCartShown();
        if (emptyShown) {
            throw new Error('Checkout showed empty cart after API-based cart setup');
        }

        return result;
    }

    private async injectSessionCookies(siteId: string, result: ApiCartResult): Promise<void> {
        const cookieDefaults = buildCookieDefaults(getStorefrontOrigin());
        const names = getSfccCookieNames(siteId);

        const basketSnapshot = JSON.stringify({
            basketId: result.basket.basketId,
            totalItemCount: result.basket.totalItemCount,
            uniqueProductCount: result.basket.uniqueProductCount,
        });

        await (I.usePlaywrightTo('inject SCAPI session cookies', async ({ page }) => {
            // customerId is derived per-request from the SLAS access token JWT `isb` claim, so
            // it is not injected. `usid` IS injected because hybrid storefronts forward it to
            // ECOM (and the storefront's auth middleware writes it on the response anyway).
            await page.context().addCookies([
                { ...cookieDefaults, name: names.accessToken, value: result.tokens.accessToken, httpOnly: true },
                { ...cookieDefaults, name: names.guestRefresh, value: result.tokens.refreshToken, httpOnly: true },
                { ...cookieDefaults, name: names.usid, value: result.tokens.usid, httpOnly: true },
                { ...cookieDefaults, name: names.basket, value: basketSnapshot, httpOnly: false },
            ]);
        }) as unknown as Promise<void>);
    }

    private async waitForCheckoutReady(timeoutSeconds: number = 30): Promise<void> {
        await (I.usePlaywrightTo('wait for checkout content', async ({ page }) => {
            const content = page.locator(
                '[data-testid="sf-toggle-card-contact-info-content"], :text-matches("No items in cart")'
            );
            await content.first().waitFor({ state: 'visible', timeout: timeoutSeconds * 1000 });
        }) as unknown as Promise<void>);
    }
}

export = new ApiCartSetupFlow();
