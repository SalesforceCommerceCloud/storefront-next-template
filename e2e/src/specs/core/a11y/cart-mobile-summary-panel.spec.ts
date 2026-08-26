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
 * Cart mobile order-summary panel regression (WCAG 2.4.11 Focus Not Obscured).
 *
 * The mobile order-summary panel is `position: fixed` at the bottom of the viewport and only
 * renders below the `md` breakpoint (`md:hidden` in cart-content.tsx) - it is entirely absent
 * from the DOM at desktop widths, so this spec forces a narrow viewport rather than relying on
 * whichever multiple-config project (desktop/mobile) picks it up.
 *
 * Pins two things a regression in the panel's ResizeObserver-driven spacer wiring would break:
 * 1. The cart container's real bottom padding stays in sync with the panel's live height, so
 *    scrollable content always has genuine layout space reserved beneath the fixed panel.
 * 2. The truly last focusable control a keyboard user reaches in the final line item (not just the
 *    Remove button, which renders before the quantity picker and the gift controls) remains visible
 *    and focusable, clear of both the fixed panel and any fixed/sticky header, once the spacer and
 *    focus-clearance lift are in place.
 */

Feature('Cart Mobile Summary Panel').tag('@core').tag('@a11y').tag('@cart').tag('@mobile');

const { I, cartPage, apiCartSetupFlow, addToCartFlow, storefrontPage } = inject();
import { expect } from 'chai';
import { TEST_PRODUCT_CATEGORIES, TEST_VARIANT_PRODUCTS } from '../../../test-data/checkout.data';

// A true "400% zoom" proxy derived from the audited setup: a 1280x1024 desktop viewport at 400%
// browser zoom exposes a 320x256 CSS-pixel layout (1280/4 wide, 1024/4 tall). The short 256px
// height is what forces the fixed-bottom panel and its expanded accordion to compete for usable
// height - the constrained-height failure mode a taller proxy (e.g. 320x568) would mask.
const ZOOM_PROXY_VIEWPORT = { width: 320, height: 256 };

// Seed a multi-item guest cart directly via SCAPI (a "seeded cart") so the scenario doesn't depend
// on live sandbox inventory. The two variant hints below are tried first, but a shifting sandbox
// routinely takes them out of stock (the failure that blocked earlier runs of this spec), so the
// seed flow tops the basket up with currently-orderable products discovered via product-search.
// Falls back to the UI add-to-cart flow only when SCAPI config isn't available locally.
async function setUpMultiItemCart(): Promise<void> {
    const seeded = await apiCartSetupFlow.seedGuestCartAndNavigateToCart([
        TEST_VARIANT_PRODUCTS.WOMENS_DRESS_VARIANT,
        TEST_VARIANT_PRODUCTS.MENS_JACKET_VARIANT,
    ]);
    if (!seeded) {
        await addToCartFlow.execute(TEST_PRODUCT_CATEGORIES.WOMENS_DRESSES);
        cartPage.navigate();
    }
    cartPage.validateCartHasItems();
    // The tracking-consent dialog is fixed to the bottom of the viewport, same as the mobile
    // summary panel - at narrow widths they overlap and the dialog intercepts the panel's clicks.
    // Dismiss it so it can't intercept the panel or the probe controls.
    await storefrontPage.handleTrackingConsent(true);
}

Scenario('Cart container bottom padding stays synced to the expanded mobile summary panel height', async () => {
    // Populate the cart at the default viewport (the add-to-cart flow is exercised at desktop/tablet
    // width in the existing suite), then shrink to the zoom proxy - this also mirrors the real user
    // flow: items are already in the cart when the shopper zooms to 400%.
    await setUpMultiItemCart();
    I.resizeWindow(ZOOM_PROXY_VIEWPORT.width, ZOOM_PROXY_VIEWPORT.height);

    await cartPage.expandMobileSummaryAccordion();
    const { panelHeightPx, containerPaddingBottomPx } = await cartPage.getMobileSummarySpacerSync();

    expect(panelHeightPx, 'mobile summary panel should have a measurable height').to.be.greaterThan(0);
    expect(
        containerPaddingBottomPx,
        `cart container bottom padding (${containerPaddingBottomPx}px) must match the expanded panel's live height (${panelHeightPx}px) so content has genuine layout space beneath it`
    ).to.equal(panelHeightPx);
    // WCAG 2.4.11 / 1.4.10: even with the accordion expanded at the 400% proxy, the fixed panel is
    // height-capped and scrolls internally, so it must not consume the whole viewport - a band must
    // remain above it for an underlying cart control to stay reachable. Without the panel cap the
    // expanded panel fills (or overruns) the 256px viewport and this band collapses.
    expect(
        ZOOM_PROXY_VIEWPORT.height - panelHeightPx,
        `the expanded panel (${panelHeightPx}px) must leave a visible band within the ${ZOOM_PROXY_VIEWPORT.height}px viewport for an underlying cart control`
    ).to.be.greaterThan(40);
})
    .config({ retries: 0 })
    .tag('@wcag-2.4.11');

