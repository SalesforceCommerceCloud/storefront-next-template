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
import type { ShopperBasketsV2 } from '@/scapi';
import { Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@/components/typography';

interface CartTitleProps {
    basket: ShopperBasketsV2.schemas['Basket'];
    deliveryCount: number;
}

function formatShippingAddress(address: ShopperBasketsV2.schemas['OrderAddress']): string | null {
    const parts = [address.address1, address.city, address.stateCode, address.postalCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
}

export default function CartTitle({ basket, deliveryCount }: CartTitleProps): ReactElement {
    const { t } = useTranslation('cart');
    const totalCount = basket?.productItems?.reduce((acc, item) => acc + (item.quantity ?? 1), 0) ?? 0;
    const shippingAddress = basket?.shipments?.[0]?.shippingAddress;
    const formattedAddress = shippingAddress ? formatShippingAddress(shippingAddress) : null;

    return (
        <div className="flex items-center gap-2 mb-6">
            <Truck className="size-[1.125rem] text-foreground shrink-0" aria-hidden />
            <div>
                <Typography
                    variant="h5"
                    as="h2"
                    className="text-xl font-normal leading-[120%] tracking-[-0.6px] text-card-foreground">
                    {t('delivery.heading', { deliveryCount, count: totalCount })}
                </Typography>
                {formattedAddress && (
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">{formattedAddress}</p>
                )}
            </div>
        </div>
    );
}
