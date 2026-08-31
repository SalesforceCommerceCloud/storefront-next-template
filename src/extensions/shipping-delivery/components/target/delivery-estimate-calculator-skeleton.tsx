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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

/** Reserves the calculator card's layout while its lazy module or profile destination loads. */
export default function DeliveryEstimateCalculatorSkeleton(): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    const headingId = `delivery-estimate-calculator-skeleton-${useId().replaceAll(':', '')}-heading`;

    return (
        <section
            className="mt-4 min-h-28 rounded-ui border border-muted-foreground/20 bg-card p-3"
            aria-busy="true"
            aria-labelledby={headingId}>
            <h2 id={headingId} className="sr-only">
                {t('cardTitle')}
            </h2>
            <div aria-hidden="true" className="flex items-start gap-3">
                <Skeleton className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <div className="mt-3 flex gap-2">
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-10 w-24" />
                    </div>
                </div>
            </div>
        </section>
    );
}
