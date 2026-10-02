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
import { useTranslation } from 'react-i18next';
import type { DistanceUnit, LeadTimeUnit } from '@/lib/fulfillment-location';

/** Shared labels/formatters for every fulfillment-location surface (PLP, PDP, cart, checkout). */
export function useFulfillmentFormat() {
    const { t } = useTranslation('fulfillmentLocation');

    const leadTime = (value: number | null, unit: LeadTimeUnit): string => {
        if (value == null) return t('notAvailable', { defaultValue: 'N/A' });
        return unit === 'HOURS'
            ? t('leadTimeHours', {
                  count: value,
                  defaultValue_one: '{{count}} hour',
                  defaultValue_other: '{{count}} hours',
              })
            : t('leadTimeDays', {
                  count: value,
                  defaultValue_one: '{{count}} day',
                  defaultValue_other: '{{count}} days',
              });
    };

    const distance = (value: number, unit: DistanceUnit): string =>
        t('distanceValue', { value, unit: unit === 'MILES' ? 'mi' : 'km', defaultValue: '{{value}} {{unit}}' });

    return { t, leadTime, distance };
}
