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
import {
    calculateDeliveryDate,
    getHubAvailability,
    hasDeliveryData,
    useShopperCityId,
} from '@/lib/delivery-promise';
import { useOptionalProductView } from '@/providers/product-view';
import { HubAvailabilityList } from './hub-availability-list';
import { useDeliveryFormat } from './use-delivery-format';

interface ProductDeliveryInfoProps {
    productId: string | null | undefined;
    className?: string;
}

/**
 * PDP delivery promise, measured from the shopper's selected city and the quantity chosen on the page.
 * The hub is picked by the delivery engine (earliest date, then nearest with enough stock), so the PDP,
 * cart, checkout and confirmation always agree. Every hub is listed, including those without stock.
 */
export function ProductDeliveryInfo({ productId, className }: ProductDeliveryInfoProps): ReactElement | null {
    const { t, date } = useDeliveryFormat();
    const cityId = useShopperCityId();
    const productView = useOptionalProductView();
    const quantity = productView?.quantity ?? 1;
    // A selected variant has its own stock id; the master id resolves to the same inventory row.
    const stockProductId = productView?.currentVariant?.productId ?? productId;
    if (!stockProductId || !hasDeliveryData(stockProductId)) return null;

    const promise = calculateDeliveryDate({ cityId, productId: stockProductId, quantity });
    const hubs = getHubAvailability({ cityId, productId: stockProductId, quantity });

    return (
        <section data-testid="product-delivery-info" aria-live="polite" className={cn('my-4', className)}>
            <p className={cn('text-sm font-semibold', promise.inStock ? 'text-foreground' : 'text-destructive')}>
                {promise.inStock
                    ? t('deliveryByFrom', {
                          date: date(promise.deliveryDate),
                          city: promise.city,
                          defaultValue: 'Delivery by {{date}} from {{city}}',
                      })
                    : promise.maxAvailableUnits > 0
                      ? t('exceedsStock', {
                            stock: promise.maxAvailableUnits,
                            defaultValue: 'Only {{stock}} available.',
                        })
                      : t('unavailable', 'Unavailable')}
            </p>
            <HubAvailabilityList hubs={hubs} selectedLocationId={promise.locationId} className="mt-2" />
        </section>
    );
}

export default ProductDeliveryInfo;
