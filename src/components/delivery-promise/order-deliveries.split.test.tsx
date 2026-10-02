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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { buildDeliverySplit, hasDeliveryData, setShopperCityId } from '@/lib/delivery-promise';
import { OrderDeliveries } from './order-deliveries';
import { formatDeliveryDate } from './use-delivery-format';

const dateLabel = (isoDate: string) => formatDeliveryDate(isoDate, i18n.language);

const items = [
    { itemId: 'a1', productId: 'DU-879242-M', productName: 'Polo', quantity: 1 }, // Batumi hub
    { itemId: 'b2', productId: 'DU-879251-S', productName: 'Shirt', quantity: 2 }, // Tbilisi hub
];
const PLACED = new Date(2026, 9, 1);
const saved = buildDeliverySplit(items, 'BUS', { today: PLACED, trackingSeed: 'basket-1', hasDeliveryData });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
    vi.useRealTimers();
});

describe('OrderDeliveries with a saved split', () => {
    test('shows the saved deliveries, dates and tracking numbers', () => {
        vi.setSystemTime(PLACED);
        act(() => setShopperCityId('BUS'));
        render(<OrderDeliveries orderNo="ORD-1" items={items} split={saved} />);

        for (const delivery of saved?.deliveries ?? []) {
            const node = screen.getByTestId(`order-delivery-${delivery.id}`);
            expect(node).toHaveTextContent(dateLabel(delivery.deliveryDate));
            expect(screen.getByTestId(`tracking-${delivery.id}`)).toHaveTextContent(
                delivery.trackingNumber ?? 'missing'
            );
        }
        expect(screen.getByTestId('order-delivery-D1')).toHaveTextContent('× ');
    });

    test('does not change when the shopper switches city or a later day arrives', () => {
        vi.setSystemTime(PLACED);
        act(() => setShopperCityId('BUS'));
        const { container, unmount } = render(<OrderDeliveries orderNo="ORD-1" items={items} split={saved} />);
        const before = container.innerHTML;
        unmount();

        vi.setSystemTime(new Date(2026, 9, 20));
        act(() => setShopperCityId('KUT'));
        const again = render(<OrderDeliveries orderNo="ORD-1" items={items} split={saved} />);
        expect(again.container.innerHTML).toBe(before);
    });

    test('an order with no saved split still renders by calculating for the current city', () => {
        vi.setSystemTime(PLACED);
        act(() => setShopperCityId('BUS'));
        render(<OrderDeliveries orderNo="ORD-1" items={items} split={null} />);
        expect(screen.getByTestId('order-deliveries')).toBeInTheDocument();
        expect(screen.getByTestId('order-delivery-delivery-1')).toBeInTheDocument();
    });
});
