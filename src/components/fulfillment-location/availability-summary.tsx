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
import { getLocationAvailability, isLocationInStock } from '@/lib/fulfillment-location';
import { useFulfillmentFormat } from './use-fulfillment-format';

interface ProductAvailabilitySummaryProps {
    productId: string | null | undefined;
    className?: string;
}

/**
 * PLP product card summary. One location shows full detail (city, stock, postal code, distance, lead
 * time); several locations show one compact line per city so they are clearly distinguishable.
 * Renders nothing for products without fulfillment data. Static data, so no layout shift.
 */
export function ProductAvailabilitySummary({
    productId,
    className,
}: ProductAvailabilitySummaryProps): ReactElement | null {
    const { t, leadTime, distance } = useFulfillmentFormat();
    const locations = getLocationAvailability(productId);
    if (locations.length === 0) return null;

    if (locations.length > 1) {
        return (
            <div data-testid="fulfillment-availability" className={cn('mt-2 text-xs text-muted-foreground', className)}>
                <p className="font-medium text-foreground">{t('availableLocations', 'Available locations')}</p>
                <ul className="mt-0.5 space-y-0.5">
                    {locations.map((location) => (
                        <li key={location.fulfillmentLocationId}>
                            <span className="font-medium text-foreground">{location.city}</span>
                            {' — '}
                            {isLocationInStock(location)
                                ? `${t('stock', 'Stock')}: ${location.stockLevel} · ${leadTime(location.leadTime, location.leadTimeUnit)}`
                                : t('unavailable', 'Unavailable')}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    const [location] = locations;
    const inStock = isLocationInStock(location);
    return (
        <div
            data-testid="fulfillment-availability"
            className={cn('mt-2 space-y-0.5 text-xs text-muted-foreground', className)}>
            <p>
                {t('availableFrom', 'Available from')}:{' '}
                <span className="font-medium text-foreground">{location.city}</span>
            </p>
            {inStock ? (
                <>
                    <p>
                        {t('stock', 'Stock')}: {location.stockLevel} · {t('postalCode', 'Postal code')}:{' '}
                        {location.postalCode}
                    </p>
                    <p>
                        {t('distance', 'Distance')}: {distance(location.distance, location.distanceUnit)} ·{' '}
                        {t('leadTime', 'Lead time')}: {leadTime(location.leadTime, location.leadTimeUnit)}
                    </p>
                </>
            ) : (
                <p>{t('unavailable', 'Unavailable')}</p>
            )}
        </div>
    );
}

export default ProductAvailabilitySummary;
