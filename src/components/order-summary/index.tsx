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
import { Fragment, type ReactElement } from 'react';

// Third-party
import { ShoppingCart } from 'lucide-react';
import { Link } from '@/components/link';

// Commerce SDK
import type { ShopperBasketsV2, ShopperOrders, ShopperProducts } from '@/scapi';
/** Basket or Order – OrderSummary displays totals for both (e.g. cart and order details). */
export type OrderSummaryBasket = ShopperBasketsV2.schemas['Basket'] | ShopperOrders.schemas['Order'];

// Components
import { Typography } from '@/components/typography';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import ProductItemsList from '@/components/product-items-list';
import PromoCodeForm from '@/components/promo-code-form';
import { VisaIcon, MastercardIcon, AmexIcon, DiscoverIcon } from '@/components/icons';

// Utils
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import { useTranslation } from 'react-i18next';
import PromoPopover from '@/components/promo-popover';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { UITarget } from '@/targets/ui-target';
import type { CartInventoryValidationResult } from '@/lib/cart/inventory-validation';
import { CartInventoryErrorBanner } from '@/components/cart/cart-inventory-error-banner';
import { routes } from '@/route-paths';

/**
 * Props for the OrderSummary component
 *
 * @interface OrderSummaryProps
 * @property {OrderSummaryBasket} basket - The basket or order containing items and totals (cart or order details)
 * @property {boolean} [showPromoCodeForm] - Whether to display the promo code form
 * @property {boolean} [showCartItems] - Whether to display the cart items accordion
 * @property {boolean} [showHeading] - Whether to display the "Order Summary" heading
 * @property {boolean} [itemsExpanded] - Whether the cart items accordion should be expanded by default
 * @property {boolean} [isEstimate] - Whether to show "Est." prefix for totals
 * @property {Record<string, ShopperProducts.schemas['Product']>} [productsByItemId] - Optional item ID to product
 *   details mapping
 * @property {() => void} [onEditCart] - Optional callback function called when the "Edit Cart" button is clicked.
 *   If not provided, the component will navigate to '/cart' using the default navigation behavior.
 *   This is useful for custom actions like closing a cart sheet before navigation.
 * @property {boolean} [showCheckoutAction] - Whether to display the checkout button and payment icons
 * @property {() => void} [onSelectBonusProducts] - Optional callback for selecting bonus products from summary list
 * @property {string} [className] - Additional className for the outermost Card wrapper
 *
 * Note : OrderSummary accepts both Basket and Order, make sure you pass other props accordingly.
 * Eg If you pass Order as basket, make sure you pass showPromoCodeForm, showCartItems as false etc.
 */
interface OrderSummaryProps {
    basket: OrderSummaryBasket;
    showPromoCodeForm?: boolean;
    showCartItems?: boolean;
    showHeading?: boolean;
    itemsExpanded?: boolean;
    isEstimate?: boolean;
    showTotal?: boolean;
    productsByItemId?: Record<string, ShopperProducts.schemas['Product']>;
    onEditCart?: () => void;
    showCheckoutAction?: boolean;
    onSelectBonusProducts?: () => void;
    className?: string;
    inventoryValidation?: CartInventoryValidationResult;
}

/**
 * Cart Items Summary component that displays cart items in a collapsible accordion
 *
 * This component renders:
 * - A collapsible accordion showing item count with shopping cart icon
 * - Product items list in summary variant
 * - Edit cart button for navigation
 *
 * @param props - Component props
 * @param {ShopperBasketsV2.schemas['Basket']} props.basket - The shopping basket containing product items
 * @param {Record<string, ShopperProducts.schemas['Product']>} [props.productsByItemId] - Optional item ID to product mapping
 * @param {boolean} [props.itemsExpanded] - Whether the accordion should be expanded by default
 * @param {() => void} [props.onEditCart] - Optional callback for "Edit Cart" button click. If not provided, navigates to '/cart'
 * @returns JSX element representing the cart items summary accordion
 */
