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
import i18n from 'i18next';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { setShopperCityId } from '@/lib/delivery-promise';
import { CitySelector } from './city-selector';
import { OrderDeliveries } from './order-deliveries';
import { ProductAvailabilitySummary } from './availability-summary';
import { ProductDeliveryInfo } from './product-delivery-info';
import { formatDeliveryDate } from './use-delivery-format';

const dateLabel = (isoDate: string) => formatDeliveryDate(isoDate, i18n.language);

// Stocked in a single hub each (see data/simplified_city_management.json).
const TBILISI_ONLY = 'DU-893268';
const BATUMI_ONLY = 'DU-893259';

// Monday 5 Jan 2026
const TODAY = new Date(2026, 0, 5);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
    act(() => setShopperCityId('TBS'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('CitySelector', () => {
    test('defaults to Tbilisi and lists every city', () => {
        render(<CitySelector />);
        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('TBS');
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'Tbilisi',
            'Batumi',
            'Kutaisi',
        ]);
    });

    test('persists the selection in a cookie', () => {
        render(<CitySelector />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BUS' } });
        expect(document.cookie).toContain('sf_shopper_city=BUS');
    });
});

describe('selected city drives the delivery promise', () => {
    test('PDP: a Batumi shopper is measured from Batumi, not Tbilisi', () => {
        render(
            <>
                <CitySelector />
                <ProductDeliveryInfo productId={BATUMI_ONLY} />
            </>
        );
        // Tbilisi shopper: Batumi hub is 370 km / 4 days away.
        expect(screen.getByTestId('hub-availability-HUB-BUS')).toHaveTextContent('370 km');
        expect(screen.getByTestId('product-delivery-info')).toHaveTextContent(
            `Delivery by ${dateLabel('2026-01-09')} from Batumi`
        );

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'BUS' } });
        expect(screen.getByTestId('hub-availability-HUB-BUS')).toHaveTextContent('10 km');
        expect(screen.getByTestId('product-delivery-info')).toHaveTextContent(
            `Delivery by ${dateLabel('2026-01-06')} from Batumi`
        );
    });

    test('PDP: only hubs that hold stock are listed', () => {
        render(<ProductDeliveryInfo productId={TBILISI_ONLY} />);
        expect(screen.queryByTestId('hub-availability-HUB-BUS')).not.toBeInTheDocument();
        expect(screen.queryByTestId('hub-availability-HUB-KUT')).not.toBeInTheDocument();
        expect(screen.getByTestId('hub-availability-HUB-TBS')).toHaveTextContent('Delivery by');
    });

    test('PLP: shows the date and hub for the selected city', () => {
        render(<ProductAvailabilitySummary productId={TBILISI_ONLY} />);
        expect(screen.getByTestId('fulfillment-availability')).toHaveTextContent(
            `Delivery by ${dateLabel('2026-01-06')} from Tbilisi`
        );
    });

    test('renders nothing for a product without fulfillment data', () => {
        render(
            <>
                <ProductAvailabilitySummary productId="UNKNOWN" />
                <ProductDeliveryInfo productId="UNKNOWN" />
            </>
        );
        expect(screen.queryByTestId('fulfillment-availability')).not.toBeInTheDocument();
        expect(screen.queryByTestId('product-delivery-info')).not.toBeInTheDocument();
    });
});

describe('OrderDeliveries (confirmation)', () => {
    const items = [
        { itemId: 'a', productId: TBILISI_ONLY, productName: 'Pullover', quantity: 1 },
        { itemId: 'b', productId: BATUMI_ONLY, productName: 'Shirt', quantity: 2 },
    ];

    test('shows each delivery with its items, date and a deterministic tracking number', () => {
        const { unmount } = render(<OrderDeliveries orderNo="ORD-1" items={items} />);
        expect(screen.getByTestId('order-delivery-delivery-1')).toHaveTextContent('Pullover × 1');
        expect(screen.getByTestId('order-delivery-delivery-2')).toHaveTextContent('Shirt × 2');
        const first = screen.getByTestId('tracking-delivery-1').textContent;
        expect(first).toMatch(/^DRS-TBS-\d{8}$/);
        expect(screen.getByTestId('tracking-delivery-2').textContent).toMatch(/^DRS-BUS-\d{8}$/);
        unmount();

        render(<OrderDeliveries orderNo="ORD-1" items={items} />);
        expect(screen.getByTestId('tracking-delivery-1').textContent).toBe(first);
    });

    test('renders nothing when no line has hub stock data', () => {
        render(
            <OrderDeliveries
                orderNo="ORD-1"
                items={[{ itemId: 'x', productId: 'UNKNOWN', productName: 'Mystery', quantity: 1 }]}
            />
        );
        expect(screen.queryByTestId('order-deliveries')).not.toBeInTheDocument();
    });
});
