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
import { getStorefrontOrigin, getStorefrontScopedCookies } from '../utils/cookie-utils';
import { getSfccCookieNames } from '../utils/api-login-utils';
import { getSiteId } from '../utils/site-id';
import { buildSitePath } from '../utils/url-utils';

/**
 * Storefront Page Object
 * Handles interactions with the main storefront homepage and common elements
 */
class StorefrontPage {
    // Locators for common storefront elements
    locators = {
        // Header elements
        // :visible ensures the mobile input (inside header-search-mobile) is used on
        // narrow viewports, where the desktop input wrapper is display:none.
        searchInput: locate('input[data-testid="header-search"]:visible').as('Search Input'),
        cartIcon: locate('[data-testid*="cart"]').as('Cart Icon'),
        userIcon: locate('[data-testid*="user"]').as('User Icon'),

        // Navigation elements
        navMenu: locate('[data-slot="navigation-menu"]').as('Navigation Menu'),
        categoryLinks: locate('[data-slot="navigation-menu"] a').as('Category Links'),

        // Product elements (homepage uses ProductCarousel > ProductTile without data-testids)
        productTiles: locate('a[href*="/product/"]').as('Product Tiles'),
        productImages: locate('a[href*="/product/"] img').as('Product Images'),
        productTitles: locate('a[href*="/product/"] h3, a[href*="/product/"] h2').as('Product Titles'),
        productPrices: locate('[data-testid*="price"]').as('Product Prices'),

        // Footer elements
        footer: locate('footer').as('Footer'),
        footerLinks: locate('footer a').as('Footer Links'),

        // Tracking consent banner (rendered at root, may appear on any page)
        trackingConsentBanner: locate(
            'div[role="dialog"]:has-text("tracking"), div[role="dialog"]:has-text("cookies"), div[role="dialog"]:has-text("consent")'
        ).as('Tracking Consent Banner'),
        trackingConsentAcceptButton: locate('div[role="dialog"] button:has-text("Accept")').as(
            'Accept Tracking Consent Button'
        ),
        trackingConsentDeclineButton: locate('div[role="dialog"] button:has-text("Decline")').as(
            'Decline Tracking Consent Button'
        ),

        // Loading states
        loadingSpinner: locate('[data-testid*="loading"]').as('Loading Spinner'),

        // Error states
        errorMessage: locate('[data-testid*="error"]').as('Error Message'),
    };

    /**
     * Navigate to the storefront homepage
     * @param url - Base URL of the storefront (defaults to environment BASE_URL)
     */
    navigate(url?: string): void {
        const baseUrl = url || process.env.BASE_URL || 'http://localhost:5173';
        I.amOnPage(new URL(buildSitePath('/'), baseUrl).toString());
    }

    /**
     * Navigate to an already-prefixed URL path (e.g., '/us/en-US/category/jackets').
     * Use for multi-site tests that construct explicit site/locale prefixes
     * instead of relying on buildSitePath().
     * @param prefixedPath - Full path including any site/locale prefix
     */
    navigateToUrl(prefixedPath: string): void {
        I.amOnPage(prefixedPath);
    }

    /**
     * Validate the page title contains expected text
     * @param expectedTitle - Expected title text (can be partial match)
     */
    validateTitle(expectedTitle: string): void {
        I.seeInTitle(expectedTitle);
    }

    /**
     * Grab the full document title. Use when a substring check (validateTitle)
     * isn't enough — e.g. asserting a non-empty brand suffix resolved, not just
     * the static title prefix.
     */
    async getTitle(): Promise<string> {
        return await I.grabTitle();
    }

