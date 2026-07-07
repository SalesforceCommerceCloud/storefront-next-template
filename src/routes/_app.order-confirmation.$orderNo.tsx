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
import { type ReactElement, Suspense, useEffect } from 'react';
import { UITarget } from '@/targets/ui-target';
import AddressDisplay from '@/components/address-display';
import { Await, useFetcher, useParams, useRouteError } from 'react-router';
import type { action as postOrderRegisterAction } from '@/routes/action.post-order-register';
import type { Route } from './+types/_app.order-confirmation.$orderNo';
import { Link } from '@/components/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Typography } from '@/components/typography';
import ProductImage from '@/components/product-image/product-image';
import { formatCurrency } from '@/lib/currency';
import { formatDeliveryWindow } from '@/lib/date-utils';
import { fetchOrderWithProducts } from '@/lib/api/order.server';
import { destroyBasket } from '@/middlewares/basket.server';
import { useBasketReset } from '@/providers/basket';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { routes } from '@/route-paths';
import {
    ApiError,
    type ShopperOrders,
    type ShopperProducts,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    type ShopperStores,
} from '@/scapi';
import { getCardTypeDisplay } from '@/lib/payment/payment-utils';
import { getDisplayVariationValues } from '@/lib/product/product-utils';
import OrderSkeleton from '@/components/order-skeleton';
import { SeoMeta } from '@/components/seo-meta';
import { useTranslation } from 'react-i18next';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { getLogger } from '@/lib/logger.server';
import { getLoginPreferences } from '@/lib/login-preferences.server';
import { isRegisteredCustomer } from '@/lib/api/customer.server';
import { PostOrderRegistration } from '@/components/post-order-registration/post-order-registration';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { fetchStoresForOrder } from '@/extensions/bopis/lib/api/stores.server';
import { getOrderDeliveryShipments, getOrderPickupShipment } from '@/extensions/bopis/lib/order-utils';
import { getPickupStoreFromMap } from '@/extensions/bopis/lib/store-utils';
import StoreDetails from '@/extensions/store-locator/components/store-locator/details';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

type ProductDataById = Record<string, ShopperProducts.schemas['Product'] | undefined>;

type OrderConfirmationData = {
    order: ShopperOrders.schemas['Order'];
    productsById: ProductDataById;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    storesByStoreId: Map<string, ShopperStores.schemas['Store']>;
};

type CheckoutConfirmationLoaderData = {
    orderData: Promise<OrderConfirmationData>;
    showPostOrderRegistration: boolean;
};

type ImageSource = {
    disBaseLink?: string;
    link?: string;
};

const resolveImageUrl = (source?: ImageSource) => source?.disBaseLink || source?.link;

const getPrimaryImageFromProduct = (product: ShopperProducts.schemas['Product'] | undefined) => {
    const directImage = resolveImageUrl(product?.image as ImageSource);
    if (directImage) {
        return directImage;
    }

    const imageGroups = product?.imageGroups ?? [];
    for (const group of imageGroups) {
        const groupImage = resolveImageUrl(group.images?.[0] as ImageSource);
        if (groupImage) {
            return groupImage;
        }
    }

    const additionalImages = (product?.images as ImageSource[]) ?? [];
    for (const image of additionalImages) {
        const url = resolveImageUrl(image);
        if (url) {
            return url;
        }
    }

    return undefined;
};

/**
 * Server-side loader function that fetches order data for the confirmation page.
 * This function runs on the server during SSR and prepares data for the order confirmation page.
 * @param args - Loader function arguments containing context and parameters
 * @returns Promise that resolves to an object containing the order data promise
 */
