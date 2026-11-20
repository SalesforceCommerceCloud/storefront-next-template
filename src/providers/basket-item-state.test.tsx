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
import { memo } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { BasketProviderValue } from './basket';
import { BasketItemStateProvider } from '@/providers/basket-item-state';
import { useBasketItemState } from '@/hooks/use-basket-item-state';

const load = vi.fn();
const renders = vi.fn();
const Probe = memo(function Probe({ productId, storeId }: { productId: string; storeId?: string }) {
    const state = useBasketItemState(productId, storeId, true, load);
    renders(productId, storeId);
    return (
        <output
            data-testid={`${productId}-${storeId ?? 'delivery'}`}>{`${state.basketId}:${state.itemId}:${state.quantity}:${state.hasBasket}`}</output>
    );
});
function value(a: number, b: number, basketId = 'basket-a') {
    return {
        current: {
            basketId,
            productItems: [
                { itemId: 'line-a', productId: 'a', quantity: a, shipmentId: 'me' },
                { itemId: 'line-b', productId: 'b', quantity: b, shipmentId: 'me' },
                { itemId: 'pickup-a', productId: 'a', quantity: 8, shipmentId: 'pickup' },
            ],
            shipments: [{ shipmentId: 'me' }, { shipmentId: 'pickup', c_fromStoreId: 'store-1' }],
        },
        snapshot: { basketId, totalItemCount: a + b + 8, uniqueProductCount: 3, lastModified: '' },
        hydrated: true,
        error: null,
    } satisfies BasketProviderValue;
}
describe('basket item subscriptions', () => {
    test('updates duplicate SKU controls and isolates unrelated SKU, fulfillment and snapshot totals', () => {
        const children = (
            <>
                <Probe productId="a" />
                <Probe productId="a" />
                <Probe productId="b" />
                <Probe productId="a" storeId="store-1" />
            </>
        );
        const { rerender } = render(<BasketItemStateProvider value={value(1, 2)}>{children}</BasketItemStateProvider>);
        renders.mockClear();
        rerender(<BasketItemStateProvider value={value(3, 2)}>{children}</BasketItemStateProvider>);
        expect(screen.getAllByTestId('a-delivery').every((node) => node.textContent === 'basket-a:line-a:3:true')).toBe(
            true
        );
        expect(renders.mock.calls).toEqual([
            ['a', undefined],
            ['a', undefined],
        ]);
        renders.mockClear();
        const same = value(3, 2);
        same.snapshot = { ...same.snapshot, totalItemCount: 99 };
        rerender(<BasketItemStateProvider value={same}>{children}</BasketItemStateProvider>);
        expect(renders).not.toHaveBeenCalled();
    });
    test('hides the previous basket while a different basket id hydrates and preserves retry errors', () => {
        const children = <Probe productId="a" />;
        const { rerender } = render(<BasketItemStateProvider value={value(3, 2)}>{children}</BasketItemStateProvider>);
        load.mockClear();
        const changed = { ...value(3, 2), snapshot: { ...value(3, 2).snapshot, basketId: 'basket-b' } };
        rerender(<BasketItemStateProvider value={changed}>{children}</BasketItemStateProvider>);
        expect(screen.getByTestId('a-delivery')).toHaveTextContent('basket-b:undefined:0:false');
        expect(load).toHaveBeenCalledOnce();
        rerender(<BasketItemStateProvider value={value(9, 1, 'basket-b')}>{children}</BasketItemStateProvider>);
        expect(screen.getByTestId('a-delivery')).toHaveTextContent('basket-b:line-a:9:true');
        rerender(
            <BasketItemStateProvider value={{ hydrated: false, error: null }}>{children}</BasketItemStateProvider>
        );
        expect(screen.getByTestId('a-delivery')).toHaveTextContent('undefined:undefined:0:false');
    });
    test('uses request-local SSR state without sharing a previous request', () => {
        const markup = (quantity: number) =>
            renderToString(
                <BasketItemStateProvider value={value(quantity, 0)}>
                    <Probe productId="a" />
                </BasketItemStateProvider>
            );
        expect(markup(2)).toContain('basket-a:line-a:2:true');
        expect(markup(9)).toContain('basket-a:line-a:9:true');
        expect(markup(2)).not.toContain('line-a:9');
    });
});
