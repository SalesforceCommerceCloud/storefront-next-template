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
import type { ReactElement } from 'react';
import { Truck } from 'lucide-react';
import { Typography } from '@/components/typography';
import type { CartFulfillmentItem, DeliveryGroup } from '@/lib/fulfillment-location';
import { useFulfillmentFormat } from './use-fulfillment-format';

/** Same look as the default cart "Delivery" title, but names the fulfillment city. */
export function CartGroupTitle({
    group,
    itemCount,
    totalCount,
}: {
    group: DeliveryGroup;
    itemCount: number;
    totalCount: number;
}): ReactElement {
    const { t } = useFulfillmentFormat();
    return (
        <div className="flex items-center gap-2 mb-0">
            <Truck className="size-[1.125rem] text-foreground shrink-0" aria-hidden />
            <div>
                <Typography
                    variant="h5"
                    as="h2"
                    className="text-xl font-normal leading-[120%] tracking-[-0.6px] text-card-foreground">
                    {t('cartGroupHeading', {
                        city: group.city,
                        itemCount,
                        totalCount,
                        defaultValue: 'Delivery from {{city}} - {{itemCount}} out of {{totalCount}} items',
                    })}
                </Typography>
                <p className="text-xl md:text-sm text-muted-foreground mt-1">
                    {t('postalCode', 'Postal code')}: {group.postalCode}
                </p>
            </div>
        </div>
    );
}

/** Per-line fulfillment details shown under each cart item's name/actions: stock, distance and lead time. */
export function CartLineFulfillmentInfo({ item }: { item: CartFulfillmentItem }): ReactElement {
    const { t, leadTime, distance } = useFulfillmentFormat();
    const { fulfillment } = item;
    return (
        <div data-testid="fulfillment-line-info" className="mt-3 space-y-0.5 text-sm text-muted-foreground">
            <p>
                {t('stock', 'Stock')}: {fulfillment.stockLevel} · {t('distance', 'Distance')}:{' '}
                {distance(fulfillment.distance, fulfillment.distanceUnit)}
            </p>
            <p>
                {t('leadTime', 'Lead time')}: {leadTime(fulfillment.leadTime, fulfillment.leadTimeUnit)}
            </p>
            {item.quantity > fulfillment.stockLevel && (
                <p role="alert" className="text-destructive">
                    {t('exceedsStock', {
                        city: fulfillment.city,
                        stock: fulfillment.stockLevel,
                        defaultValue: 'Only {{stock}} available in {{city}}.',
                    })}
                </p>
            )}
        </div>
    );
}