    /**
     * Validate that SFCC (Salesforce Commerce Cloud) cookies are set.
     * Only considers cookies scoped to the storefront domain (excludes proxy/external API cookies).
     * @param siteId - Site ID for cookie namespacing (defaults to environment SITE_ID)
     */
    async validateSFCCCookies(siteId?: string): Promise<void> {
        const actualSiteId = getSiteId(siteId);
        const storefrontCookies = await getStorefrontScopedCookies();
        const names = getSfccCookieNames(actualSiteId);

        // customerId is NOT a cookie — it is derived per-request from the SLAS access
        // token (cc-at) JWT `isb` claim and exposed via useAuth(). `usid` IS a cookie because
        // hybrid storefronts forward it to ECOM, which does not parse the access token.
        const expectedCookies = [names.accessToken, names.guestRefresh, names.usid];

        for (const cookieName of expectedCookies) {
            if (!storefrontCookies.has(cookieName)) {
                throw new Error(`Expected SFCC cookie '${cookieName}' not found on storefront domain`);
            }
        }
    }

    /**
     * Wait for session cookies to be set based on user type and return them.
     * Uses Playwright's context.cookies() in a tight loop inside a single
     * usePlaywrightTo call, avoiding repeated Node-to-browser round-trips.
     *
     * @param userType - Type of user: 'guest' (cc-nx-g) or 'registered' (cc-nx)
     * @param siteId - Site ID for cookie namespacing (defaults to environment SITE_ID)
     * @param timeoutSeconds - Maximum time to wait in seconds (default: 30)
     * @returns Object containing all session cookies
     */
    async waitForSessionCookies(
        userType: 'guest' | 'registered',
        siteId?: string,
        timeoutSeconds: number = 30
    ): Promise<{
        accessToken: string | null;
        guestRefreshToken: string | null;
        authRefreshToken: string | null;
        usid: string | null;
    }> {
        const actualSiteId = getSiteId(siteId);
        const names = getSfccCookieNames(actualSiteId);
        const refreshTokenName = userType === 'guest' ? names.guestRefresh : names.registeredRefresh;
        const timeoutMs = timeoutSeconds * 1000;

        const result = await (I.usePlaywrightTo(`wait for ${userType} session cookies`, async ({ page }) => {
            const fallbackOrigin = getStorefrontOrigin();
            const deadline = Date.now() + timeoutMs;

            while (Date.now() < deadline) {
                const pageUrl = page.url();
                const origin = pageUrl && !pageUrl.startsWith('about:') ? new URL(pageUrl).origin : fallbackOrigin;
                const cookies = await page.context().cookies(origin);
                const cookieMap = new Map(cookies.map((c: { name: string; value: string }) => [c.name, c.value]));

                const accessToken = cookieMap.get(names.accessToken) ?? null;
                const guestRefreshToken = cookieMap.get(names.guestRefresh) ?? null;
                const authRefreshToken = cookieMap.get(names.registeredRefresh) ?? null;
                const usid = cookieMap.get(names.usid) ?? null;
                const refreshToken = userType === 'guest' ? guestRefreshToken : authRefreshToken;

                if (accessToken && refreshToken && usid) {
                    return { accessToken, guestRefreshToken, authRefreshToken, usid };
                }

                await page.waitForTimeout(250);
            }

            throw new Error(
                `Timeout waiting for ${userType} session cookies (${refreshTokenName}) after ${timeoutSeconds} seconds`
            );
        }) as unknown as Promise<{
            accessToken: string | null;
            guestRefreshToken: string | null;
            authRefreshToken: string | null;
            usid: string | null;
        }>);

        return result;
    }

    /**
     * Search for products using the search input
     * @param searchTerm - Product search term
     */
    searchForProduct(searchTerm: string): void {
        I.fillField(this.locators.searchInput, searchTerm);
        I.pressKey('Enter');
    }

    /**
     * Click on the first product tile to view product details
     */
    clickFirstProduct(): void {
        I.click(this.locators.productTiles.first());
    }

