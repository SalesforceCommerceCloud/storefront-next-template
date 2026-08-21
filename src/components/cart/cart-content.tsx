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
import {
    useState,
    useCallback,
    useLayoutEffect,
    useMemo,
    lazy,
    Suspense,
    type ReactElement,
    type ReactNode,
} from 'react';

// Commerce SDK
import type { ShopperBasketsV2, ShopperProducts, ShopperPromotions, ShopperSearch } from '@/scapi';

// Components
import ProductItemsList from '@/components/product-items-list';
import { RemoveItemButtonWithConfirmation } from '@/components/buttons/remove-item-button-with-confirmation';
import { CartItemEditButton } from '@/components/cart/cart-item-edit-button';
import CartEmpty from './cart-empty';
import CartTitle from './cart-title';
import OrderSummary from '@/components/order-summary';
import { OrderSummaryMobileAccordion } from '@/components/order-summary/mobile-heading';
import { Link } from '@/components/link';
import { getOrCreateCheckoutCorrelationId } from '@/lib/checkout/correlation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Typography } from '@/components/typography';
import { useTranslation } from 'react-i18next';
import { useBasketUpdater } from '@/providers/basket';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import CartPickup from '@/extensions/bopis/components/cart-pickup';
import { getFirstPickupStore, filterPickupProductItems } from '@/extensions/bopis/lib/basket-utils';
import { usePickup } from '@/extensions/bopis/context/pickup-context';
import CartDeliveryOption from '@/extensions/bopis/components/delivery-options/cart-delivery-option';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { UITarget } from '@/targets/ui-target';

// utils
import {
    isStandardProduct,
    isBonusProduct,
    isRuleBasedPromotion,
    type EnrichedProductItem,
} from '@/lib/product/product-utils';
import { useCartInventoryValidation } from '@/lib/cart/inventory-validation';
import { getBonusDiscountSlotsForPromotion, getPromotionCalloutTextFromProduct } from '@/lib/cart/bonus-product-utils';
import { CartInventoryErrorBanner } from './cart-inventory-error-banner';
import { routes } from '@/route-paths';

const LazyBonusProductSelection = lazy(() => import('@/components/cart/bonus-product-selection'));
const LazyBonusProductModal = lazy(() =>
    import('@/components/bonus-product-modal').then((m) => ({ default: m.BonusProductModal }))
);
const LazyCartItemAddToWishlistButton = lazy(() =>
    import('@/components/cart/cart-item-add-to-wishlist-button').then((m) => ({
        default: m.CartItemAddToWishlistButton,
    }))
);

/**
 * Props for the CartContent component
 *
 * @interface CartContentProps
 * @property {ShopperBasketsV2.schemas['Basket'] | undefined} basket - The basket data from the loader
 * @property {Record<string, ShopperProducts.schemas['Product']>} [productsByItemId] - Item ID to product mapping
 * @property {Record<string, ShopperPromotions.schemas['Promotion']>} [promotions] - Promotion ID to promotion mapping
 * @property {string[]} [wishlistProductIds] - Product IDs in the shopper wishlist (from cart loader) for line-level wishlist state after refresh
 * @property {ReactNode} [recommendationsSlot] - Below-the-fold recommendations region; the route owns recommender selection, i18n, and promise pinning
 */
interface CartContentProps {
    basket: ShopperBasketsV2.schemas['Basket'] | undefined;
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>;
    bonusProductsById: Record<string, ShopperProducts.schemas['Product']>;
    promotions?: Record<string, ShopperPromotions.schemas['Promotion']>;
    wishlistProductIds?: readonly string[];
    recommendationsSlot?: ReactNode;
    ruleBasedBonusProductsPromise: Promise<Record<string, ShopperSearch.schemas['ProductSearchHit'][]>>;
}

/**
 * CartContent component that displays the shopping cart with items or empty state
 *
 * Features:
 * - Conditional rendering: Empty cart state when no items, full cart when items exist
 * - Responsive layout: Desktop grid (66% items, 33% summary) with mobile CTA section
 * - Component composition: Orchestrates CartTitle, ProductItemsList
 * - Data integration: Accepts basket, product mappings, and promotion mappings
 * - Mobile optimization: Separate mobile checkout section for better UX
 * - Accessibility: Proper semantic structure with test identifiers
 *
 * @param props - Component props
 * @returns JSX element representing the cart content
 */
