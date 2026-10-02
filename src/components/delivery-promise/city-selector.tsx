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

import { useId, type ChangeEvent, type ReactElement } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { cityManagement, setShopperCityId, useShopperCityId } from '@/lib/delivery-promise';

interface CitySelectorProps {
    className?: string;
}

/**
 * Where the shopper currently is. Every distance, lead time and delivery date (PDP, cart, checkout,
 * confirmation) is measured from this city. Defaults to the default city (Tbilisi).
 */
export function CitySelector({ className }: CitySelectorProps): ReactElement {
    const { t } = useTranslation('fulfillmentLocation');
    const selectId = useId();
    const cityId = useShopperCityId();

    return (
        <div data-testid="city-selector" className={cn('flex items-center gap-1.5 text-sm', className)}>
            <MapPin className="size-4 shrink-0" aria-hidden />
            <label htmlFor={selectId} className="sr-only sm:not-sr-only">
                {t('deliverTo', 'Deliver to')}
            </label>
            <select
                id={selectId}
                value={cityId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setShopperCityId(event.target.value)}
                className="cursor-pointer rounded-ui border border-border bg-transparent px-2 py-1 text-inherit">
                {cityManagement.cities.map((city) => (
                    <option key={city.id} value={city.id} className="text-foreground">
                        {city.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default CitySelector;
