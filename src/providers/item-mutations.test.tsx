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
import { memo, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useFetcher } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import BasketProvider, { useBasketReset, useBasketUpdater } from './basket';
import { useInlineCartQuantity } from '@/hooks/use-inline-cart-quantity';
import { resourceRoutes } from '@/route-paths';
import type { ShopperBasketsV2 } from '@/scapi';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/components/toast', () => ({ useToast: () => ({ addToast: toast }) }));
const renders = vi.fn();
const Probe = memo(function Probe({ id, name }: { id: string; name: string }) {
    const state = useInlineCartQuantity({ productId: id, enabled: true });
    renders(name);
    return (
        <div>
            <output data-testid={name}>
                {state.quantityInCart}:{String(state.isUpdating)}
            </output>
            <button onClick={state.increment}>increment {name}</button>
        </div>
    );
});
function Controls({ duplicate }: { duplicate?: boolean }) {
    const [showFirst, setShowFirst] = useState(true);
    return (
        <>
            {showFirst && <Probe id="a" name="a" />}
            {duplicate && <Probe id="a" name="a-copy" />}
            <Probe id="b" name="b" />
            <button onClick={() => setShowFirst(false)}>hide first control</button>
        </>
    );
}
function ReplaceBasket() {
    const update = useBasketUpdater();
    return (
        <button
            onClick={() =>
                update({
                    basketId: 'basket-b',
                    lastModified: '2026-01-02T00:00:00.000Z',
                    productItems: [{ itemId: 'line-a', productId: 'a', quantity: 8, shipmentId: 'me' }],
                    shipments: [{ shipmentId: 'me' }],
                })
            }>
            replace basket
        </button>
    );
}
function Reset() {
    const reset = useBasketReset();
    return <button onClick={reset}>reset basket</button>;
}
function LegacyMutation() {
    const fetcher = useFetcher({ key: 'line-a-mini-cart' });
    return (
        <button
            onClick={() =>
                void fetcher.submit(
                    { itemId: 'line-a', quantity: '4' },
                    { action: resourceRoutes.cartItemUpdate, method: 'PATCH' }
                )
            }>
            mini-cart update
        </button>
    );
}
function setup(options: { duplicate?: boolean; delay?: Promise<void>; fail?: boolean } = {}) {
    let revision = 0;
    let model: ShopperBasketsV2.schemas['Basket'] = {
        basketId: 'basket-a',
        lastModified: '2026-01-01T00:00:00.000Z',
        productItems: [
            { itemId: 'line-a', productId: 'a', quantity: 1, shipmentId: 'me' },
            { itemId: 'line-b', productId: 'b', quantity: 2, shipmentId: 'me' },
        ],
        shipments: [{ shipmentId: 'me' }],
    };
    const initial = model;
    const action = vi.fn(async ({ request }: { request: Request }) => {
        const data = await request.formData();
        if (options.delay) await options.delay;
        if (options.fail) return { success: false, error: { code: 'OUT_OF_STOCK', message: 'Unavailable' } };
        revision++;
        model = {
            ...model,
            lastModified: `2026-01-01T00:00:${String(revision).padStart(2, '0')}.000Z`,
            productItems: (model.productItems ?? []).map((item) =>
                item.itemId === data.get('itemId') ? { ...item, quantity: Number(data.get('quantity')) } : item
            ),
        };
        return { success: true, basket: model };
    });
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <ConfigProvider
                    config={{
                        ...mockConfig,
                        pages: { ...mockConfig.pages, cart: { ...mockConfig.pages.cart, quantityUpdateDebounce: 0 } },
                    }}>
                    <BasketProvider basket={initial}>
                        <Controls duplicate={options.duplicate} />
                        <ReplaceBasket />
                        <Reset />
                        <LegacyMutation />
                    </BasketProvider>
                </ConfigProvider>
            ),
        },
        { path: resourceRoutes.cartItemUpdate, action },
    ]);
    render(<RouterProvider router={router} />);
    return { router, action };
}
beforeEach(() => {
    renders.mockClear();
    toast.mockClear();
    document.cookie = '__sfdc_basket=; Max-Age=0; path=/';
});
test('native quantity mutations update duplicate controls without rendering unrelated products', async () => {
    setup({ duplicate: true });
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('1:false'));
    renders.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'increment a' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('2:false'));
    await waitFor(() => expect(screen.getByTestId('a-copy')).toHaveTextContent('2:false'));
    expect(renders.mock.calls.filter(([name]) => name === 'b')).toHaveLength(0);
});
test('pending state tracks native mini-cart mutations for the matching item only', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => {
        release = resolve;
    });
    setup({ delay });
    await waitFor(() => expect(screen.getByTestId('b')).toHaveTextContent('2:false'));
    renders.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'mini-cart update' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('1:true'));
    expect(screen.getByTestId('b')).toHaveTextContent('2:false');
    expect(renders.mock.calls.filter(([name]) => name === 'b')).toHaveLength(0);
    await act(async () => {
        release();
        await delay;
    });
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('1:false'));
});
test('reset drops in-flight item results so an old basket cannot repopulate controls', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => {
        release = resolve;
    });
    setup({ delay });
    fireEvent.click(await screen.findByRole('button', { name: 'increment a' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('2:true'));
    fireEvent.click(screen.getByRole('button', { name: 'reset basket' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('0:false'));
    await act(async () => {
        release();
        await delay;
    });
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('0:false'));
});

test('independent item requests both settle and publish their basket changes', async () => {
    const { action } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'increment a' }));
    fireEvent.click(screen.getByRole('button', { name: 'increment b' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('2:false'));
    await waitFor(() => expect(screen.getByTestId('b')).toHaveTextContent('3:false'));
});
test('a rejected quantity rolls back only the initiating product', async () => {
    setup({ fail: true });
    renders.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'increment a' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), 'error'));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('1:false'));
    expect(renders.mock.calls.filter(([name]) => name === 'b')).toHaveLength(0);
});

test('retains a shared native handle when its initiating copy unmounts in flight', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => {
        release = resolve;
    });
    setup({ duplicate: true, delay });
    fireEvent.click(await screen.findByRole('button', { name: 'increment a' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('2:true'));
    fireEvent.click(screen.getByRole('button', { name: 'hide first control' }));
    await act(async () => {
        release();
        await delay;
    });
    await waitFor(() => expect(screen.getByTestId('a-copy')).toHaveTextContent('2:false'));
    expect(screen.queryByTestId('a')).not.toBeInTheDocument();
});
test('a basket handoff cannot reuse a previous native response even if a line id is reused', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => {
        release = resolve;
    });
    setup({ delay });
    fireEvent.click(await screen.findByRole('button', { name: 'increment a' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('2:true'));
    fireEvent.click(screen.getByRole('button', { name: 'replace basket' }));
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent(/^8:/));
    await act(async () => {
        release();
        await delay;
    });
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('8:false'));
});
