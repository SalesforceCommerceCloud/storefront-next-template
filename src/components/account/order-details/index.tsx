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
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Check, Hash, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';
import OrderItemsList, { type ProductDataById } from '@/components/account/order-details/order-items-list';
import OrderTracking, { TrackShipmentAction } from '@/components/account/order-tracking';
import { getOrderTrackingEntries } from '@/lib/order-management/tracking';
import { hasDisplayableTracking } from '@/components/account/order-tracking/track-shipment';
import OrderSummary from '@/components/order-summary';
import ShippingAddressDisplay from '@/components/checkout/components/shipping-address-display';
import {
    formatStatusFallbackLabel,
    getOrderStatusConfig,
    getShippingStatusConfig,
    resolveOrderStatus,
} from '@/lib/order/status';
import { cn } from '@/lib/utils';
import { UITarget } from '@/targets/ui-target';

export type { ProductDataById };

const BADGE_BASE_CLASSES = 'shrink-0 font-semibold border-0 py-1 w-fit';

export type OrderDetailsProps = {
    order: ShopperOrders.schemas['Order'];
    productsById: ProductDataById;
};

type ProductItem = ShopperOrders.schemas['ProductItem'];

function groupProductItemsByShipmentId(productItems: ProductItem[]): Record<string, ProductItem[]> {
    return productItems.reduce<Record<string, ProductItem[]>>((itemsByShipmentId, item) => {
        const shipmentId = item.shipmentId ?? 'default';
        if (!itemsByShipmentId[shipmentId]) itemsByShipmentId[shipmentId] = [];
        itemsByShipmentId[shipmentId].push(item);
        return itemsByShipmentId;
    }, {});
}

/** Raw `order.status` when it is not a known SCAPI enum value in {@link getOrderStatusConfig}. */
function orderStatusFallbackLabel(status: string | undefined): string {
    return formatStatusFallbackLabel(status);
}

function ShipmentShippingStatusBadge({
    shippingStatus,
    t,
}: {
    shippingStatus: string | undefined;
    t: ReturnType<typeof useTranslation>['t'];
}): ReactElement | null {
    const trimmed = shippingStatus?.trim() ?? '';
    const config = getShippingStatusConfig(shippingStatus);
    if (!config && !trimmed) {
        return null;
    }
    return (
        <Badge
            data-testid="shipping-status-badge"
            className={cn(BADGE_BASE_CLASSES, config?.className ?? 'border-transparent bg-muted text-foreground')}>
            {config ? t(config.labelKey) : formatStatusFallbackLabel(trimmed)}
        </Badge>
    );
}

type PaymentMethodDisplay = { id: string; label: string };

function getPaymentMethodDisplays(
    order: ShopperOrders.schemas['Order'],
    t: ReturnType<typeof useTranslation>['t']
): PaymentMethodDisplay[] {
    const instruments = order.paymentInstruments ?? [];
    return instruments.flatMap((instrument, index) => {
        const card = instrument.paymentCard;
        if (!card?.numberLastDigits) return [];
        const id = instrument.paymentInstrumentId ?? `payment-${index}`;
        const cardType = card.cardType ?? 'Card';
        const label = t('orders.paymentMethodEndingIn', {
            cardType,
            lastDigits: card.numberLastDigits,
        });
        return [{ id, label }];
    });
}

function orderReviewStorageKey(orderNo: string | undefined): string {
    return `orderReviewSubmittedLines:${orderNo ?? ''}`;
}

