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
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { Typography } from '@/components/typography';
import { formatCurrency } from '@/lib/currency';
import { formatDeliveryWindow } from '@/lib/date-utils';
import type { ShippingEstimateOption } from '@/lib/shipping-estimate/types';

/** Renders every deliverable shipping method returned for the shopper's destination. */
export function EstimatedDeliveryModalContent({
    contentTitle,
    shippingOptions,
}: {
    contentTitle?: string;
    shippingOptions: ShippingEstimateOption[];
}): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    const { language, currency } = useSite();

    return (
        <div>
            {contentTitle && (
                <Typography variant="h5" as="h3" className="mb-3 font-medium">
                    {contentTitle}
                </Typography>
            )}
            <div className="space-y-3">
                {shippingOptions.map((option) => {
                    const deliveryWindow = formatDeliveryWindow(option.deliveryWindow, language);
                    return (
                        <div key={option.shippingMethodId} className="rounded-ui border border-border p-4">
                            <div className="flex items-start justify-between gap-4">
                                <Typography as="p" className="font-medium text-foreground">
                                    {option.name ?? option.carrier ?? option.shippingMethodId}
                                </Typography>
                                {option.price !== undefined && (
                                    <Typography as="span" className="shrink-0 text-sm font-semibold text-foreground">
                                        {option.price === 0
                                            ? t('free')
                                            : formatCurrency(option.price, language, option.currency ?? currency)}
                                    </Typography>
                                )}
                            </div>
                            {deliveryWindow && (
                                <Typography as="p" variant="muted" className="text-sm">
                                    {deliveryWindow}
                                </Typography>
                            )}
                            {option.description && (
                                <Typography as="p" variant="muted" className="mt-2 text-xs">
                                    {option.description}
                                </Typography>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