export default function CartContent({
    basket,
    productsByItemId,
    bonusProductsById,
    promotions,
    wishlistProductIds = [],
    recommendationsSlot,
    ruleBasedBonusProductsPromise,
}: CartContentProps): ReactElement {
    const { t } = useTranslation('cart');

    // Calculate total item count for page heading
    const totalItems = basket?.productItems?.reduce((acc, item) => acc + (item.quantity ?? 0), 0) || 0;
    const pageHeading = t('itemCount', { count: totalItems });

    // TEMPORARY: State to facilitate bonus product modal development
    const [bonusModalOpen, setBonusModalOpen] = useState(false);
    const [selectedBonusProduct, setSelectedBonusProduct] = useState<{
        productId: string;
        productName: string;
        promotionId: string;
        bonusDiscountLineItemId: string;
        maxBonusItems: number;
    } | null>(null);

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const pickup = usePickup();
    const store = getFirstPickupStore(basket, pickup?.pickupStores);
    const pickupItems = filterPickupProductItems(basket);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Validate cart-wide inventory for checkout button state
    const inventoryValidation = useCartInventoryValidation(basket, productsByItemId);

    // Per-BLI slot rows for the currently-selected promotion. Gated on `selectedBonusProduct` so the basket walk
    // only runs after the user opens the modal — the modal is null for the overwhelming majority of cart sessions.
    const bonusDiscountSlots = useMemo(
        () => (selectedBonusProduct ? getBonusDiscountSlotsForPromotion(basket, selectedBonusProduct.promotionId) : []),
        [basket, selectedBonusProduct]
    );

    // Sync cart page loader basket into basket context pre-paint, so descendants like CartDeliveryOption observe the
    // hydrated basket on the first painted frame.
    // Shape-safe: no basket read or mutation sets `expand`, so every response carries the SCAPI default and can't
    // down-shape provider consumers.
    const updateBasket = useBasketUpdater();
    useLayoutEffect(() => {
        if (basket?.basketId) {
            updateBasket(basket);
        }
    }, [basket, updateBasket]);

    // The mobile order-summary panel below is `position: fixed`, so it can grow (e.g. when its
    // accordion expands) and visually cover cart line items beneath it at narrow widths (WCAG
    // 1.4.10 reflow, 2.4.11 focus obscured). Three cooperating mechanisms keep an underlying cart
    // control reachable:
    //   - The panel itself is height-capped (`max-h-[calc(100dvh-4rem)]`) and scrolls internally
    //     (`overflow-y-auto overscroll-contain`), so however far its accordion expands it can never
    //     fill the whole viewport at 400% zoom — at least a 4rem band always stays above it.
    //   - `--cart-mobile-summary-spacer`, the panel's live (capped) height, is consumed as real
    //     bottom padding on the scrollable content below (see `sf-cart-container`), so there is
    //     always genuine layout space to scroll content out from under the panel. This is what
    //     prevents overlap for pointer/zoom users; scroll-padding alone only affects focus-scroll
    //     targeting, not layout.
    //   - `scroll-padding-bottom` (same technique this codebase already uses for the sticky header
    //     via `scroll-padding-top`) plus a `focusin` handler (see below) keep keyboard focus clear
    //     of the panel. scroll-padding is only a targeting hint — the browser skips it entirely for
    //     a control it deems already visible in the raw viewport — so the handler is what actually
    //     guarantees a focused control is lifted fully above the panel.
    //
    // The spacer + focusin wiring is driven by a ref callback (not a mount-once effect) so its
    // lifecycle follows the panel DOM node: the panel is only rendered for a non-empty cart, so if
    // the cart starts empty and later fills (e.g. revalidation after an add), the callback runs when
    // the node mounts and wires everything then. A `[]`-dependency effect would have bailed on the
    // first empty render and never re-run. On detach we restore the root's prior inline values
    // instead of clearing them, so we never stomp a `scroll-padding-bottom` another owner set on the
    // shared <html> element.
    const syncMobileSummarySpacer = useCallback((panel: HTMLDivElement | null) => {
        if (!panel) {
            return;
        }
        const root = document.documentElement;
        const priorScrollPaddingBottom = root.style.scrollPaddingBottom;
        const priorSpacer = root.style.getPropertyValue('--cart-mobile-summary-spacer');
        const syncPanelHeight = () => {
            const height = `${panel.offsetHeight}px`;
            root.style.scrollPaddingBottom = height;
            root.style.setProperty('--cart-mobile-summary-spacer', height);
        };
        syncPanelHeight();
        const observer = new ResizeObserver(syncPanelHeight);
        observer.observe(panel);

        // The fixed panel obscures only the cart's own scrolling content, so focus corrections are
        // scoped to that region — the scrollable cart container the panel is nested inside. The
        // listener is attached to `document` (focus can land anywhere), but other fixed or portaled
        // UI at these narrow widths also reports focus here: the fixed tracking-consent dialog and
        // dialogs/menus React portals to `document.body`. Their bottom edge can overlap the panel
        // too, but they are pinned to the viewport — scrolling the page would move the cart behind
        // them while they stayed put, never clearing the (unrelated) overlap. Restricting the lift
        // to controls inside `sf-cart-container` ignores every out-of-cart overlay.
        const cartContent = panel.closest('[data-testid="sf-cart-container"]');

        // Bottom edge of any header pinned across the top of the viewport, so the lift below never
        // parks a control behind it. A control shoved up behind the header is as obscured as one left
        // behind the panel (WCAG 2.4.11). Verticals differ here: the canonical header goes `static` at
        // the short heights 400% zoom produces (dropping out of the way), while the cosmetic header
        // stays `fixed`/`sticky` at the top — so this measures the live header rather than assuming a
        // vertical. Returns 0 when no header is pinned (e.g. canonical at short height), making the
        // clamp a no-op there.
        const topChromeBottom = () => {
            let bottom = 0;
            for (const header of document.querySelectorAll('header')) {
                const position = getComputedStyle(header).position;
                if (position !== 'fixed' && position !== 'sticky') {
                    continue;
                }
                const rect = header.getBoundingClientRect();
                if (rect.top <= 0 && rect.bottom > bottom) {
                    bottom = rect.bottom;
                }
            }
            return bottom;
        };

        // Native focus scrolling (even with the scroll-padding-bottom above) does not reliably lift
        // a focused control clear of the fixed panel: the browser treats a control as "visible" when
        // it is anywhere inside the raw viewport, so one whose lower edge sits behind the panel is
        // left partially obscured (WCAG 2.4.11). When focus lands on a cart control below the panel's
        // top edge, nudge the page up just enough that the control sits fully above the panel with a
        // small buffer. No-ops when the panel isn't displayed (md+ desktop, `offsetHeight === 0`),
        // when the focused control is inside the panel itself (its own trigger/checkout controls), or
        // when it is outside the cart content (a fixed/portaled overlay — see above).
        const FOCUS_CLEARANCE_BUFFER_PX = 8;
        const keepFocusClearOfPanel = (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || panel.offsetHeight === 0 || panel.contains(target)) {
                return;
            }
            if (!cartContent || !cartContent.contains(target)) {
                return;
            }
            const targetRect = target.getBoundingClientRect();
            const overlap = targetRect.bottom - panel.getBoundingClientRect().top;
            if (overlap <= 0) {
                return;
            }
            // Cap the lift at the header's bottom edge: never scroll the control's top above a pinned
            // header. When the band between the header and the panel is shorter than the control, lift
            // only as far as the header allows — the control's top then rests just below the header,
            // keeping it partially visible (2.4.11 asks that it be not *entirely* hidden) rather than
            // pushing it out of sight behind the header.
            const maxLift = Math.max(0, targetRect.top - topChromeBottom());
            const lift = Math.min(overlap + FOCUS_CLEARANCE_BUFFER_PX, maxLift);
            if (lift > 0) {
                window.scrollBy({ top: lift });
            }
        };
        document.addEventListener('focusin', keepFocusClearOfPanel);

        return () => {
            observer.disconnect();
            document.removeEventListener('focusin', keepFocusClearOfPanel);
            if (priorScrollPaddingBottom) {
                root.style.scrollPaddingBottom = priorScrollPaddingBottom;
            } else {
                root.style.removeProperty('scroll-padding-bottom');
            }
            if (priorSpacer) {
                root.style.setProperty('--cart-mobile-summary-spacer', priorSpacer);
            } else {
                root.style.removeProperty('--cart-mobile-summary-spacer');
            }
        };
    }, []);

    // Check if cart is empty using the basket prop from loader data
    if (!basket?.productItems?.length) {
        return <CartEmpty />;
    }

    let deliveryItems = basket?.productItems || [];

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // Only filter pickup items from delivery if we have a store to render them in the pickup section
    // If no store exists, render all items as delivery items
    const pickupShipmentId = new Set(basket?.shipments?.filter((s) => s.c_fromStoreId).map((s) => s.shipmentId));
    deliveryItems = store
        ? basket.productItems.filter((item) => item.shipmentId && !pickupShipmentId.has(item.shipmentId))
        : deliveryItems;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // TEMPORARY: Logic to facilitate bonus product modal - extract bonus product data
    const bonusDiscountItems = basket?.bonusDiscountLineItems || [];

    // TEMPORARY: Handler to facilitate bonus product modal - open modal with selected product
    const handleBonusProductSelect = (
        productId: string,
        productName: string,
        promotionId: string,
        bonusDiscountLineItemId: string,
        maxBonusItems: number
    ) => {
        setSelectedBonusProduct({ productId, productName, promotionId, bonusDiscountLineItemId, maxBonusItems });
        setBonusModalOpen(true);
    };

    // Render prop function for cart-specific secondary actions
    const cartSecondaryActions = (product: EnrichedProductItem) => {
        // Return undefined if no itemId - this will hide the buttons in the UI
        if (!product.itemId) {
            return undefined;
        }

        const isBonusProd = isBonusProduct(product);
        const isStandardProd = isStandardProduct(product);
        const shouldShowEditButton = !isStandardProd && !isBonusProd;
        const shouldShowWishlist = !isBonusProd;

        return (
            <div className="flex gap-2">
                <RemoveItemButtonWithConfirmation itemId={product.itemId} className="pl-0" />
                {shouldShowEditButton && <CartItemEditButton product={product} className="pl-0" />}
                {shouldShowWishlist && (
                    <Suspense fallback={null}>
                        <LazyCartItemAddToWishlistButton
                            product={product}
                            wishlistProductIds={wishlistProductIds}
                            className="pl-0"
                        />
                    </Suspense>
                )}
            </div>
        );
    };

    /**
     * Gift checkbox rendered at the end of each cart line-item's right column (layout only).
     * Not persisted: no SCAPI / basket update is wired yet.
     * Wire to updateItemInBasket (or equivalent) when line-level gift is supported — see e2e/specs/checkout/gift-message.spec.md.
     * "Learn more" is a non-navigating control until a destination (e.g. modal or policy page) is defined.
     */
    function CartLineItemGift(product: EnrichedProductItem): ReactElement | undefined {
        if (!product.itemId || isBonusProduct(product)) {
            return undefined;
        }
        const fieldId = `cart-gift-${product.itemId}`;
        return (
            <div className="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 md:justify-end">
                <Checkbox id={fieldId} />
                <div className="flex flex-wrap items-center gap-1">
                    <Label
                        htmlFor={fieldId}
                        className="text-sm font-normal leading-none text-foreground cursor-pointer">
                        {t('lineItem.giftLabel')}
                    </Label>
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-sm font-normal leading-none text-foreground cursor-pointer shrink-0 p-0 h-auto">
                        {t('lineItem.giftLearnMore')}
                    </Button>
                </div>
            </div>
        );
    }

    // Per-line pickup vs delivery (BOPIS). Defined only inside the extension block so a
    // storefront that strips SFDC_EXT_BOPIS does not reference CartDeliveryOption after its import is removed.
    let cartDeliveryActions: ((product: EnrichedProductItem) => ReactElement) | undefined = undefined;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    cartDeliveryActions = (product: EnrichedProductItem) => (
        <CartDeliveryOption key={product.itemId || product.productId} product={product} />
    );
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    return (
        <div
            className="flex-1 min-h-screen bg-background mb-10 md:mb-10 pb-[var(--cart-mobile-summary-spacer,8rem)] md:pb-0"
            data-testid="sf-cart-container">
            <div className="section-container">
                <Typography variant="h1" as="h1" className="mb-6">
                    {pageHeading}
                </Typography>

                {/* Mobile Order Summary - visible only on mobile */}
                <div className="md:hidden mb-3">
                    <div
                        ref={syncMobileSummarySpacer}
                        data-testid="sf-cart-mobile-summary-panel"
                        className="bg-background border-t border-border fixed bottom-0 left-0 right-0 z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain">
                        <OrderSummaryMobileAccordion
                            basket={basket}
                            defaultExpanded={false}
                            contentClassName="max-h-[40vh] overflow-y-auto">
                            <OrderSummary
                                basket={basket}
                                showCartItems={false}
                                showHeading={false}
                                isEstimate={true}
                                productsByItemId={productsByItemId}
                                showPromoCodeForm={true}
                                showCheckoutAction={false}
                                className="border-none !py-0 [--cart-summary-px:1rem]"
                            />
                        </OrderSummaryMobileAccordion>
                        <div className="px-[var(--cart-summary-px)] py-4">
                            {/* Inventory error banner */}
                            <CartInventoryErrorBanner
                                issues={inventoryValidation.itemsExceedingInventory}
                                className="mb-3"
                                id="cart-inventory-error-mobile"
                            />
                            <Button
                                asChild={!inventoryValidation.hasInventoryIssues}
                                className="w-full text-sm"
                                disabled={inventoryValidation.hasInventoryIssues}
                                aria-disabled={inventoryValidation.hasInventoryIssues}
                                aria-describedby={
                                    inventoryValidation.hasInventoryIssues ? 'cart-inventory-error-mobile' : undefined
                                }>
                                {inventoryValidation.hasInventoryIssues ? (
                                    <span>{t('checkout.continueToCheckout')}</span>
                                ) : (
                                    <Link to={routes.checkout} onClick={() => getOrCreateCheckoutCorrelationId()}>
                                        {t('checkout.continueToCheckout')}
                                    </Link>
                                )}
                            </Button>
                            <UITarget targetId="sfcc.cart.payments.expressCheckout" />
                        </div>
                    </div>
                    <UITarget targetId="sfcc.cart.bnpl.message" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[66%_1fr] lg:gap-11">
                    <div className="md:order-2 lg:order-1">
                        <UITarget targetId="sfcc.cart.promotions.approachingDiscounts" />
                        {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
                        {/* Group store info cards with their product items */}
                        {pickupItems.length > 0 && store && (
                            <div key={store.id} className="md:p-8 p-3 rounded-ui border border-border mb-3">
                                <CartPickup
                                    store={store}
                                    pickupCount={pickupItems.length}
                                    totalCount={basket?.productItems?.length ?? 0}
                                />
                                <div className="mt-4">
                                    <ProductItemsList
                                        promotions={promotions}
                                        productItems={pickupItems}
                                        productsByItemId={productsByItemId}
                                        bonusDiscountLineItems={bonusDiscountItems}
                                        secondaryActions={cartSecondaryActions}
                                        deliveryActions={cartDeliveryActions}
                                        lineItemExtra={CartLineItemGift}
                                        isPickup={true}
                                    />
                                </div>
                            </div>
                        )}
                        {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}
                        {/* Show delivery items if any exist */}
                        {deliveryItems.length > 0 && (
                            <div
                                data-slot="cart-delivery-group"
                                className="md:p-8 p-3 rounded-ui border border-muted-foreground/10 mb-3">
                                <CartTitle basket={basket} deliveryCount={deliveryItems.length} />
                                <ProductItemsList
                                    promotions={promotions}
                                    productItems={deliveryItems}
                                    productsByItemId={productsByItemId}
                                    bonusDiscountLineItems={bonusDiscountItems}
                                    secondaryActions={cartSecondaryActions}
                                    deliveryActions={cartDeliveryActions}
                                    lineItemExtra={CartLineItemGift}
                                />
                            </div>
                        )}
                    </div>
                    <div data-slot="order-summary" className="hidden md:block md:order-1 lg:order-2">
                        <UITarget targetId="sfcc.cart.orderSummary.before" />
                        <OrderSummary
                            basket={basket}
                            surface="cart"
                            showCartItems={false}
                            isEstimate={true}
                            productsByItemId={productsByItemId}
                            showPromoCodeForm={true}
                            showCheckoutAction={true}
                            inventoryValidation={inventoryValidation}
                        />
                        <UITarget targetId="sfcc.cart.bnpl.message" />
                    </div>
                </div>

                {/* Bonus Product Carousels - one per bonusDiscountLineItem (lazy chunks reduce cart script size) */}
                {bonusDiscountItems.map((bonusItem, index) => {
                    const isRuleBased = isRuleBasedPromotion(bonusItem);
                    if (!isRuleBased && (!bonusItem.bonusProducts || bonusItem.bonusProducts.length === 0)) {
                        return null;
                    }
                    const promotionId = bonusItem.promotionId;
                    const mappedPromotion = promotionId ? promotions?.[promotionId] : undefined;

                    // `name` only ever comes from the promotions map (the trigger product's productPromotions
                    // carry no name). Keep it distinct — never backfilled from callout or the id.
                    const name = mappedPromotion?.name;

                    // `calloutMsg` prefers the promotions map; pre-selection (and at max) the promo is absent
                    // from that map, so fall back to the trigger product's productPromotions callout. The
                    // trigger product is whichever cart product advertises this promotionId in its
                    // productPromotions[]. N is cart-line small, so a linear scan with early break is fine —
                    // don't "optimize" into a prebuilt map.
                    let calloutMsg = mappedPromotion?.calloutMsg ?? undefined;
                    if (!calloutMsg && promotionId) {
                        for (const candidate of Object.values(productsByItemId)) {
                            const callout = getPromotionCalloutTextFromProduct(candidate, promotionId);
                            if (callout) {
                                calloutMsg = callout;
                                break;
                            }
                        }
                    }

                    // Distinct fields for vertical consumers (cosmetic uses calloutMsg for the title; name is
                    // the BM/admin label). Canonical/fashion title shape is unchanged: callout preferred, then
                    // name — now also populated pre-selection instead of falling back to the generic title.
                    const promotion = name !== undefined || calloutMsg !== undefined ? { name, calloutMsg } : undefined;
                    const promotionName = calloutMsg || name;
                    return (
                        <div key={bonusItem.id || index} data-slot="bonus-products-rail" className="mt-6">
                            <Suspense fallback={null}>
                                <LazyBonusProductSelection
                                    bonusDiscountLineItem={bonusItem}
                                    bonusProductsById={bonusProductsById}
                                    basket={basket}
                                    promotionName={promotionName}
                                    promotion={promotion}
                                    ruleBasedBonusProductsPromise={
                                        isRuleBased ? ruleBasedBonusProductsPromise : undefined
                                    }
                                    onProductSelect={(productId, productName, requiresModal) => {
                                        if (requiresModal) {
                                            handleBonusProductSelect(
                                                productId,
                                                productName,
                                                bonusItem.promotionId || '',
                                                bonusItem.id || '',
                                                bonusItem.maxBonusItems || 0
                                            );
                                        }
                                    }}
                                />
                            </Suspense>
                        </div>
                    );
                })}

                {recommendationsSlot}

                {selectedBonusProduct && (
                    <Suspense fallback={null}>
                        <LazyBonusProductModal
                            open={bonusModalOpen}
                            onOpenChange={setBonusModalOpen}
                            productId={selectedBonusProduct.productId}
                            productName={selectedBonusProduct.productName}
                            promotionId={selectedBonusProduct.promotionId}
                            bonusDiscountLineItemId={selectedBonusProduct.bonusDiscountLineItemId}
                            bonusDiscountSlots={bonusDiscountSlots}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    );
}
