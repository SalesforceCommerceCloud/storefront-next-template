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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ConnectedInlineAddToCart from '@/components/inline-add-to-cart/connected';
import type { InlineAddToCartProps } from '@/components/inline-add-to-cart';

const { mockInlineAddToCart, mockUseInlineCartQuantity } = vi.hoisted(() => ({
    mockInlineAddToCart: vi.fn(),
    mockUseInlineCartQuantity: vi.fn(),
}));

vi.mock('@/hooks/use-inline-cart-quantity', () => ({
    useInlineCartQuantity: (props: unknown) => mockUseInlineCartQuantity(props),
}));

vi.mock('@/components/inline-add-to-cart', () => ({
    default: (props: InlineAddToCartProps) => {
        mockInlineAddToCart(props);
        return (
            <>
                <button type="button" data-testid="add" onClick={props.onAdd}>
                    Add
                </button>
                <button type="button" data-testid="increment" onClick={props.onIncrement}>
                    Increment
                </button>
                <button type="button" data-testid="decrement" onClick={props.onDecrement}>
                    Decrement
                </button>
            </>
        );
    },
}));

describe('ConnectedInlineAddToCart', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseInlineCartQuantity.mockReturnValue({
            quantityInCart: 2,
            increment: vi.fn(),
            decrement: vi.fn(),
            isUpdating: false,
            incrementDisabled: false,
            isResolvingQuantity: false,
        });
    });

    test('connects the selected basket line to the presentational control', async () => {
        const user = userEvent.setup();
        const onAdd = vi.fn();
        const increment = vi.fn();
        const decrement = vi.fn();
        mockUseInlineCartQuantity.mockReturnValue({
            quantityInCart: 2,
            increment,
            decrement,
            isUpdating: false,
            incrementDisabled: false,
            isResolvingQuantity: false,
        });

        render(
            <ConnectedInlineAddToCart
                productId="sku-a"
                storeId="store-a"
                stockLevel={5}
                maxQuantity={3}
                onAdd={onAdd}
                disabled
                productName="Harbor Crossbody Bag"
                className="pdp-cart-control"
            />
        );

        expect(mockUseInlineCartQuantity).toHaveBeenCalledWith({
            productId: 'sku-a',
            storeId: 'store-a',
            stockLevel: 5,
            maxQuantity: 3,
            enabled: true,
        });
        expect(mockInlineAddToCart).toHaveBeenCalledWith(
            expect.objectContaining({
                quantityInCart: 2,
                onAdd,
                onIncrement: increment,
                onDecrement: decrement,
                disabled: true,
                incrementDisabled: false,
                loading: false,
                resolvingQuantity: false,
                productName: 'Harbor Crossbody Bag',
                stockMessage: null,
                className: 'pdp-cart-control',
            })
        );

        await user.click(screen.getByTestId('add'));
        await user.click(screen.getByTestId('increment'));
        await user.click(screen.getByTestId('decrement'));

        expect(onAdd).toHaveBeenCalledOnce();
        expect(increment).toHaveBeenCalledOnce();
        expect(decrement).toHaveBeenCalledOnce();
    });

    test('keeps the control busy for an item mutation and supplies its stock-limit message', () => {
        mockUseInlineCartQuantity.mockReturnValue({
            quantityInCart: 3,
            increment: vi.fn(),
            decrement: vi.fn(),
            isUpdating: true,
            incrementDisabled: true,
        });

        render(<ConnectedInlineAddToCart productId="sku-a" onAdd={vi.fn()} />);

        expect(mockInlineAddToCart).toHaveBeenCalledWith(
            expect.objectContaining({
                quantityInCart: 3,
                incrementDisabled: true,
                loading: true,
                stockMessage: 'Maximum stock reached',
            })
        );
    });

    test('forwards the resolving-quantity state to the presentational control', () => {
        mockUseInlineCartQuantity.mockReturnValue({
            quantityInCart: 0,
            increment: vi.fn(),
            decrement: vi.fn(),
            isUpdating: false,
            incrementDisabled: false,
            isResolvingQuantity: true,
        });

        render(<ConnectedInlineAddToCart productId="sku-a" onAdd={vi.fn()} />);

        expect(mockInlineAddToCart).toHaveBeenCalledWith(expect.objectContaining({ resolvingQuantity: true }));
    });
});