    /**
     * Get the number of visible product tiles on the page
     * @returns Promise<number> - Number of product tiles
     */
    async getProductCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.productTiles);
    }

    /**
     * Verify the page has loaded successfully without errors
     */
    validatePageLoaded(timeoutSeconds: number = 30): void {
        // Wait for main page elements to be visible
        I.waitForElement(this.locators.navMenu, timeoutSeconds);
        I.seeElement(this.locators.navMenu);
        I.dontSeeElement(this.locators.errorMessage);

        // Ensure no loading spinners are still visible
        I.dontSeeElement(this.locators.loadingSpinner);
    }

    /**
     * Navigate to cart page via cart icon
     */
    goToCart(): void {
        I.click(this.locators.cartIcon);
    }

    /**
     * Navigate to user account/login page
     */
    goToUserAccount(): void {
        I.click(this.locators.userIcon);
    }

    /**
     * Dismiss the tracking consent banner if it is visible.
     * The banner is rendered at the app root and can appear on any page.
     *
     * Changed from a simple `I.click()` to Playwright's locator API with explicit waitFor +
     * click. The original CodeceptJS click was unreliable on the consent dialog — the button
     * could be overlaid or not yet actionable when the click fired, which meant tracking consent
     * was never accepted and checkout-analytics E2E tests failed (analytics events only fire
     * after consent is accepted). Falls back to `I.click()` if the Playwright strategy fails.
     *
     * @param accept - true to accept tracking, false to decline
     */
    async handleTrackingConsent(accept: boolean = true): Promise<void> {
        const bannerVisible = await I.grabNumberOfVisibleElements(this.locators.trackingConsentBanner);
        if (bannerVisible === 0) return;

        const buttonLocator = accept
            ? this.locators.trackingConsentAcceptButton
            : this.locators.trackingConsentDeclineButton;
        await (
            I.usePlaywrightTo('click tracking consent button', async ({ page }) => {
                const selector = accept
                    ? 'div[role="dialog"] button:has-text("Accept")'
                    : 'div[role="dialog"] button:has-text("Decline")';
                const button = page.locator(selector).first();
                await button.waitFor({ state: 'visible', timeout: 5000 });
                await button.click({ timeout: 5000 });
            }) as unknown as Promise<void>
        ).catch(() => {
            // Fallback to Codecept click to preserve previous behavior when Playwright locator strategy fails.
            I.click(buttonLocator);
        });
    }

    /**
     * Check whether the current browser context has an active registered-user session.
     * Uses the presence of the `cc-nx_<siteId>` cookie (the registered refresh token) as the signal.
     * Returns false if the cookie is absent (cleared by another spec's Before hook, expired, etc.).
     *
     * @param siteId - Site ID for cookie namespacing (defaults to environment SITE_ID)
     */
    async hasRegisteredSession(siteId?: string): Promise<boolean> {
        const actualSiteId = getSiteId(siteId);
        const storefrontCookies = await getStorefrontScopedCookies();
        return storefrontCookies.has(getSfccCookieNames(actualSiteId).registeredRefresh);
    }

    /**
     * Clear all browser cookies for the current context.
     * Resets the browser to an unauthenticated guest state, equivalent to opening a fresh tab.
     * Use in Before hooks when scenarios must start fully independent of prior session state.
     */
    async clearCookies(): Promise<void> {
        await I.usePlaywrightTo('clear browser cookies', async ({ page }) => {
            await page.context().clearCookies();
        });
    }

    /**
     * Logout current user by clearing authentication cookies
     * This resets the session to guest state
     * Can be called from any page since logout is a global action
     * @param siteId - Site ID for cookie namespacing (defaults to environment SITE_ID)
     */
    async logout(siteId?: string): Promise<void> {
        const actualSiteId = getSiteId(siteId);
        const names = getSfccCookieNames(actualSiteId);

        I.clearCookie(names.accessToken);
        I.clearCookie(names.registeredRefresh);
        I.clearCookie(names.usid);

        // Reload the page so the storefront's auth middleware runs and issues a new guest session
        I.refreshPage();

        // Wait for guest session to be re-established; retry once on timeout
        try {
            await this.waitForSessionCookies('guest', actualSiteId);
        } catch {
            I.refreshPage();
            await this.waitForSessionCookies('guest', actualSiteId);
        }
    }
}

// Export as singleton following CodeceptJS pattern
const storefrontPageInstance = new StorefrontPage();
export = storefrontPageInstance;
