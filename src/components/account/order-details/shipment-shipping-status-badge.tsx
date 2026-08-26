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
import { type ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { type useTranslation } from 'react-i18next';
import { formatStatusFallbackLabel, getShippingStatusConfig } from '@/lib/order/status';
import { cn } from '@/lib/utils';
import { BADGE_BASE_CLASSES } from './order-badge-shared';

export type ShipmentShippingStatusBadgeProps = {
    shippingStatus: string | undefined;
    t: ReturnType<typeof useTranslation>['t'];
};

/** Per-shipment shipping-status badge; renders nothing when there is no status to show. */
export function ShipmentShippingStatusBadge({
    shippingStatus,
    t,
}: ShipmentShippingStatusBadgeProps): ReactElement | null {
    const trimmed = shippingStatus?.trim() ?? '';
    const config = getShippingStatusConfig(shippingStatus);
    if (!config && !trimmed) {
        return null;
    }
    return (
        <Badge
            data-testid="shipping-status-badge"
            className={cn(BADGE_BASE_CLASSES, config?.className ?? 'border-transparent bg-muted text-foreground')}>
            {config ? t(config.labelKey) : formatStatusFallbackLabel(trimmed)}
        </Badge>
    );
}

export default ShipmentShippingStatusBadge;
