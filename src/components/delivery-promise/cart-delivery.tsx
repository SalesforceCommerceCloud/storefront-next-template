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
import type { Delivery } from '@/lib/delivery-promise';
import { useDeliveryFormat } from './use-delivery-format';

/** Same look as the default cart "Delivery" title, but names the hub city and the delivery date. */
export function CartGroupTitle({
    delivery,
    itemCount,
    totalCount,
}: {
    delivery: Delivery;
    itemCount: number;
    totalCount: number;
}): ReactElement {
    const { t, date } = useDeliveryFormat();
    return (
        <div className="flex items-center gap-2 mb-0">
            <Truck className="size-[1.125rem] text-foreground shrink-0" aria-hidden />
            <div>
                <Typography
                    variant="h5"
                    as="h2"
                    className="text-xl font-normal leading-[120%] tracking-[-0.6px] text-card-foreground">
                    {t('cartGroupHeading', {
                        city: delivery.city,
                        itemCount,
                        totalCount,
                        defaultValue: 'Delivery from {{city}} - {{itemCount}} out of {{totalCount}} items',
                    })}
                </Typography>
                <p className="text-xl md:text-sm text-muted-foreground mt-1">
                    {t('deliveryBy', { date: date(delivery.deliveryDate), defaultValue: 'Delivery by {{date}}' })}
                </p>
            </div>
        </div>
    );
}

/**
 * Per-line details under each cart item: delivery date and lead time, plus a warning when the line's
 * quantity is more than any hub holds.
 */
export function CartLineDeliveryInfo({ delivery }: { delivery: Delivery }): ReactElement {
    const { t, date, leadTime } = useDeliveryFormat();
    return (
        <div data-testid="fulfillment-line-info" className="mt-3 space-y-0.5 text-sm text-muted-foreground">
            {delivery.inStock ? (
                <>
                    <p>
                        {t('deliveryBy', { date: date(delivery.deliveryDate), defaultValue: 'Delivery by {{date}}' })}
                    </p>
                    <p>
                        {t('leadTime', 'Lead time')}: {leadTime(delivery.leadTimeDays + delivery.transitDays)} ·{' '}
                        {t('shipsFrom', { city: delivery.city, defaultValue: 'Ships from {{city}}' })}
                    </p>
                </>
            ) : (
                <p role="alert" className="text-destructive">
                    {delivery.maxAvailableUnits > 0
                        ? t('exceedsStock', {
                              stock: delivery.maxAvailableUnits,
                              defaultValue: 'Only {{stock}} available.',
                          })
                        : t('unavailable', 'Unavailable')}
                </p>
            )}
        </div>
    );
}
