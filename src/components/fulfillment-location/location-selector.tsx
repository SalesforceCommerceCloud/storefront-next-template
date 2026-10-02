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
import { useId, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import {
    getLocationAvailability,
    isLocationInStock,
    setSelectedLocationId,
    useSelectedLocation,
} from '@/lib/fulfillment-location';
import { useFulfillmentFormat } from './use-fulfillment-format';

interface LocationSelectorProps {
    productId: string | null | undefined;
    className?: string;
}

/**
 * PDP fulfillment location picker: one selectable card per location with stock, postal code, distance
 * and lead time. Out-of-stock locations are shown but disabled. The choice is stored in the selected-
 * location store and saved with the cart item when the shopper adds the product to the cart.
 */
export function LocationSelector({ productId, className }: LocationSelectorProps): ReactElement | null {
    const { t, leadTime, distance } = useFulfillmentFormat();
    const groupName = useId();
    const locations = getLocationAvailability(productId);
    const selected = useSelectedLocation(productId);
    if (!productId || locations.length === 0) return null;

    return (
        <fieldset data-testid="fulfillment-location-selector" className={cn('my-4', className)}>
            <legend className="mb-2 text-sm font-semibold text-foreground">
                {t('fulfillmentLocations', 'Fulfillment locations')}
            </legend>
            <div className="grid gap-2">
                {locations.map((location) => {
                    const inStock = isLocationInStock(location);
                    const checked = selected?.fulfillmentLocationId === location.fulfillmentLocationId;
                    return (
                        <label
                            key={location.fulfillmentLocationId}
                            className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-ui border p-3 text-sm',
                                checked ? 'border-primary' : 'border-border',
                                !inStock && 'cursor-not-allowed opacity-60'
                            )}>
                            <input
                                type="radio"
                                name={groupName}
                                value={location.fulfillmentLocationId}
                                checked={checked}
                                disabled={!inStock}
                                onChange={() => setSelectedLocationId(productId, location.fulfillmentLocationId)}
                                className="mt-1"
                            />
                            <span className="grid gap-0.5">
                                <span className="font-medium text-foreground">{location.city}</span>
                                {inStock ? (
                                    <span className="text-muted-foreground">
                                        {t('stock', 'Stock')}: {location.stockLevel} · {t('postalCode', 'Postal code')}:{' '}
                                        {location.postalCode}
                                        <br />
                                        {t('distance', 'Distance')}:{' '}
                                        {distance(location.distance, location.distanceUnit)} ·{' '}
                                        {t('leadTime', 'Lead time')}:{' '}
                                        {leadTime(location.leadTime, location.leadTimeUnit)}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">{t('unavailable', 'Unavailable')}</span>
                                )}
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

export default LocationSelector;