function CartItemsSummary({
    basket,
    productsByItemId = {},
    itemsExpanded = false,
    onEditCart,
    onSelectBonusProducts,
}: {
    basket: ShopperBasketsV2.schemas['Basket'];
    productsByItemId?: Record<string, ShopperProducts.schemas['Product']>;
    itemsExpanded?: boolean;
    onEditCart?: () => void;
    onSelectBonusProducts?: () => void;
}): ReactElement {
    const { t } = useTranslation('cart');
    const totalItems = basket?.productItems?.reduce((acc, item) => acc + (item.quantity ?? 0), 0) || 0;

    const getItemCountText = (count: number): string => t('items.itemsInCart', { count });

    return (
        <Accordion type="single" collapsible className="w-full" defaultValue={itemsExpanded ? 'cart-items' : undefined}>
            <AccordionItem value="cart-items">
                <AccordionTrigger className="text-left">
                    <span className="flex-1 text-left text-sm text-primary">
                        <ShoppingCart className="inline mr-2 w-4 h-4" />
                        {getItemCountText(totalItems)}
                    </span>
                </AccordionTrigger>
                <AccordionContent className="px-0 py-4">
                    <div className="space-y-5">
                        {/* Cart summary sidebar */}
                        <ProductItemsList
                            productItems={basket.productItems}
                            productsByItemId={productsByItemId}
                            variant="summary"
                            basket={basket}
                            onSelectBonusProducts={onSelectBonusProducts}
                        />
                        {/* Edit Cart link: navigates to cart page with optional callback */}
                        <Link
                            to={routes.cart}
                            onClick={onEditCart}
                            className={buttonVariants({ variant: 'link', className: 'w-full justify-center' })}>
                            {t('items.editCart')}
                        </Link>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

interface SummaryBodyContentProps {
    basket: OrderSummaryBasket;
    showCartItems: boolean;
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>;
    itemsExpanded: boolean;
    onEditCart?: () => void;
    onSelectBonusProducts?: () => void;
    t: ReturnType<typeof useTranslation<'cart'>>['t'];
    i18nLanguage: string;
    currency: string;
    hasShippingPromos: boolean;
    shippingPromotionAdjustments: Array<{ priceAdjustmentId?: string; itemText?: string }>;
    renderShippingInfo: () => ReactElement;
    isEstimate: boolean;
    showTotal: boolean;
    showPromoCodeForm: boolean;
}

function SummaryBodyContent({
    basket,
    showCartItems,
    productsByItemId,
    itemsExpanded,
    onEditCart,
    onSelectBonusProducts,
    t,
    i18nLanguage,
    currency,
    hasShippingPromos,
    shippingPromotionAdjustments,
    renderShippingInfo,
    isEstimate,
    showTotal,
    showPromoCodeForm,
}: SummaryBodyContentProps): ReactElement {
    return (
        <>
            {/* Cart Items Accordion */}
            {showCartItems && (
                <CartItemsSummary
                    basket={basket as ShopperBasketsV2.schemas['Basket']}
                    productsByItemId={productsByItemId}
                    itemsExpanded={itemsExpanded}
                    onEditCart={onEditCart}
                    onSelectBonusProducts={onSelectBonusProducts}
                />
            )}

            {/* Order Summary Details */}
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center text-sm font-normal leading-5 text-muted-foreground pb-2">
                {/* Subtotal */}
                <UITarget targetId="sfcc.orderSummary.subtotal.before" />
                <UITarget targetId="sfcc.orderSummary.subtotal">
                    <dt>{t('summary.subtotal')}</dt>
                    <dd className="justify-self-end">
                        {formatCurrency(basket?.productSubTotal ?? 0, i18nLanguage, currency)}
                    </dd>
                </UITarget>
                <UITarget targetId="sfcc.orderSummary.subtotal.after" />
                <UITarget targetId="sfcc.orderSummary.giftCards.applied" />

                {/* Order Price Adjustments */}
                <UITarget targetId="sfcc.orderSummary.adjustments.before" />
                <UITarget targetId="sfcc.orderSummary.adjustments">
                    {[
                        ...(basket.orderPriceAdjustments ?? []),
                        ...(basket.productItems ?? []).flatMap((item) => item.priceAdjustments ?? []),
                    ].map((adjustment) => (
                        <Fragment key={adjustment.priceAdjustmentId}>
                            <dt
                                data-slot="badge"
                                className="inline-flex w-fit max-w-full border-0 bg-muted px-2 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground whitespace-normal break-words rounded-ui">
                                {adjustment.itemText}
                            </dt>
                            <dd className="text-sm font-normal leading-5 text-muted-foreground text-right">
                                {formatCurrency(adjustment.price ?? 0, i18nLanguage, currency)}
                            </dd>
                        </Fragment>
                    ))}
                </UITarget>
                <UITarget targetId="sfcc.orderSummary.adjustments.after" />

                {/* Shipping */}
                <UITarget targetId="sfcc.orderSummary.shipping.before" />
                <UITarget targetId="sfcc.orderSummary.shipping">
                    <dt className="flex items-center">
                        <span>
                            {t('summary.shipping')}
                            {hasShippingPromos && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                    {t('summary.shippingPromotionApplied')}
                                </span>
                            )}
                        </span>
                        {hasShippingPromos && (
                            <PromoPopover className="ml-1">
                                {shippingPromotionAdjustments.map((adjustment) => (
                                    <div key={adjustment.priceAdjustmentId} className="text-xs">
                                        {adjustment.itemText}
                                    </div>
                                ))}
                            </PromoPopover>
                        )}
                    </dt>
                    <dd className="justify-self-end">{renderShippingInfo()}</dd>
                </UITarget>
                <UITarget targetId="sfcc.orderSummary.shipping.after" />

                {/* Tax — hidden for gross taxation since tax is already included in prices */}
                {basket.taxation !== 'gross' && (
                    <>
                        <UITarget targetId="sfcc.orderSummary.tax.before" />
                        <UITarget targetId="sfcc.orderSummary.tax">
                            <UITarget targetId="sfcc.orderSummary.tax.line">
                                <dt>{t('summary.tax')}</dt>
                                {typeof basket.taxTotal === 'number' && basket.taxTotal >= 0 ? (
                                    <dd className="justify-self-end">
                                        {formatCurrency(basket.taxTotal, i18nLanguage, currency)}
                                    </dd>
                                ) : (
                                    <dd className="justify-self-end text-muted-foreground">{t('summary.taxTbd')}</dd>
                                )}
                            </UITarget>
                        </UITarget>
                        <UITarget targetId="sfcc.orderSummary.tax.after" />
                    </>
                )}

                {/* Total */}
                {showTotal && (
                    <>
                        <UITarget targetId="sfcc.orderSummary.total.before" />
                        <UITarget targetId="sfcc.orderSummary.total">
                            <dt className="font-bold">
                                {isEstimate ? t('summary.estimatedTotal') : t('summary.total')}
                            </dt>
                            <dd className="justify-self-end font-bold">
                                {formatCurrency(
                                    basket?.orderTotal ?? basket?.productTotal ?? 0,
                                    i18nLanguage,
                                    currency
                                )}
                            </dd>
                        </UITarget>
                        <UITarget targetId="sfcc.orderSummary.total.after" />
                    </>
                )}
            </dl>

            <UITarget targetId="sfcc.cart.loyalty.pointsEarned" />

            {/* Promo Code Form */}
            {showPromoCodeForm && <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />}
            <UITarget targetId="sfcc.orderSummary.promoCode.before" />
            <UITarget targetId="sfcc.orderSummary.promoCode">
                {showPromoCodeForm ? <PromoCodeForm basket={basket} /> : null}
            </UITarget>
            <UITarget targetId="sfcc.orderSummary.promoCode.after" />
            <UITarget targetId="sfcc.cart.giftCards.apply" />
            <UITarget targetId="sfcc.cart.identity.verification" />
        </>
    );
}

/**
 * OrderSummary component that displays a comprehensive order summary with cart items, totals, and promo codes
 *
 * This component provides a complete order summary including:
 * - Order summary heading with item count
 * - Collapsible cart items accordion with product details
 * - Promo code form for applying discounts
 * - Order totals breakdown (subtotal, tax, shipping, total)
 * - Applied promo codes with removal functionality
 * - Loading states and error handling
 *
 * The component handles:
 * - Promo code application and removal
 * - Toast notifications for promo code actions
 * - Responsive layout and conditional rendering
 * - Integration with cart store and product data
 *
 * @param props - Component props
 * @returns JSX element representing the complete order summary
 */
export default function OrderSummary({
    basket,
    showPromoCodeForm = false,
    showCartItems = true,
    showHeading = true,
    itemsExpanded = false,
    isEstimate = false,
    showTotal = true,
    productsByItemId = {},
    onEditCart,
    showCheckoutAction,
    onSelectBonusProducts,
    className,
    inventoryValidation,
}: OrderSummaryProps): ReactElement {
    const { t, i18n } = useTranslation('cart');
    const { currency } = useSite();
    const desktopHeadingId = 'order-summary-heading-desktop';
    const summaryRegionAccessibilityProps = { 'aria-label': t('summary.orderSummary') };

    const hasBasketId = 'basketId' in basket && basket.basketId;
    const hasOrderNo = 'orderNo' in basket && basket.orderNo;
    if (!hasBasketId && !hasOrderNo) {
        return <div>{t('summary.noBasketData')}</div>;
    }

    const shippingItem = basket.shippingItems?.[0];
    const hasShippingPromos = (shippingItem?.priceAdjustments?.length ?? 0) > 0;
    const shippingPromotionAdjustments = (shippingItem?.priceAdjustments ?? []).map((adjustment) => ({
        priceAdjustmentId: adjustment.priceAdjustmentId,
        itemText: adjustment.itemText,
    }));

    const renderShippingInfo = () => {
        if (basket.shippingTotal === 0) {
            return <span className="text-primary font-medium">{t('summary.shippingFree')}</span>;
        } else if (typeof basket.shippingTotal === 'number' && basket.shippingTotal > 0) {
            return <span>{formatCurrency(basket.shippingTotal, i18n.language, currency)}</span>;
        } else {
            return <span className="text-muted-foreground">{t('summary.shippingTbd')}</span>;
        }
    };

    // Summary content - shared between mobile accordion and desktop card
    const summaryContent = (
        <div className="space-y-2" role="region" {...summaryRegionAccessibilityProps}>
            <SummaryBodyContent
                basket={basket}
                showCartItems={showCartItems}
                productsByItemId={productsByItemId}
                itemsExpanded={itemsExpanded}
                onEditCart={onEditCart}
                onSelectBonusProducts={onSelectBonusProducts}
                t={t}
                i18nLanguage={i18n.language}
                currency={currency}
                hasShippingPromos={hasShippingPromos}
                shippingPromotionAdjustments={shippingPromotionAdjustments}
                renderShippingInfo={renderShippingInfo}
                isEstimate={isEstimate}
                showTotal={showTotal}
                showPromoCodeForm={showPromoCodeForm}
            />
            {showCheckoutAction && (
                <>
                    <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />

                    {/* Inventory error banner */}
                    {inventoryValidation && (
                        <CartInventoryErrorBanner
                            issues={inventoryValidation.itemsExceedingInventory}
                            className="mt-2"
                            id="cart-inventory-error-desktop"
                        />
                    )}

                    <Button
                        asChild={!(inventoryValidation?.hasInventoryIssues ?? false)}
                        className="w-full text-sm mt-2"
                        disabled={inventoryValidation?.hasInventoryIssues ?? false}
                        aria-disabled={inventoryValidation?.hasInventoryIssues ?? false}
                        aria-describedby={
                            inventoryValidation?.hasInventoryIssues ? 'cart-inventory-error-desktop' : undefined
                        }>
                        {inventoryValidation?.hasInventoryIssues ? (
                            <span>{t('checkout.continueToCheckout')}</span>
                        ) : (
                            <Link to={routes.checkout}>{t('checkout.continueToCheckout')}</Link>
                        )}
                    </Button>
                    <UITarget targetId="sfcc.cart.payments.expressCheckout" />

                    <div className="flex justify-center">
                        <VisaIcon width={40} height={32} className="mr-2" />
                        <MastercardIcon width={40} height={32} className="mr-2" />
                        <AmexIcon width={40} height={32} className="mr-2" />
                        <DiscoverIcon width={40} height={32} className="mr-2" />
                    </div>
                </>
            )}
        </div>
    );

    return (
        <Card className={cn('!py-4', className, '')}>
            <CardContent className="px-[var(--cart-summary-px)]">
                <div className="space-y-4" data-testid="sf-order-summary">
                    {showHeading && (
                        <>
                            <UITarget targetId="sfcc.checkout.myCart.header.before" />
                            <Typography
                                variant="h2"
                                as="h2"
                                id={desktopHeadingId}
                                className="text-lg font-semibold leading-[120%] tracking-[-0.45px] text-card-foreground">
                                {t('summary.orderSummary')}
                            </Typography>
                            <hr className="mx-[calc(var(--cart-summary-px)*-1)] border-border" />
                        </>
                    )}

                    {summaryContent}
                </div>
            </CardContent>
        </Card>
    );
}
