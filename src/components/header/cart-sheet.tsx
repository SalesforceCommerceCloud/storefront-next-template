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
    type PropsWithChildren,
    type ReactElement,
    useEffect,
    useLayoutEffect,
    useMemo,
    useCallback,
    useRef,
    useState,
    memo,
} from 'react';
import { useFetcher, useLocation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { Link } from '@/components/link';
import { useBasketUpdater } from '@/providers/basket';
import { setMiniCartOpen, useMiniCartStore } from '@/hooks/mini-cart-store';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import MiniCartItem from '@/components/cart/mini-cart-item';
import SelectBonusProductsCard from '@/components/cart/select-bonus-products-card';
import { formatCurrency } from '@/lib/currency';
import { useMiniCartData, type BasketItemWithProduct } from '@/hooks/use-mini-cart-data';
import { buildBonusPromotionMap, getAttachedBonusPromotions } from '@/lib/cart/bonus-product-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { getStoreIdForBasketItem } from '@/extensions/bopis/lib/basket-utils';
import { useToast } from '@/components/toast';
import type { action as cartItemRemoveAction } from '@/routes/action.cart-item-remove';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { useTranslation } from 'react-i18next';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { UITarget } from '@/targets/ui-target';
import { routes } from '@/route-paths';
/**
 * Container component for MiniCartItem that handles remove functionality
 * Uses useFetcher to submit remove requests to the cart API
 */
const MiniCartItemContainer = memo(function MiniCartItemContainer({
    item,
    removeAction,
    bonusProductSlot,
    onRemoveStart,
    onRemoveEnd,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    isPickup,
}: {
    item: BasketItemWithProduct;
    removeAction: string;
    bonusProductSlot?: ReactElement;
    onRemoveStart?: (itemId: string) => void;
    onRemoveEnd?: (itemId: string, success: boolean) => void;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    isPickup?: boolean;
}) {
    const fetcher = useFetcher<typeof cartItemRemoveAction>();
    const { addToast } = useToast();
    const { t } = useTranslation('removeItem');
    const updateBasket = useBasketUpdater();
    const processedDataRef = useRef<BasketActionResponse | null>(null);
    const pendingRemovalItemIdRef = useRef<string | null>(null);

    const handleRemove = useCallback(() => {
        // Move focus before optimistic hide so focus is never trapped in hidden content.
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        const removalItemId = item.itemId;
        if (removalItemId) {
            pendingRemovalItemIdRef.current = removalItemId;
            onRemoveStart?.(removalItemId);
        }
        const formData = new FormData();
        formData.append('itemId', item.itemId || '');
        void fetcher.submit(formData, {
            method: 'POST',
            action: removeAction,
        });
    }, [item.itemId, removeAction, fetcher, onRemoveStart]);

    // Show toast notification when item is removed
    useEffect(() => {
        if (fetcher.state === 'idle' && pendingRemovalItemIdRef.current) {
            onRemoveEnd?.(pendingRemovalItemIdRef.current, fetcher.data?.success === true);
            pendingRemovalItemIdRef.current = null;
        }

        if (fetcher.state === 'idle' && fetcher.data && fetcher.data !== processedDataRef.current) {
            processedDataRef.current = fetcher.data;
            if (fetcher.data.success) {
                if (fetcher.data.basket) {
                    // Publish the new revision so useBasket() consumers stay in sync. This response is
                    // down-shaped (mutations can't send `expand=approaching_discounts`); the expanded
                    // re-fetch supplies `approachingDiscounts` via the provider tie-break (see basket.tsx).
                    updateBasket(fetcher.data.basket);
                }
                addToast(t('success'), 'success');
            } else {
                addToast(t('failed'), 'error');
            }
        }
    }, [fetcher.state, fetcher.data, t, addToast, updateBasket, onRemoveEnd]);

    return (
        <MiniCartItem
            product={item}
            onRemove={handleRemove}
            bonusProductSlot={bonusProductSlot}
            // @sfdc-extension-line SFDC_EXT_BOPIS
            isPickup={isPickup}
        />
    );
});

const CartSheetPanel = function CartSheetPanel({ onClose }: { onClose: () => void }): ReactElement {
    const { t, i18n } = useTranslation('header');
    const { t: tMiniCart } = useTranslation('miniCart');
    const config = useConfig();
    const navigate = useNavigate();
    const { currency } = useSite();
    const titleId = 'mini-cart-title';
    const [pendingRemoveItemIds, setPendingRemoveItemIds] = useState<Set<string>>(new Set());
    const [optimisticallyRemovedItemIds, setOptimisticallyRemovedItemIds] = useState<Set<string>>(new Set());

    // Fetch the basket together with full product details (images, variations, promotions) for its items.
    // Intentionally NOT reading basket from useBasket() (BasketContext) — the cart sheet needs basket and productsById
    // from the SAME SCAPI call, which the consolidated /resource/basket-products loader provides in one round-trip.
    // See use-mini-cart-data.ts header for the full rationale.
    const { basket, productItems: enrichedProductItems, productsById, isLoading } = useMiniCartData();

    // Build bonus promotion map with remaining capacity
    const promotionMap = useMemo(() => {
        if (!basket) {
            return new Map();
        }
        return buildBonusPromotionMap(basket);
    }, [basket]);

    // Get attached bonus promotions for cart items based on priceAdjustments
    const attachedPromotions = useMemo(() => {
        if (!basket) {
            return new Map();
        }
        return getAttachedBonusPromotions(basket, productsById, promotionMap);
    }, [basket, productsById, promotionMap]);

    /**
     * Handle bonus product selection button click
     * Navigates to the full cart page
     */
    const handleSelectBonusProducts = useCallback(() => {
        void navigate(routes.cart);
    }, [navigate]);

    const handleRemoveStart = useCallback((itemId: string) => {
        setOptimisticallyRemovedItemIds((prev) => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
        });
        setPendingRemoveItemIds((prev) => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
        });
    }, []);

    const handleRemoveEnd = useCallback((itemId: string, _success: boolean) => {
        // On success, basket sync keeps the item removed; on failure this restores it.
        setOptimisticallyRemovedItemIds((prev) => {
            if (!prev.has(itemId)) return prev;
            const next = new Set(prev);
            next.delete(itemId);
            return next;
        });

        setPendingRemoveItemIds((prev) => {
            if (!prev.has(itemId)) return prev;
            const next = new Set(prev);
            next.delete(itemId);
            return next;
        });
    }, []);

    const isCartUpdating = pendingRemoveItemIds.size > 0;
    const orderedProductItems = useMemo(() => [...enrichedProductItems].reverse(), [enrichedProductItems]);
    const visibleProductItemIds = useMemo(
        () =>
            new Set(
                orderedProductItems
                    .filter((item) => !optimisticallyRemovedItemIds.has(item.itemId || ''))
                    .map((item) => item.itemId)
            ),
        [orderedProductItems, optimisticallyRemovedItemIds]
    );

    // Use the same count as the cart badge icon - number of unique products, not total quantity
    const totalItems = visibleProductItemIds.size;

    return (
        <SheetContent
            className="mini-cart-flyout w-full sm:max-w-lg flex flex-col p-0"
            data-testid="mini-cart-flyout"
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                if (typeof document !== 'undefined') {
                    const titleElement = document.getElementById(titleId);
                    titleElement?.focus();
                }
            }}>
            <SheetClose className="ring-offset-background focus:ring-ring rounded-ui opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none absolute top-4 right-4">
                <XIcon className="size-6" strokeWidth={1.5} />
                <span className="sr-only">{tMiniCart('closeAriaLabel')}</span>
            </SheetClose>
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4 space-y-0">
                <SheetTitle
                    id={titleId}
                    tabIndex={-1}
                    className="text-3xl font-bold leading-10 tracking-[-0.75px] font-sans text-card-foreground focus:outline-none">
                    {t('cartTitle')}
                    {totalItems > 0 && ` (${totalItems})`}
                </SheetTitle>
            </SheetHeader>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {!basket && isLoading ? (
                    <div className="flex items-center justify-center py-8 px-6">
                        <p className="text-sm text-muted-foreground">{tMiniCart('loading')}</p>
                    </div>
                ) : basket && basket.productItems && basket.productItems.length > 0 ? (
                    <>
                        {/* Top Divider */}
                        <Separator className="bg-muted-foreground/10" />

                        <div className="px-6 [&:not(:empty)]:pt-4 [&:not(:empty)]:border-b [&:not(:empty)]:border-muted-foreground/10">
                            <UITarget targetId="sfcc.miniCart.promotions.approachingDiscounts" />
                        </div>

                        {/* Cart Items */}
                        {isLoading && enrichedProductItems.length === 0 ? (
                            <div className="flex items-center justify-center py-8 px-6">
                                <p className="text-sm text-muted-foreground">{tMiniCart('loading')}</p>
                            </div>
                        ) : (
                            <div className="py-4 px-6">
                                {visibleProductItemIds.size === 0 && isCartUpdating && (
                                    <div className="flex items-center justify-center py-4">
                                        <p className="text-sm text-muted-foreground">{tMiniCart('loading')}</p>
                                    </div>
                                )}
                                {orderedProductItems.map((item) => {
                                    // Check if this item has an attached bonus card
                                    const bonusPromo = item.itemId ? attachedPromotions.get(item.itemId) : undefined;
                                    const isOptimisticallyHidden = optimisticallyRemovedItemIds.has(item.itemId || '');

                                    const bonusProductCard = bonusPromo ? (
                                        <SelectBonusProductsCard
                                            promotion={bonusPromo}
                                            onSelectClick={handleSelectBonusProducts}
                                        />
                                    ) : undefined;

                                    return (
                                        <div
                                            key={item.itemId}
                                            className={`mb-4 last:mb-0 ${isOptimisticallyHidden ? 'hidden' : ''}`}
                                            hidden={isOptimisticallyHidden}>
                                            <MiniCartItemContainer
                                                item={item}
                                                removeAction={config.pages.cart.removeAction}
                                                bonusProductSlot={bonusProductCard}
                                                onRemoveStart={handleRemoveStart}
                                                onRemoveEnd={handleRemoveEnd}
                                                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                                                // getStoreIdForBasketItem returns truthy if the item is in a pickup shipment
                                                // and falsy (undefined) if it is in a delivery shipment
                                                isPickup={Boolean(getStoreIdForBasketItem(basket, item.itemId))}
                                                // @sfdc-extension-block-end SFDC_EXT_BOPIS
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Bottom Divider */}
                        <Separator className="bg-muted-foreground/10" />
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                        <p className="text-sm text-muted-foreground">{tMiniCart('emptyCart')}</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            {basket && basket.productItems && basket.productItems.length > 0 && (
                <SheetFooter className="px-6 py-6 border-t flex-col gap-3 sm:flex-col">
                    {isCartUpdating && <p className="text-xs text-muted-foreground">{tMiniCart('loading')}</p>}
                    <Button
                        asChild
                        className="flex self-stretch w-full h-10 px-8 py-2 justify-center items-center gap-2 bg-primary text-sm font-semibold leading-5 text-primary-foreground font-sans shadow-2xs"
                        size="lg">
                        <Link
                            to={routes.checkout}
                            aria-disabled={isCartUpdating}
                            className={isCartUpdating ? 'pointer-events-none opacity-60' : undefined}
                            onClick={(e) => {
                                if (isCartUpdating) {
                                    e.preventDefault();
                                    return;
                                }
                                onClose();
                            }}>
                            {t('checkout')}{' '}
                            {basket?.orderTotal
                                ? formatCurrency(basket.orderTotal, i18n.language, currency)
                                : basket?.productTotal
                                  ? formatCurrency(basket.productTotal, i18n.language, currency)
                                  : ''}
                        </Link>
                    </Button>
                    <UITarget targetId="sfcc.miniCart.payments.expressCheckout" />
                    <UITarget targetId="sfcc.miniCart.bnpl.message" />
                    <Button
                        variant="secondary"
                        className="flex self-stretch w-full h-10 px-8 py-2 justify-center items-center gap-2 border border-input bg-secondary text-secondary-foreground text-sm font-semibold leading-5 font-sans shadow-2xs"
                        size="lg"
                        onClick={onClose}>
                        {t('continueShopping')}
                    </Button>
                    {config.pages.cart.miniCart?.enableViewCartButton && (
                        <Button
                            asChild
                            variant="ghost"
                            className="flex self-stretch w-full h-10 px-8 py-2 justify-center items-center gap-2 text-sm font-semibold leading-5 text-foreground"
                            size="lg">
                            <Link to={routes.cart} onClick={onClose}>
                                {tMiniCart('viewCart')}
                            </Link>
                        </Button>
                    )}
                </SheetFooter>
            )}
        </SheetContent>
    );
};

/**
 * CartSheet (Mini Cart Flyout) - A slide-out panel displaying the shopping cart contents
 *
 * This component renders as a Sheet (slide-out drawer) from the right side of the screen
 * when the user clicks on the cart icon in the header. It provides a quick view of cart
 * contents without navigating away from the current page.
 *
 * Features:
 * - Displays all items currently in the shopping cart with images, prices, and variations
 * - Allows quantity updates and item removal directly from the flyout
 * - Shows order total with checkout button
 * - "Continue Shopping" button to close the flyout
 * - Lazy-loaded for performance (loaded on first cart icon click)
 * - Automatically opens when mounted (used with lazy loading)
 * - Displays bonus product selection cards below qualifying products
 *
 * @param props - Component props
 * @param props.children - The trigger element (typically the cart badge/icon button)
 * @returns A Sheet component wrapping the mini cart UI
 *
 * @example
 * ```tsx
 * <CartSheet>
 *   <Button variant="ghost">
 *     <CartIcon />
 *   </Button>
 * </CartSheet>
 * ```
 */
export default function CartSheet({ children }: PropsWithChildren): ReactElement {
    const miniCartOpen = useMiniCartStore((s) => s.open);
    const { pathname } = useLocation();
    const prevPathnameRef = useRef(pathname);

    // Close the mini cart when the user navigates to a different page.
    // useLayoutEffect fires synchronously before child useEffects, preventing
    // CartSheetPanel's fetcher hooks from dispatching redundant requests.
    useLayoutEffect(() => {
        if (prevPathnameRef.current !== pathname) {
            prevPathnameRef.current = pathname;
            setMiniCartOpen(false);
        }
    }, [pathname]);

    return (
        <Sheet open={miniCartOpen} onOpenChange={setMiniCartOpen}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            {miniCartOpen && <CartSheetPanel onClose={() => setMiniCartOpen(false)} />}
        </Sheet>
    );
}
