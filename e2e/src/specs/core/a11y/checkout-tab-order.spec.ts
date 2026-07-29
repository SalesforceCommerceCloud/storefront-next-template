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
 * Checkout keyboard tab-order regression (WCAG 2.4.3 Focus Order).
 *
 * Pins the DOM order of the two checkout grid children so keyboard users tab
 * through the main content (Express Payments, Contact Info, Shipping, Payment)
 * before the order-summary sidebar (Promo Code, cart items). The sidebar visually
 * renders on the right on desktop via `lg:order-2`, but must remain DOM-second so
 * tab order matches the visual reading order.
 *
 * Desktop-only: at the mobile breakpoint the sidebar is `hidden md:block` and the
 * Place Order button renders as a fixed-bottom bar with a distinct DOM shape, so
 * the structural selectors below do not apply.
 */

Feature('Checkout Tab Order').tag('@core').tag('@a11y').tag('@checkout').tag('@tab-order');

const { checkoutPage, apiCartSetupFlow, I } = inject();
import { expect } from 'chai';
import { TEST_PRODUCT_CATEGORIES } from '../../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../../utils/login-prefs-stub';

installLoginPrefsStubHooks();

// `md:` breakpoint (768px) - the sidebar becomes visible and the grid switches
// to two-column at this width.
const DESKTOP_MIN_WIDTH_PX = 768;

async function isDesktopViewport(): Promise<boolean> {
    const width = await (I.usePlaywrightTo('get viewport width', async ({ page }) => {
        return page.viewportSize()?.width ?? 1200;
    }) as unknown as Promise<number>);
    return width >= DESKTOP_MIN_WIDTH_PX;
}

Scenario('Main checkout content is tabbed before sidebar, footer is tabbed after', async () => {
    if (!(await isDesktopViewport())) {
        console.log(
            '[tab-order] Skipping on mobile viewport - sidebar is hidden and Place Order is a fixed-bottom bar'
        );
        return;
    }
    await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    checkoutPage.validatePageLoaded();

    // One representative focusable element per section, chosen by stable structural selectors:
    // - Main:    first button inside [data-testid="express-payments"] - locale-independent
    // - Sidebar: accordion trigger inside [data-testid="checkout-order-summary-sidebar"] - locale-independent
    // - Footer:  first anchor inside <footer> - structural, no text dependency
    const targets = {
        main: '[data-testid="express-payments"] button',
        sidebar: '[data-testid="checkout-order-summary-sidebar"] [data-slot="accordion-trigger"]',
        footer: 'footer a',
    };

    const positions = await checkoutPage.captureTabOrderPositions(targets);

    expect(positions.main, 'main content should be reached by Tab').to.be.greaterThan(0);
    expect(positions.sidebar, 'sidebar should be reached by Tab').to.be.greaterThan(0);
    expect(positions.footer, 'footer should be reached by Tab').to.be.greaterThan(0);

    expect(
        positions.main,
        `Main content (express payments at Tab #${positions.main}) must be reached BEFORE sidebar (Tab #${positions.sidebar}) so keyboard tab order matches visual reading order (WCAG 2.4.3)`
    ).to.be.lessThan(positions.sidebar);

    expect(
        positions.sidebar,
        `Sidebar (Tab #${positions.sidebar}) must be reached BEFORE footer (Tab #${positions.footer}) - footer is chrome and belongs at the end of the tab sequence`
    ).to.be.lessThan(positions.footer);
})
    .config({ retries: 0 })
    .tag('@wcag-2.4.3')
    .tag('@guest-checkout');

// Place Order is conditionally rendered once step >= PAYMENT, so this scenario
// progresses through the earlier steps first, then captures tab positions.
Scenario('Promo Code is tabbed before Place Order once payment step is open', async () => {
    if (!(await isDesktopViewport())) {
        console.log(
            '[tab-order] Skipping on mobile viewport - sidebar is hidden and Place Order is a fixed-bottom bar'
        );
        return;
    }
    await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    checkoutPage.validatePageLoaded();

    // Progress through checkout to reach the payment step so the Place Order form renders.
    const email = `tab-order-${Date.now()}@example.com`;
    await checkoutPage.fillContactInfo(email);

    const { TEST_SHIPPING_ADDRESS } = await import('../../../test-data/checkout.data');
    await checkoutPage.fillShippingAddress(TEST_SHIPPING_ADDRESS);
    await checkoutPage.selectShippingMethod(0);

    const targets = {
        sidebar: '[data-testid="checkout-order-summary-sidebar"] [data-slot="accordion-trigger"]',
        placeOrder: 'form[data-checkout-mobile-bar] button[type="submit"]',
    };

    // Larger maxTabs bound because the payment step exposes many focusable controls
    // (card fields, billing checkbox, saved-address dropdown, etc.) between sidebar
    // and Place Order.
    const positions = await checkoutPage.captureTabOrderPositions(targets, 120);

    expect(positions.sidebar, 'sidebar promo code accordion should be reached by Tab').to.be.greaterThan(0);
    expect(positions.placeOrder, 'place order button should be reached by Tab').to.be.greaterThan(0);

    expect(
        positions.sidebar,
        `Promo Code accordion (Tab #${positions.sidebar}) must be reached BEFORE Place Order (Tab #${positions.placeOrder}) so keyboard shoppers do not have to Shift+Tab past the submit button to apply a promo (WCAG 2.4.3)`
    ).to.be.lessThan(positions.placeOrder);
})
    .config({ retries: 0 })
    .tag('@wcag-2.4.3')
    .tag('@guest-checkout');