export function OrderDetails({ order, productsById }: OrderDetailsProps): ReactElement {
    const { t } = useTranslation('account');
    const orderNo = order.orderNo ?? '';
    const [submittedReviewLineKeys, setSubmittedReviewLineKeys] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (typeof sessionStorage === 'undefined' || !orderNo) {
            return;
        }
        try {
            const raw = sessionStorage.getItem(orderReviewStorageKey(orderNo));
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                setSubmittedReviewLineKeys(
                    new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))
                );
            }
        } catch {
            /* ignore corrupt storage */
        }
    }, [orderNo]);

    const handleOrderLineReviewSubmitted = useCallback(
        (lineKey: string) => {
            setSubmittedReviewLineKeys((prev) => {
                const next = new Set(prev);
                next.add(lineKey);
                try {
                    if (typeof sessionStorage !== 'undefined' && orderNo) {
                        sessionStorage.setItem(orderReviewStorageKey(orderNo), JSON.stringify([...next]));
                    }
                } catch {
                    /* ignore quota */
                }
                return next;
            });
        },
        [orderNo]
    );

    const shipments = order.shipments ?? [];
    const productItems = order.productItems ?? [];
    // Order-status badge value: ECOM-first, OMS as fallback — see resolveOrderStatus
    // JSDoc for why (the badge only understands the 6 OrderStatusEnum values). Shared
    // resolver, so this badge and the order-history list badge can never disagree for
    // the same order; distinct from the tracking mapper's OMS-preferred shipment
    // *sourcing*. The per-shipment shipping-status badge below stays ECOM — an OMS
    // shipment has no join key to a specific ECOM shipment, so OMS-enriching it would
    // require a positional join that renders data against the wrong shipment.
    const orderStatus = resolveOrderStatus(order);
    const orderStatusConfig = getOrderStatusConfig(orderStatus);
    const orderStatusLabelFallback = orderStatusFallbackLabel(orderStatus);
    const showOrderStatusBadge = orderStatusConfig || orderStatusLabelFallback;
    const OrderStatusIcon = orderStatusConfig?.icon === 'check' ? Check : orderStatusConfig?.icon === 'x' ? X : null;
    const itemsByShipmentId = groupProductItemsByShipmentId(productItems);
    const paymentMethodDisplays = getPaymentMethodDisplays(order, t);
    // Whether the order has anything to show in the tracking section — when false,
    // both OrderTracking and TrackShipmentAction render null, so skip the wrapper
    // (it would otherwise leave an empty spacing div).
    const hasTracking = getOrderTrackingEntries(order).some(hasDisplayableTracking);

    return (
        <div data-section="order-details">
            {/* Single bordered container for the whole order details component */}
            <Card className="">
                <CardContent className="px-6 pt-0 pb-6 space-y-6">
                    {/* Order Details header */}
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">{t('orders.orderDetailsPageTitle')}</h1>
                            <p
                                className="mt-1 flex items-center gap-0 text-base font-medium text-muted-foreground"
                                data-testid="order-number">
                                <Hash className="size-4 shrink-0" aria-hidden={true} />
                                <span>{order.orderNo}</span>
                            </p>
                        </div>
                        {showOrderStatusBadge ? (
                            <Badge
                                data-testid="order-status-badge"
                                className={cn(
                                    BADGE_BASE_CLASSES,
                                    orderStatusConfig?.className ?? 'border-transparent bg-muted text-foreground'
                                )}>
                                {OrderStatusIcon ? (
                                    <OrderStatusIcon
                                        data-testid="order-status-icon"
                                        className="mr-1 inline size-3.5"
                                        aria-hidden={true}
                                    />
                                ) : null}
                                {orderStatusConfig ? t(orderStatusConfig.labelKey) : orderStatusLabelFallback}
                            </Badge>
                        ) : null}
                    </div>
                    <div className="border-t border-muted-foreground/20" aria-hidden />

                    {/* Items Ordered and Order Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <h2 className="text-lg font-semibold">{t('orders.itemsOrdered')}</h2>
                            <Card className="p-0 overflow-visible">
                                <CardContent className="p-0">
                                    {shipments.map((shipment, idx) => {
                                        const sid = shipment.shipmentId ?? `ship-${idx}`;
                                        const items = itemsByShipmentId[sid] ?? [];
                                        return (
                                            <div
                                                key={sid}
                                                data-shipment-id={sid}
                                                className={idx > 0 ? 'border-t border-muted-foreground/20' : ''}>
                                                <div className="px-3 py-2 bg-muted flex flex-nowrap items-center justify-between gap-2">
                                                    <p className="text-sm min-w-0 font-medium">
                                                        {t('orders.shipmentNumber', {
                                                            n: String(idx + 1),
                                                        })}
                                                    </p>
                                                    <ShipmentShippingStatusBadge
                                                        shippingStatus={shipment.shippingStatus}
                                                        t={t}
                                                    />
                                                </div>
                                                <div className="p-3">
                                                    <OrderItemsList
                                                        items={items}
                                                        productsById={productsById}
                                                        orderNo={order.orderNo}
                                                        submittedReviewLineKeys={submittedReviewLineKeys}
                                                        onOrderLineReviewSubmitted={handleOrderLineReviewSubmitted}
                                                    />
                                                    <UITarget targetId="sfcc.myAccount.orderDetails.review" />
                                                </div>
                                                {/* Shipping Address for this shipment */}
                                                <div className="mt-2 border-t border-muted-foreground/20 pt-4 px-3 pb-3 mx-3">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {shipment.shippingAddress && (
                                                            <Card
                                                                className="rounded-ui  min-h-[4rem] p-0 bg-card"
                                                                data-card="shipping-address">
                                                                <CardContent className="p-3">
                                                                    <p className="text-xs font-semibold text-foreground">
                                                                        {t('orders.shippingAddress')}
                                                                    </p>
                                                                    <div className="mt-2">
                                                                        <ShippingAddressDisplay
                                                                            address={shipment.shippingAddress}
                                                                        />
                                                                    </div>
                                                                    {shipment.shippingMethod?.name && (
                                                                        <p className="mt-2 text-sm text-muted-foreground">
                                                                            {shipment.shippingMethod.name}
                                                                        </p>
                                                                    )}
                                                                </CardContent>
                                                            </Card>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>

                            {/* Shipment tracking (OMS-preferred, ECOM fallback) + the Track-shipment action */}
                            {hasTracking ? (
                                <div className="space-y-3">
                                    <UITarget targetId="sfcc.myAccount.orderDetails.tracking" />
                                    <OrderTracking order={order} />
                                    <TrackShipmentAction order={order} />
                                </div>
                            ) : null}
                        </div>
                        {/* Order Summary – OrderSummary accepts both Basket and Order for totals */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">{t('orders.orderSummary')}</h3>
                            <UITarget targetId="sfcc.myAccount.orderDetails.tax">
                                <OrderSummary basket={order} showCartItems={false} showHeading={false} />
                            </UITarget>
                            <UITarget targetId="sfcc.myAccount.orderDetails.returns" />
                            <UITarget targetId="sfcc.myAccount.orderDetails.cancel" />
                            <UITarget targetId="sfcc.myAccount.orderDetails.support" />
                            {paymentMethodDisplays.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-foreground">{t('orders.paymentMethod')}</p>
                                    <Card className="rounded-ui p-0 bg-card" data-card="payment-method">
                                        <CardContent className="p-3 py-2">
                                            <ul className="text-sm font-medium text-muted-foreground space-y-1 list-none">
                                                {paymentMethodDisplays.map(({ id, label }) => (
                                                    <li key={id}>{label}</li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default OrderDetails;