export async function loader({ context, params }: Route.LoaderArgs): Promise<CheckoutConfirmationLoaderData> {
    const { orderNo } = params;
    const logger = getLogger(context);
    logger.debug('OrderConfirmation: loader starting', { orderNo });
    const { orderDataPromise, orderPromise } = fetchOrderWithProducts(context, orderNo);

    // Idempotent basket teardown safety net. The default action.place-order and the
    // extension-driven place-order-finalize both tear the basket down before sending the
    // shopper here, but a failure between createOrder and that teardown would leave a
    // phantom basket cookie. Tearing down here is safe (the basket was consumed by
    // createOrder regardless) and self-heals any path that lands on confirmation with
    // stale state. Gated on a successful order lookup so an erroneous orderNo can't
    // strip a still-valid basket.
    orderPromise
        .then(() => {
            destroyBasket(context);
        })
        .catch(() => {
            // Order lookup failed - error UI handles it; do not touch the basket.
        });

    // Determine if we should show post-order registration (guest + email verification disabled)
    const userIsRegistered = isRegisteredCustomer(context);
    const { emailVerificationEnabled } = await getLoginPreferences(context);
    const showPostOrderRegistration = !userIsRegistered && !emailVerificationEnabled;

    // @sfdc-extension-line SFDC_EXT_BOPIS
    const storesByStoreIdPromise = orderPromise.then((order) => fetchStoresForOrder(context, order));

    const combinedPromise = Promise.all([
        orderDataPromise,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        storesByStoreIdPromise,
    ]).then(
        ([
            orderData,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storesByStoreId,
        ]) => ({
            ...orderData,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storesByStoreId,
        })
    );

    return {
        orderData: combinedPromise,
        showPostOrderRegistration,
    };
}

/**
 * Error boundary for the order-confirmation route. Handles two distinct cases:
 *
 *   - SCAPI 404: order genuinely doesn't exist or isn't visible to this shopper.
 *     Show the standard "order not found" copy.
 *   - Anything else (5xx, network, transient): the order may very well exist - we
 *     just can't load it right now. This is the path the extension-driven
 *     place-order recovery routes through when finalize couldn't read the order
 *     back. Show different copy that surfaces the orderNo and asks the shopper
 *     to check their email / contact support, instead of misleadingly claiming
 *     the order doesn't exist.
 */
