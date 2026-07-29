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

import type { TFunction } from 'i18next';
import type { ShopperBasketsV2 } from '@/scapi';
import { formatDeliveryWindow } from '@/lib/date-utils';

/** Minimal shape of a shipping method needed to derive its arrival label. */
interface ArrivalLabelSource {
    /** Structured delivery window (RFC 3339 timestamps); preferred over estimatedArrivalTime. */
    deliveryWindow?: ShopperBasketsV2.schemas['DeliveryWindow'];
    /** Free-text estimated arrival, used only when deliveryWindow is absent or unformattable. */
    estimatedArrivalTime?: string;
}

/**
 * Builds the shopper-facing arrival label for a shipping method, preferring a formatted
 * `deliveryWindow` date range over the free-text `estimatedArrivalTime`.
 *
 * @param method - The shipping method's arrival fields
 * @param t - The `checkout`-namespace translation function
 * @param locale - The locale used to format the delivery window (e.g. `i18n.language`)
 * @returns The localized arrival label, or `undefined` when neither source is present
 */
export function getShippingArrivalLabel(
    method: ArrivalLabelSource,
    t: TFunction<'checkout'>,
    locale: string
): string | undefined {
    const deliveryWindowFormatted = formatDeliveryWindow(method.deliveryWindow, locale);
    if (deliveryWindowFormatted) {
        return t('shippingOptions.deliveryWindow', { window: deliveryWindowFormatted });
    }
    if (method.estimatedArrivalTime) {
        return t('shippingOptions.arrives', { estimatedArrivalTime: method.estimatedArrivalTime });
    }
    return undefined;
}
