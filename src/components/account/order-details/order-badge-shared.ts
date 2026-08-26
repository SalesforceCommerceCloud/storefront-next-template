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
import type { useTranslation } from 'react-i18next';
import type { ShopperOrders } from '@/scapi';

export const BADGE_BASE_CLASSES = 'shrink-0 font-semibold border-0 py-1 w-fit';

type ProductItem = ShopperOrders.schemas['ProductItem'];

export function groupProductItemsByShipmentId(productItems: ProductItem[]): Record<string, ProductItem[]> {
    return productItems.reduce<Record<string, ProductItem[]>>((itemsByShipmentId, item) => {
        const shipmentId = item.shipmentId ?? 'default';
        if (!itemsByShipmentId[shipmentId]) itemsByShipmentId[shipmentId] = [];
        itemsByShipmentId[shipmentId].push(item);
        return itemsByShipmentId;
    }, {});
}

export type PaymentMethodDisplay = { id: string; label: string };

export function getPaymentMethodDisplays(
    order: Partial<ShopperOrders.schemas['Order']>,
    t: ReturnType<typeof useTranslation>['t']
): PaymentMethodDisplay[] {
    const instruments = order.paymentInstruments ?? [];
    return instruments.flatMap((instrument, index) => {
        const card = instrument.paymentCard;
        if (!card?.numberLastDigits) return [];
        const id = instrument.paymentInstrumentId ?? `payment-${index}`;
        const cardType = card.cardType ?? 'Card';
        const label = t('orders.paymentMethodEndingIn', {
            cardType,
            lastDigits: card.numberLastDigits,
        });
        return [{ id, label }];
    });
}
