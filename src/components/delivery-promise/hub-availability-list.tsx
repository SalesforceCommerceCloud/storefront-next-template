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
import { cn } from '@/lib/utils';
import type { HubAvailability } from '@/lib/delivery-promise';
import { useDeliveryFormat } from './use-delivery-format';

interface HubAvailabilityListProps {
    hubs: readonly HubAvailability[];
    /** Hub the delivery promise picked; highlighted. */
    selectedLocationId?: string;
    className?: string;
}

/**
 * One line per hub that holds stock: stock, distance from the shopper's city, lead time and delivery date.
 * Hubs with no stock at all are not listed; a hub with some stock but fewer than the requested quantity says
 * how many it has.
 */
export function HubAvailabilityList({ hubs, selectedLocationId, className }: HubAvailabilityListProps): ReactElement | null {
    const { t, date, leadTime, distance } = useDeliveryFormat();
    const ordered = hubs.filter((hub) => hub.stockLevel > 0).sort(
        (a, b) =>
            Number(b.canFulfill) - Number(a.canFulfill) ||
            a.leadTimeDays + a.transitDays - (b.leadTimeDays + b.transitDays) ||
            a.distanceKm - b.distanceKm
    );
    if (ordered.length === 0) return null;
    return (
        <ul className={cn('space-y-1 text-xs text-muted-foreground', className)}>
            {ordered.map((hub) => (
                <li
                    key={hub.locationId}
                    data-testid={`hub-availability-${hub.locationId}`}
                    className={cn(hub.locationId === selectedLocationId && hub.canFulfill && 'text-foreground')}>
                    <span className="font-medium text-foreground">{hub.city}</span>
                    {' — '}
                    {hub.canFulfill ? (
                        <>
                            {t('stock', 'Stock')}: {hub.stockLevel} · {distance(hub.distanceKm)} ·{' '}
                            {leadTime(hub.leadTimeDays + hub.transitDays)} ·{' '}
                            {t('deliveryBy', { date: date(hub.deliveryDate), defaultValue: 'Delivery by {{date}}' })}
                        </>
                    ) : (
                        t('exceedsStockIn', {
                            stock: hub.stockLevel,
                            city: hub.city,
                            defaultValue: 'Only {{stock}} available in {{city}}',
                        })
                    )}
                </li>
            ))}
        </ul>
    );
}

export default HubAvailabilityList;
