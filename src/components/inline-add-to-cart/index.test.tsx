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
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import InlineAddToCart from './index';

const { t } = getTranslation();
const productName = 'Harbor Crossbody Bag';

describe('InlineAddToCart', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders the translated Add to Cart CTA and invokes the first-add callback', async () => {
        const user = userEvent.setup();
        const onAdd = vi.fn();
        render(<InlineAddToCart quantityInCart={0} onAdd={onAdd} onIncrement={vi.fn()} onDecrement={vi.fn()} />);

        const addButton = screen.getByRole('button', { name: t('product:addToCart') });
        expect(addButton).toBeEnabled();
        await user.click(addButton);

        expect(onAdd).toHaveBeenCalledOnce();
        expect(screen.queryByTestId('inline-add-to-cart')).not.toBeInTheDocument();
    });

    test('renders semantic, product-labelled increment and decrement controls for an in-cart item', async () => {
        const user = userEvent.setup();
        const onIncrement = vi.fn();
        const onDecrement = vi.fn();
        render(
            <InlineAddToCart
                quantityInCart={2}
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
            />
        );

        expect(
            screen.getByRole('group', { name: t('quantitySelector:quantityForProduct', { productName }) })
        ).toBeInTheDocument();
        expect(screen.getByTestId('inline-add-to-cart-quantity')).toHaveTextContent('2');
        expect(
            screen.getByRole('button', {
                name: t('quantitySelector:decreaseQuantityForProduct', { productName }),
            })
        ).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: t('quantitySelector:increaseQuantityForProduct', { productName }),
            })
        ).toBeEnabled();
        expect(screen.getByTestId('inline-add-to-cart-quantity')).toHaveTextContent(
            t('quantitySelector:quantityInCart', { count: 2 })
        );

        await user.click(screen.getByTestId('inline-add-to-cart-increment'));
        await user.click(screen.getByTestId('inline-add-to-cart-decrement'));

        expect(onIncrement).toHaveBeenCalledOnce();
        expect(onDecrement).toHaveBeenCalledOnce();
        expect(screen.getByRole('status')).toHaveTextContent(t('quantitySelector:quantityInCart', { count: 2 }));
    });

    test('labels decrement as removing the product when one unit remains', () => {
        render(
            <InlineAddToCart
                quantityInCart={1}
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        expect(
            screen.getByRole('button', {
                name: t('quantitySelector:removeFromCartForProduct', { productName }),
            })
        ).toBeInTheDocument();
    });

    test('moves focus to the decrement control after the first add completes', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        const onAdd = vi.fn();
        const { rerender } = render(
            <InlineAddToCart
                quantityInCart={0}
                productName={productName}
                onAdd={onAdd}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        const addButton = screen.getByTestId('add-to-cart');
        addButton.focus();
        await user.click(addButton);
        expect(onAdd).toHaveBeenCalledOnce();

        rerender(
            <InlineAddToCart
                quantityInCart={1}
                loading
                productName={productName}
                onAdd={onAdd}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );
        expect(screen.getByTestId('inline-add-to-cart').parentElement).toHaveFocus();

        rerender(
            <InlineAddToCart
                quantityInCart={1}
                productName={productName}
                onAdd={onAdd}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        expect(screen.getByTestId('inline-add-to-cart-decrement')).toHaveFocus();
    });

    test('disables only increment at the stock limit and links the visible message to it', () => {
        const stockMessage = t('quantitySelector:maxStockReached');
        render(
            <InlineAddToCart
                quantityInCart={2}
                incrementDisabled
                stockMessage={stockMessage}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        const increment = screen.getByTestId('inline-add-to-cart-increment');
        expect(increment).toBeDisabled();
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toBeEnabled();
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent(stockMessage);
        expect(status).toHaveAttribute('aria-live', 'polite');
        expect(increment).toHaveAttribute('aria-describedby', status.id);
    });

    test('disables the control and announces cart updates while a mutation is in flight', () => {
        const { container } = render(
            <InlineAddToCart quantityInCart={2} loading onAdd={vi.fn()} onIncrement={vi.fn()} onDecrement={vi.fn()} />
        );

        expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toBeDisabled();
        expect(screen.getByTestId('inline-add-to-cart-increment')).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent(t('product:updatingCart'));
    });

    test('moves focus to the transformed CTA when removing the final unit completes', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        const onDecrement = vi.fn();
        const { rerender } = render(
            <InlineAddToCart
                quantityInCart={1}
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={onDecrement}
            />
        );

        await user.click(screen.getByTestId('inline-add-to-cart-decrement'));
        rerender(
            <InlineAddToCart
                quantityInCart={0}
                loading
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={onDecrement}
            />
        );
        expect(screen.getByTestId('add-to-cart').parentElement).toHaveFocus();

        rerender(
            <InlineAddToCart
                quantityInCart={0}
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={onDecrement}
            />
        );

        expect(screen.getByTestId('add-to-cart')).toHaveFocus();
    });

    test('disables the first-add CTA while the in-cart quantity is still resolving', () => {
        const onAdd = vi.fn();
        const { container } = render(
            <InlineAddToCart
                quantityInCart={0}
                resolvingQuantity
                onAdd={onAdd}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        const addButton = screen.getByTestId('add-to-cart');
        // Disabled so a shopper who already has this SKU can't trigger a duplicate add before the
        // stepper appears, but the label stays "Add to Cart" (not the in-flight "Adding to Cart").
        expect(addButton).toBeDisabled();
        expect(addButton).toHaveTextContent(t('product:addToCart'));
        expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    });

    test('moves focus to decrement when the increment target is disabled by the general disabled prop', async () => {
        const user = userEvent.setup();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        const { rerender } = render(
            <InlineAddToCart
                quantityInCart={2}
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        await user.click(screen.getByTestId('inline-add-to-cart-increment'));
        rerender(
            <InlineAddToCart
                quantityInCart={2}
                loading
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        // Product became unpurchasable (disabled) while the increment was in flight. Increment is now
        // disabled too, so focus must land on decrement rather than fall through to <body>.
        rerender(
            <InlineAddToCart
                quantityInCart={2}
                disabled
                productName={productName}
                onAdd={vi.fn()}
                onIncrement={vi.fn()}
                onDecrement={vi.fn()}
            />
        );

        expect(screen.getByTestId('inline-add-to-cart-increment')).toBeDisabled();
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toHaveFocus();
    });
});
