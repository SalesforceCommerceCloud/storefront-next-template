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
import { type ReactElement, type ReactNode, type RefObject } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';
import OrderItemsList, { type ProductDataById } from '@/components/account/order-details/order-items-list';
import OrderSummary from '@/components/order-summary';
import ShippingAddressDisplay from '@/components/checkout/components/shipping-address-display';
import {
    groupProductItemsByShipmentId,
    getPaymentMethodDisplays,
} from '@/components/account/order-details/order-badge-shared';
import ShipmentShippingStatusBadge from '@/components/account/order-details/shipment-shipping-status-badge';
import OrderStatusHeader from '@/components/account/order-details/order-status-header';
import PaymentMethodCard from '@/components/account/order-details/payment-method-card';

export type GuestOrderDetailsProps = {
    /**
     * Redacted order from the server. May be missing fields that are not
     * in config.guestOrderLookup.allowedFields — this component only
     * renders fields that are present.
     */
    order: Partial<ShopperOrders.schemas['Order']>;
    productsById: ProductDataById;
    /**
     * Cancel/return entry points, rendered below the Order Summary totals and above the
     * Payment Method card in the right-hand rail (per the Foundations guest results design).
     */
    actions?: ReactNode;
    /**
     * Ref forwarded to the order status heading (`h1`), so cancel/return dialogs can
     * restore focus to a meaningful element when the trigger button has unmounted.
     */
    headingRef?: RefObject<HTMLHeadingElement | null>;
};

/**
 * Guest order details component for displaying a redacted order from the
 * guest order lookup flow. Renders only fields present on the order object —
 * missing fields are omitted entirely (no placeholders, no "N/A").
 *
 * This is defence-in-depth: the server (G3) has already redacted per
 * config.guestOrderLookup.allowedFields; this component ensures the UI
 * doesn't attempt to show fields it doesn't have.
 */
export function GuestOrderDetails({ order, productsById, actions, headingRef }: GuestOrderDetailsProps): ReactElement {
    const { t } = useTranslation('account');
    const shipments = order.shipments ?? [];
    const productItems = order.productItems ?? [];
    const itemsByShipmentId = groupProductItemsByShipmentId(productItems);
    const paymentMethodDisplays = getPaymentMethodDisplays(order, t);

    return (
        <div data-section="guest-order-details">
            <Card className="[--ui-border-width:1px]">
                <CardContent className="px-6 pt-0 pb-6 space-y-6">
                    {/* Order Details header */}
                    <OrderStatusHeader order={order} headingRef={headingRef} />
                    <div className="border-t border-border" aria-hidden />

                    {/* Items Ordered and Order Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {productItems.length > 0 && (
                            <div className="lg:col-span-2 space-y-4">
                                <h2 className="text-lg font-semibold">{t('orders.itemsOrdered')}</h2>
                                <Card className="p-0 overflow-visible [--ui-border-width:1px]">
                                    <CardContent className="p-0">
                                        {shipments.map((shipment, idx) => {
                                            const sid = shipment.shipmentId ?? `ship-${idx}`;
                                            const items = itemsByShipmentId[sid] ?? [];
                                            return (
                                                <div
                                                    key={sid}
                                                    data-shipment-id={sid}
                                                    className={idx > 0 ? 'border-t border-border' : ''}>
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
                                                            submittedReviewLineKeys={new Set()}
                                                            onOrderLineReviewSubmitted={() => {
                                                                /* guest users cannot submit reviews */
                                                            }}
                                                        />
                                                    </div>
                                                    {/* Shipping Address for this shipment */}
                                                    {shipment.shippingAddress && (
                                                        <div className="mt-2 p-3">
                                                            <Card
                                                                className="rounded-ui p-0 bg-card [--ui-border-width:1px]"
                                                                data-card="shipping-address">
                                                                <CardContent className="p-4">
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
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                        {/* Order Summary */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">{t('orders.orderSummary')}</h3>
                            <OrderSummary
                                basket={order}
                                showCartItems={false}
                                showHeading={false}
                                className="[--ui-border-width:1px]"
                            />
                            {actions}
                            <PaymentMethodCard payments={paymentMethodDisplays} className="[--ui-border-width:1px]" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default GuestOrderDetails;
