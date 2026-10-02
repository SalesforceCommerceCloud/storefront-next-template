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
import { calculateDeliveryDate, hasDeliveryData, useShopperCityId } from '@/lib/delivery-promise';
import { useDeliveryFormat } from './use-delivery-format';

interface ProductAvailabilitySummaryProps {
    productId: string | null | undefined;
    className?: string;
}

/**
 * PLP product card summary: the delivery date and hub for one unit, from the shopper's selected city.
 * Renders nothing for products without fulfillment data.
 */
export function ProductAvailabilitySummary({
    productId,
    className,
}: ProductAvailabilitySummaryProps): ReactElement | null {
    const { t, date } = useDeliveryFormat();
    const cityId = useShopperCityId();
    if (!productId || !hasDeliveryData(productId)) return null;

    const promise = calculateDeliveryDate({ cityId, productId, quantity: 1 });
    return (
        <p data-testid="fulfillment-availability" className={cn('mt-2 text-xs text-muted-foreground', className)}>
            {promise.inStock
                ? t('deliveryByFrom', {
                      date: date(promise.deliveryDate),
                      city: promise.city,
                      defaultValue: 'Delivery by {{date}} from {{city}}',
                  })
                : t('unavailable', 'Unavailable')}
        </p>
    );
}

export default ProductAvailabilitySummary;
