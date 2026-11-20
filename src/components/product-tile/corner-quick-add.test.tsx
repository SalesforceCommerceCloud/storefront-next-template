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
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CornerQuickAdd } from './corner-quick-add';

const mocks = vi.hoisted(() => ({
    load: vi.fn(),
    options: vi.fn(),
    add: vi.fn((_session: symbol) => Promise.resolve()),
    select: vi.fn(),
    toast: vi.fn(),
    increment: vi.fn(),
    decrement: vi.fn(),
    fetcher: { state: 'idle', success: false, data: undefined as unknown, errors: undefined as unknown },
    quantity: 0,
    resolving: false,
    canAdd: true,
    activeMutations: 0,
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => ({ currency: 'USD' }) }));
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: (...args: unknown[]) => {
        mocks.options(...args);
        return { ...mocks.fetcher, load: mocks.load };
    },
}));
vi.mock('@/hooks/product/use-product-actions', async () => {
    const { useRef, useCallback, useEffect } = await import('react');
    return {
        useProductActions: () => {
            useEffect(() => {
                mocks.activeMutations++;
                return () => {
                    mocks.activeMutations--;
                };
            }, []);
            const session = useRef(Symbol('mutation session'));
            const handleAddToCart = useCallback(() => mocks.add(session.current), []);
            return {
                handleAddToCart,
                canAddToCart: mocks.canAdd,
                isAddingToOrUpdatingCart: false,
                stockLevel: 10,
            };
        },
    };
});
vi.mock('@/hooks/use-inline-cart-quantity', () => ({
    useInlineCartQuantity: () => ({
        quantityInCart: mocks.quantity,
        increment: mocks.increment,
        decrement: mocks.decrement,
        isUpdating: false,
        incrementDisabled: false,
        isResolvingQuantity: mocks.resolving,
    }),
}));
vi.mock('@/components/toast', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
const product = {
    inventory: { stockLevel: 10, orderable: true },
    id: 'pretzels',
    name: 'Mini pretzels',
    type: { item: true },
    minOrderQuantity: 1,
    stepQuantity: 1,
};
const control = () => (
    <StrictMode>
        <CornerQuickAdd productId="pretzels" productName="Mini pretzels" onSelect={mocks.select} />
    </StrictMode>
);

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.fetcher, { state: 'idle', success: false, data: undefined, errors: undefined });
    mocks.quantity = 0;
    mocks.resolving = false;
    mocks.canAdd = true;
});

describe('corner Quick Add', () => {
    test('loads details only on interaction and adds a choice-free product exactly once', async () => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        expect(mocks.load).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button'));
        expect(mocks.load).toHaveBeenCalledOnce();
        expect(screen.getByRole('button')).toBeDisabled();
        Object.assign(mocks.fetcher, { success: true, data: product });
        rerender(control());
        rerender(control());
        expect(mocks.add).toHaveBeenCalledOnce();
        expect(mocks.select).not.toHaveBeenCalled();
    });
    test('isolates consecutive first adds from the previous mutation response', async () => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        await user.click(screen.getByRole('button'));
        Object.assign(mocks.fetcher, { success: true, data: product });
        rerender(control());
        await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
        expect(mocks.add).toHaveBeenCalledOnce();
        const firstSession = mocks.add.mock.calls[0][0];

        // After removal, a new add can wait on catalog data while the old mutation has a cached response.
        mocks.fetcher.state = 'loading';
        await user.click(screen.getByRole('button'));
        expect(mocks.add).toHaveBeenCalledOnce();
        mocks.fetcher.state = 'idle';
        rerender(control());
        await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
        expect(mocks.add.mock.calls[1][0]).not.toBe(firstSession);
    });

    test('does not repeat an add when the catalog fetcher revalidates after mutation', async () => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        await user.click(screen.getByRole('button'));
        Object.assign(mocks.fetcher, { success: true, data: product });
        rerender(control());
        mocks.fetcher.state = 'loading';
        rerender(control());
        mocks.fetcher.state = 'idle';
        rerender(control());
        expect(mocks.add).toHaveBeenCalledOnce();
    });
    test('does not add from cached product data until clicked', () => {
        Object.assign(mocks.fetcher, { success: true, data: product });
        render(control());
        expect(mocks.add).not.toHaveBeenCalled();
    });
    test.each([
        { type: { master: true } },
        { type: { variant: true } },
        { type: { bundle: true } },
        { type: { set: true } },
        { options: [{ id: 'size' }] },
        { minOrderQuantity: 2 },
        { stepQuantity: 2 },
    ])('keeps required selections in the Quick Add dialog: %j', async (overrides) => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        const trigger = screen.getByRole('button');
        await user.click(trigger);
        Object.assign(mocks.fetcher, { success: true, data: { ...product, ...overrides } });
        rerender(control());
        expect(mocks.select).toHaveBeenCalledWith(trigger);
        expect(mocks.add).not.toHaveBeenCalled();
    });
    test('does not bypass the native availability gate', async () => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        await user.click(screen.getByRole('button'));
        mocks.canAdd = false;
        Object.assign(mocks.fetcher, { success: true, data: product });
        rerender(control());
        expect(mocks.add).not.toHaveBeenCalled();
        expect(mocks.select).toHaveBeenCalledOnce();
    });
    test('allows retry after a product request fails', async () => {
        const user = userEvent.setup();
        const { rerender } = render(control());
        await user.click(screen.getByRole('button'));
        mocks.fetcher.errors = ['Unavailable'];
        rerender(control());
        expect(mocks.toast).toHaveBeenCalledOnce();
        expect(screen.getByRole('button')).toBeEnabled();
        await user.click(screen.getByRole('button'));
        expect(mocks.load).toHaveBeenCalledTimes(2);
    });
    test('uses existing basket quantity controls, including removal at one', async () => {
        mocks.quantity = 1;
        render(control());
        expect(screen.getByTestId('inline-add-to-cart-quantity')).toHaveTextContent('1');
        const user = userEvent.setup();
        await user.click(screen.getByTestId('inline-add-to-cart-increment'));
        await user.click(screen.getByTestId('inline-add-to-cart-decrement'));
        expect(mocks.increment).toHaveBeenCalledOnce();
        expect(mocks.decrement).toHaveBeenCalledOnce();
        expect(mocks.load).not.toHaveBeenCalled();
    });
    test('prevents adding before basket hydration completes', () => {
        mocks.resolving = true;
        render(control());
        expect(screen.getByRole('button')).toBeDisabled();
    });
});

test('requests catalog details in the active currency', () => {
    render(<CornerQuickAdd productId="currency-product" productName="Product" onSelect={mocks.select} />);
    expect(mocks.options).toHaveBeenLastCalledWith(
        'shopperProducts',
        'getProduct',
        expect.objectContaining({
            params: expect.objectContaining({ query: expect.objectContaining({ currency: 'USD' }) }),
        })
    );
});

test('retires the completed first-add controller', async () => {
    const user = userEvent.setup();
    const { rerender } = render(control());
    await user.click(screen.getByRole('button'));
    Object.assign(mocks.fetcher, {
        success: true,
        data: { id: 'pretzels', type: { item: true }, inventory: { stockLevel: 10, ats: 10, orderable: true } },
    });
    rerender(control());
    await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.activeMutations).toBe(0));
});