Scenario('Last focusable control in the final cart item is reachable and clear of the panel and header', async () => {
    await setUpMultiItemCart();
    I.resizeWindow(ZOOM_PROXY_VIEWPORT.width, ZOOM_PROXY_VIEWPORT.height);

    await cartPage.expandMobileSummaryAccordion();
    await cartPage.getMobileSummarySpacerSync();

    const {
        found,
        isRemoveButton,
        controlLabel,
        reachedByTab,
        tabCount,
        fullyInViewport,
        abovePanel,
        clearOfTopChrome,
        pointerHitsControl,
    } = await cartPage.tabToLastFocusableCartControlAndCheckUsable();

    expect(found, 'the last cart line item should contain a focusable control').to.equal(true);
    // ProductItem renders the Remove button before the quantity picker and the gift controls, so the
    // truly last focusable control (e.g. the gift "Learn more") is NOT the Remove button. Asserting
    // this pins that the probe reaches a control after Remove - the coverage gap it was widened to close.
    expect(
        isRemoveButton,
        `the last focusable control in the item ("${controlLabel}") should be a control after the Remove button, not the Remove button itself`
    ).to.equal(false);
    expect(
        reachedByTab,
        `the last focusable control ("${controlLabel}") should be reachable by Tab traversal (pressed Tab ${tabCount}x)`
    ).to.equal(true);
    expect(
        fullyInViewport,
        `the Tab-focused control ("${controlLabel}") must be fully within the viewport, not scrolled off-screen behind the panel or below the fold`
    ).to.equal(true);
    expect(
        abovePanel,
        `the focused control ("${controlLabel}") must sit fully above the fixed summary panel, not overlapped by it (WCAG 2.4.11)`
    ).to.equal(true);
    expect(
        clearOfTopChrome,
        `the focused control ("${controlLabel}") must clear any fixed/sticky header - the lift must not park it behind the header (WCAG 2.4.11)`
    ).to.equal(true);
    expect(
        pointerHitsControl,
        `a pointer at the control centre ("${controlLabel}") must hit the control, not the overlapping panel (pointer usability)`
    ).to.equal(true);
})
    .config({ retries: 0 })
    .tag('@wcag-2.4.11');

Scenario('Focusing a fixed overlay outside the cart does not scroll the cart behind the panel', async () => {
    await setUpMultiItemCart();
    I.resizeWindow(ZOOM_PROXY_VIEWPORT.width, ZOOM_PROXY_VIEWPORT.height);

    const {
        panelPresent,
        panelInsideCart,
        overlayInsideCart,
        overlayOverlapsPanel,
        overlayFocused,
        hadOverflow,
        scrollBefore,
        scrollAfter,
    } = await cartPage.focusOverlappingRootOverlayAndMeasureScroll();

    expect(panelPresent, 'the fixed mobile summary panel should render at the zoom proxy').to.equal(true);
    expect(panelInsideCart, "the panel should live inside the cart's scrolling container").to.equal(true);
    expect(
        overlayInsideCart,
        'the injected root-level overlay should render outside the cart container, standing in for a fixed/portaled overlay (consent banner, a dialog/menu React portals to document.body)'
    ).to.equal(false);
    expect(
        overlayOverlapsPanel,
        "the overlay must overlap the panel's top edge, so the pre-fix unscoped handler would have scrolled the cart to try to clear it"
    ).to.equal(true);
    expect(overlayFocused, 'the overlay control should be focusable').to.equal(true);
    expect(
        hadOverflow,
        'the cart must be scrollable at the zoom proxy so a spurious focus-clearance lift would actually move the page'
    ).to.equal(true);
    // The core assertion: focusing a control in an overlay rendered outside the cart leaves the
    // cart scroll position untouched, because the focus-clearance lift is scoped to controls inside
    // sf-cart-container. Before the scoping fix this focusin scrolled the background cart even
    // though the overlay is pinned to the viewport, so scrolling never clears the overlap.
    expect(
        scrollAfter,
        `focusing a fixed overlay outside the cart must not scroll the cart (scrolled from ${scrollBefore} to ${scrollAfter})`
    ).to.equal(scrollBefore);
})
    .config({ retries: 0 })
    .tag('@wcag-2.4.11');
