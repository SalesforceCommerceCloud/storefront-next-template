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
import { useEffect, useMemo, type ReactElement } from 'react';
import type { ShopperBasketsV2 } from '@/scapi';
import { cn } from '@/lib/utils';
import {
    groupByLocation,
    reconcileWithBasket,
    resolveCartItems,
    updateCartFulfillmentState,
    useCartFulfillmentState,
    type BasketLine,
} from '@/lib/fulfillment-location';
import { useFulfillmentFormat } from './use-fulfillment-format';

interface FulfillmentGroupsProps {
    basket: ShopperBasketsV2.schemas['Basket'] | undefined | null;
    /** `cart` lists items per city; `checkout` labels them as numbered delivery groups. */
    variant?: 'cart' | 'checkout';
    className?: string;
}

function toBasketLines(basket: FulfillmentGroupsProps['basket']): BasketLine[] | undefined {
    if (!basket?.productItems) return undefined;
    return basket.productItems
        .filter((item) => !item.bonusProductLineItem)
        .map((item) => ({
            productId: item.productId ?? '',
            productName: item.productName ?? '',
            quantity: item.quantity ?? 0,
        }));
}

/**
 * Cart / checkout view of the order split by fulfillment city. The basket decides which products and
 * quantities exist; this component joins that with the stored fulfillment JSON and keeps the JSON in
 * sync (removed products dropped, quantities updated) whenever the basket changes.
 */
export function FulfillmentGroups({
    basket,
    variant = 'cart',
    className,
}: FulfillmentGroupsProps): ReactElement | null {
    const { t, leadTime, distance } = useFulfillmentFormat();
    const state = useCartFulfillmentState();
    const lines = useMemo(() => toBasketLines(basket), [basket]);
    const groups = useMemo(() => groupByLocation(resolveCartItems(lines ?? [], state)), [lines, state]);

    // Persist the reconciled JSON. Skipped until the basket has loaded so a pending basket never wipes it.
    useEffect(() => {
        if (!lines) return;
        updateCartFulfillmentState((current) => reconcileWithBasket(current, lines));
    }, [lines]);

    if (groups.length === 0) return null;

    return (
        <section
            data-testid={`fulfillment-groups-${variant}`}
            aria-label={t('deliveryGroups', 'Delivery groups')}
            className={cn('mb-3 space-y-3', className)}>
            {groups.map((group, index) => (
                <div key={group.locationId} className="rounded-ui border border-border p-3 md:p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                        {variant === 'checkout'
                            ? t('deliveryGroupTitle', {
                                  number: index + 1,
                                  city: group.city,
                                  defaultValue: 'Delivery group {{number}} – {{city}}',
                              })
                            : group.city}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {t('postalCode', 'Postal code')}: {group.postalCode}
                        </span>
                    </h3>
                    <ul className="mt-2 divide-y divide-border">
                        {group.items.map((item) => (
                            <li key={item.productId} className="py-2 text-sm">
                                <p className="font-medium text-foreground">{item.productName}</p>
                                <p className="text-xs text-muted-foreground">
                                    {variant === 'cart' && (
                                        <>
                                            {t('quantity', 'Quantity')}: {item.quantity} · {t('stock', 'Stock')}:{' '}
                                            {item.fulfillment.stockLevel} ·{' '}
                                        </>
                                    )}
                                    {t('distance', 'Distance')}:{' '}
                                    {distance(item.fulfillment.distance, item.fulfillment.distanceUnit)} ·{' '}
                                    {t('leadTime', 'Lead time')}:{' '}
                                    {leadTime(item.fulfillment.leadTime, item.fulfillment.leadTimeUnit)}
                                </p>
                                {item.quantity > item.fulfillment.stockLevel && (
                                    <p role="alert" className="mt-1 text-xs text-destructive">
                                        {t('exceedsStock', {
                                            city: group.city,
                                            stock: item.fulfillment.stockLevel,
                                            defaultValue: 'Only {{stock}} available in {{city}}.',
                                        })}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}

export default FulfillmentGroups;