export function ErrorBoundary() {
    const { t } = useTranslation('checkout');
    const error = useRouteError();
    const params = useParams();
    const orderNo = params.orderNo;

    const isNotFound = error instanceof ApiError && error.status === 404;
    const title = isNotFound ? t('confirmation.orderNotFound') : t('confirmation.orderPlacedDetailsUnavailable');
    const description = isNotFound
        ? t('confirmation.orderNotFoundDescription')
        : t('confirmation.orderPlacedDetailsUnavailableDescription');
    // Surface the orderNo only in the "order placed but details unavailable" branch -
    // for a 404 the orderNo is presumed bogus, so showing it just adds noise.
    const showOrderNo = !isNotFound && Boolean(orderNo);

    return (
        <div data-section="order-confirmation" className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto section-container py-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-center">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <Typography variant="p" className="text-muted-foreground">
                            {description}
                        </Typography>
                        {showOrderNo ? (
                            <Typography variant="p" className="text-foreground font-medium">
                                {t('confirmation.orderNumberLabel', { orderNo })}
                            </Typography>
                        ) : null}
                        <Button asChild>
                            <Link to={routes.home}>{t('confirmation.actions.continueShopping')}</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/**
 * Order confirmation content component that displays the order details and confirmation information.
 * This component receives resolved order data and renders the complete order confirmation page including
 * success header, order summary, shipping details, payment details, and action buttons.
 * @param order - The resolved order data
 * @param productsById - The resolved products data indexed by product ID
 * @param storesByStoreId - The resolved stores data for BOPIS
 * @returns JSX element representing the order confirmation page layout
 */
function OrderConfirmationContent({
    order,
    productsById,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    storesByStoreId,
    showPostOrderRegistration,
}: OrderConfirmationData & { showPostOrderRegistration: boolean }): ReactElement {
    const config = useConfig();
    const { t, i18n } = useTranslation('checkout');
    const { currency } = useSite();
    const resetBasket = useBasketReset();

    // Track registration fetcher to keep showing the card after revalidation
    // (loader flips showPostOrderRegistration to false once the user is logged in)
    const registerFetcher = useFetcher<typeof postOrderRegisterAction>({ key: 'post-order-register' });
    const registrationSuccess = registerFetcher.data?.success === true;

    let deliveryShipments = order.shipments;

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // note: this BOPIS implementation assumes at most 1 pickup store is used for the order
    const { t: tBopis } = useTranslation('extBopis');
    deliveryShipments = getOrderDeliveryShipments(order);
    const store = getPickupStoreFromMap(
        getOrderPickupShipment(order)?.c_fromStoreId as string | undefined,
        storesByStoreId
    );
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const customerName =
        order.customerInfo?.firstName || order.billingAddress?.firstName || t('confirmation.hero.defaultName');
    const customerEmail = order.customerInfo?.email || t('confirmation.hero.emailFallback');

    // Integrators should replace placeholder URLs with actual FAQ, contact, and return policy links.
    const helpActions = [
        { label: t('confirmation.helpLinks.faq'), href: '#' },
        { label: t('confirmation.helpLinks.contact'), href: '#' },
        { label: t('confirmation.helpLinks.returns'), href: '#' },
    ];
    const productItems = order.productItems ?? [];
    const promotionsTotal = [
        ...(order.orderPriceAdjustments ?? []),
        ...(order.productItems ?? []).flatMap((item) => item.priceAdjustments ?? []),
    ].reduce((sum, adjustment) => sum + (adjustment.price ?? 0), 0);
    const totals = {
        subtotal: order.productTotal ?? order.productSubTotal ?? 0,
        promotions: promotionsTotal,
        shipping: order.shippingTotal ?? 0,
        tax: order.taxTotal ?? 0,
        total: order.orderTotal ?? 0,
    };

    const paymentInstrument = order.paymentInstruments?.[0];
    const paymentMethodDisplay = paymentInstrument
        ? getCardTypeDisplay(paymentInstrument, t('confirmation.fields.defaultPaymentMethod'))
        : t('confirmation.fields.defaultPaymentMethod');
    const paymentSummary = paymentInstrument
        ? t('confirmation.payment.methodSummary', {
              method: paymentMethodDisplay,
              lastDigits: paymentInstrument.paymentCard?.numberLastDigits ?? '',
          })
        : paymentMethodDisplay;

    const summaryRows = [
        { key: 'subtotal', label: t('confirmation.totals.subtotal'), value: totals.subtotal },
        { key: 'promotions', label: t('confirmation.totals.promotions'), value: totals.promotions },
        { key: 'shipping', label: t('confirmation.totals.shipping'), value: totals.shipping },
        { key: 'tax', label: t('confirmation.totals.tax'), value: totals.tax },
        { key: 'total', label: t('confirmation.totals.total'), value: totals.total, bold: true },
    ];

    // Clear the basket context after an order is confirmed.
    useEffect(() => {
        resetBasket();
    }, [resetBasket]);

    return (
        <div
            data-section="order-confirmation"
            data-testid="order-confirmation-container"
            className="min-h-screen bg-muted/30">
            <div className="max-w-5xl mx-auto section-container py-10 space-y-6">
                {/* Thank You and Order Confirmation section */}
                <Card className="border border-border/70">
                    <CardContent className="p-8 space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <Typography variant="h2" as="h1" className="text-foreground">
                                    {t('confirmation.hero.thankYou', { name: customerName })}
                                </Typography>
                                <Typography variant="p" className="text-muted-foreground">
                                    {t('confirmation.hero.orderConfirmed')}
                                </Typography>
                                <Typography variant="p" className="text-foreground font-medium">
                                    {t('confirmation.hero.emailConfirmation', { email: customerEmail })}
                                </Typography>
                            </div>
                            <div className="text-left md:text-right space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                    {t('confirmation.orderNumber')}
                                    <span data-testid="order-number" className="text-primary">
                                        {' '}
                                        {order.orderNo}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <Typography variant="p" className="text-foreground font-medium">
                                {t('confirmation.hero.needHelp')}
                            </Typography>
                            <div className="flex flex-wrap gap-3">
                                {helpActions.map(({ label, href }) =>
                                    href ? (
                                        <Button key={label} variant="outline" size="sm" asChild>
                                            <Link to={href}>{label}</Link>
                                        </Button>
                                    ) : (
                                        <Button key={label} variant="outline" size="sm">
                                            {label}
                                        </Button>
                                    )
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Post-order registration for guest shoppers when email verification is disabled */}
                {(showPostOrderRegistration || registrationSuccess) && order.customerInfo?.email && (
                    <PostOrderRegistration
                        email={order.customerInfo.email}
                        firstName={order.billingAddress?.firstName || order.shipments?.[0]?.shippingAddress?.firstName}
                        lastName={order.billingAddress?.lastName || order.shipments?.[0]?.shippingAddress?.lastName}
                        orderNo={order.orderNo}
                    />
                )}

                {/* @sfdc-extension-block-start SFDC_EXT_BOPIS */}
                {/* Pickup Details */}
                {store && (
                    <Card className="mb-8">
                        <CardHeader>
                            <CardTitle>{tBopis('storePickup.title')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <StoreDetails
                                store={store}
                                showDistance={true}
                                showEmail={true}
                                showStoreHours={true}
                                showPhone={true}
                                mobileLayout={true} // Always show vertical layout
                                compactAddress={true} // Use compact address format with store name inline
                            />
                        </CardContent>
                    </Card>
                )}
                {/* @sfdc-extension-block-end SFDC_EXT_BOPIS */}

                {/* Shipping Details section - supports multiple shipments if present */}
                <UITarget targetId="sfcc.orderConfirmation.shipping.details">
                    {deliveryShipments.map((shipment) => {
                        const shippingAddress = shipment.shippingAddress;
                        const shippingMethodName =
                            shipment.shippingMethod?.name || t('confirmation.fields.defaultShippingMethod');
                        const deliveryWindowFormatted = formatDeliveryWindow(
                            {
                                startAt: (shipment as Record<string, unknown>).c_deliveryWindowStartAt as
                                    | string
                                    | undefined,
                                endAt: (shipment as Record<string, unknown>).c_deliveryWindowEndAt as
                                    | string
                                    | undefined,
                            },
                            i18n.language
                        );
                        const estimatedDeliveryTime = deliveryWindowFormatted
                            ? t('confirmation.summaryLabels.deliveryWindow', { window: deliveryWindowFormatted })
                            : shipment.shippingMethod?.description ||
                              t('confirmation.summaryLabels.estimatedDatePlaceholder');
                        return (
                            <Card key={shipment.shipmentId} className="border border-border/70">
                                <CardContent className="grid gap-6 p-6 md:grid-cols-3">
                                    <div>
                                        <p className="text-base font-semibold tracking-wide text-foreground">
                                            {t('confirmation.summaryLabels.arriving')}
                                        </p>
                                        <p className="mt-3 text-sm font-medium text-muted-foreground">
                                            {estimatedDeliveryTime}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold tracking-wide text-foreground">
                                            {t('confirmation.summaryLabels.shippingAddress')}
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {shippingAddress ? (
                                                <AddressDisplay address={shippingAddress} />
                                            ) : (
                                                <p className="text-sm font-medium text-muted-foreground">
                                                    {t('confirmation.summaryLabels.noAddress')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold tracking-wide text-foreground">
                                            {t('confirmation.summaryLabels.shippingMethod')}
                                        </p>
                                        <p className="mt-3 text-sm font-medium text-muted-foreground">
                                            {shippingMethodName}
                                        </p>
                                    </div>
                                    <UITarget targetId="sfcc.orderConfirmation.shipping.tracking" />
                                </CardContent>
                            </Card>
                        );
                    })}
                </UITarget>

                {/* Product Items Summary section */}
                <Card className="border border-border/70">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-2xl font-medium">{t('confirmation.summaryTitle')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                            {productItems.length === 0 ? (
                                <Typography variant="p" className="text-muted-foreground">
                                    {t('confirmation.emptyItemsFallback')}
                                </Typography>
                            ) : (
                                productItems.map((item, index) => {
                                    const finalPrice =
                                        item.priceAfterOrderDiscount ??
                                        item.priceAfterItemDiscount ??
                                        item.price ??
                                        item.basePrice ??
                                        0;
                                    const originalPrice =
                                        item.basePrice && item.basePrice > finalPrice ? item.basePrice : undefined;

                                    const productData = item.productId ? productsById[item.productId] : undefined;
                                    const productKey = item.itemId ?? `${item.productId}-${index}`;
                                    const productName = item.productName ?? t('confirmation.productPlaceholderInitial');

                                    const imageSrc = getPrimaryImageFromProduct(productData);
                                    const variationValues =
                                        productData && productData.variationAttributes
                                            ? Object.entries(
                                                  getDisplayVariationValues(
                                                      productData.variationAttributes,
                                                      (productData.variationValues ?? {}) as Record<string, string>
                                                  )
                                              )
                                            : [];
                                    return (
                                        <div
                                            key={productKey}
                                            className="rounded-ui border border-border/70 bg-card p-4 sm:p-7 flex flex-col gap-4 sm:flex-row sm:items-center">
                                            <div className="flex items-center justify-center">
                                                <div className="h-24 w-24 bg-muted overflow-hidden rounded-ui flex items-center justify-center text-muted-foreground text-sm font-semibold">
                                                    {imageSrc ? (
                                                        <ProductImage
                                                            src={toImageUrl({ src: imageSrc, config }) ?? imageSrc}
                                                            alt={productName}
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        (productName?.[0] ??
                                                        t('confirmation.productPlaceholderInitial'))
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <p className="font-semibold text-foreground leading-tight">
                                                    {productName}
                                                </p>
                                                {variationValues.length > 0 &&
                                                    variationValues.map(([label, value]) => (
                                                        <p
                                                            key={`${productKey}-${label}`}
                                                            className="text-sm text-muted-foreground">
                                                            {label}: {value}
                                                        </p>
                                                    ))}
                                                <p className="text-sm text-muted-foreground">
                                                    {t('confirmation.summaryLabels.quantity', {
                                                        count: item.quantity ?? 1,
                                                    })}
                                                </p>
                                            </div>
                                            <div className="text-right space-y-1 sm:self-start">
                                                {originalPrice && (
                                                    <p className="text-sm text-muted-foreground line-through">
                                                        {formatCurrency(originalPrice, i18n.language, currency)}
                                                    </p>
                                                )}
                                                <p className="text-sm font-semibold text-foreground">
                                                    {formatCurrency(finalPrice, i18n.language, currency)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="space-y-2 border-t pt-4">
                            {summaryRows.map((row) => {
                                const isPromotion = row.key === 'promotions' && row.value !== 0;
                                const rowEl = (
                                    <div key={row.key} className="flex items-center justify-between text-sm">
                                        <span
                                            className={
                                                row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground'
                                            }>
                                            {row.label}
                                        </span>
                                        <span
                                            className={
                                                row.bold
                                                    ? 'font-semibold text-foreground'
                                                    : isPromotion
                                                      ? 'text-sm text-success font-semibold'
                                                      : 'text-foreground'
                                            }>
                                            {row.key === 'shipping' && row.value === 0
                                                ? t('confirmation.summaryLabels.freeShipping')
                                                : formatCurrency(row.value, i18n.language, currency)}
                                        </span>
                                    </div>
                                );
                                return row.key === 'tax' ? (
                                    <UITarget key={row.key} targetId="sfcc.orderConfirmation.tax.summary">
                                        {rowEl}
                                    </UITarget>
                                ) : (
                                    rowEl
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Payment Details section — only shown when card details are available */}
                {paymentInstrument?.paymentCard?.cardType && (
                    <Card className="border border-border/70">
                        <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                                    {paymentInstrument.paymentCard.cardType}
                                </span>
                                <div>
                                    <p className="font-medium text-foreground">{paymentSummary}</p>
                                </div>
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                                {formatCurrency(totals.total, i18n.language, currency)}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Newsletter subscription section */}
                <Card className="border border-border/70">
                    <CardContent className="space-y-4 p-6">
                        <div>
                            <p className="font-medium text-foreground">{t('confirmation.newsletter.title')}</p>
                            <p className="text-sm text-muted-foreground">{t('confirmation.newsletter.subtitle')}</p>
                        </div>
                        {/* This is a static placeholder form. Integrators should handle submit events here
                           (e.g., call their marketing/newsletter API or hook into an existing newsletter service). */}
                        <form className="flex flex-col gap-3 sm:flex-row">
                            <Input
                                type="email"
                                placeholder={t('confirmation.newsletter.placeholder')}
                                className="h-12 flex-1"
                            />
                            <Button type="button" className="h-12 sm:w-auto">
                                {t('confirmation.newsletter.cta')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="flex flex-col justify-center gap-4 pt-2 sm:flex-row">
                    <Button asChild size="lg">
                        <Link to={routes.home}>{t('confirmation.actions.continueShopping')}</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                        <Link to={routes.account}>{t('confirmation.actions.viewAccount')}</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Order confirmation page component that wraps the content with Suspense and Await.
 * This component follows the React Router v7 pattern for handling deferred data with Suspense.
 * @param loaderData - The loader data containing the combined order data promise
 * @returns JSX element representing the order confirmation page with Suspense boundary
 */
export default function OrderConfirmationPage({
    loaderData,
}: {
    loaderData: CheckoutConfirmationLoaderData;
}): ReactElement {
    const { t } = useTranslation('checkout');

    return (
        <>
            <SeoMeta title={t('meta.confirmationTitle', { defaultValue: 'Order Confirmation' })} noIndex />
            <Suspense fallback={<OrderSkeleton />}>
                <Await resolve={loaderData.orderData}>
                    {(data) => (
                        <OrderConfirmationContent
                            {...data}
                            showPostOrderRegistration={loaderData.showPostOrderRegistration}
                        />
                    )}
                </Await>
            </Suspense>
        </>
    );
}
