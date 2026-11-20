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
    test('keeps compact-control focus intent when another basket render cancels the scheduled frame', async () => {
        const frames = new Map<number, FrameRequestCallback>();
        let frameId = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            frames.set(++frameId, callback);
            return frameId;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
            frames.delete(id);
        });
        const props = {
            variant: 'compact' as const,
            productName,
            onAdd: vi.fn(),
            onIncrement: vi.fn(),
            onDecrement: vi.fn(),
        };
        const { rerender } = render(<InlineAddToCart {...props} quantityInCart={0} />);
        await userEvent.click(screen.getByTestId('add-to-cart'));
        rerender(<InlineAddToCart {...props} quantityInCart={1} />);
        rerender(<InlineAddToCart {...props} quantityInCart={1} loading />);
        rerender(<InlineAddToCart {...props} quantityInCart={1} />);
        for (const callback of frames.values()) callback(0);
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toHaveFocus();
    });
    test.each([
        'default',
        'compact',
    ] as const)('does not restore stale %s focus after a quantity change settles without loading', async (variant) => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        const props = {
            variant,
            productName,
            onAdd: vi.fn(),
            onIncrement: vi.fn(),
            onDecrement: vi.fn(),
        };
        const { rerender } = render(<InlineAddToCart {...props} quantityInCart={2} />);
        await userEvent.click(screen.getByTestId('inline-add-to-cart-increment'));
        rerender(<InlineAddToCart {...props} quantityInCart={3} incrementDisabled />);
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toHaveFocus();
        // A later stock refresh enables increment, but the completed action must not move focus again.
        rerender(<InlineAddToCart {...props} quantityInCart={3} />);
        expect(screen.getByTestId('inline-add-to-cart-decrement')).toHaveFocus();
    });

    test('respects focus moved outside the control during the debounce gap', async () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        const props = {
            variant: 'compact' as const,
            productName,
            onAdd: vi.fn(),
            onIncrement: vi.fn(),
            onDecrement: vi.fn(),
        };
        const content = (loading: boolean, pendingQuantity: boolean) => (
            <>
                <InlineAddToCart {...props} quantityInCart={2} loading={loading} pendingQuantity={pendingQuantity} />
                <button type="button">Continue shopping</button>
            </>
        );
        const { rerender } = render(content(false, false));
        const user = userEvent.setup();
        await user.click(screen.getByTestId('inline-add-to-cart-increment'));
        rerender(content(false, true));
        await user.tab();
        expect(screen.getByRole('button', { name: 'Continue shopping' })).toHaveFocus();
        rerender(content(true, true));
        expect(screen.getByRole('button', { name: 'Continue shopping' })).toHaveFocus();
        rerender(content(false, false));
        expect(screen.getByRole('button', { name: 'Continue shopping' })).toHaveFocus();
    });

    test('restores compact Add focus after an optimistic removal followed by a debounced request', async () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            callback(0);
            return 1;
        });
        const props = {
            variant: 'compact' as const,
            productName,
            onAdd: vi.fn(),
            onIncrement: vi.fn(),
            onDecrement: vi.fn(),
        };
        const { rerender } = render(<InlineAddToCart {...props} quantityInCart={1} />);
        await userEvent.click(screen.getByTestId('inline-add-to-cart-decrement'));
        rerender(<InlineAddToCart {...props} quantityInCart={0} pendingQuantity />);
        expect(screen.getByTestId('add-to-cart')).toBeDisabled();
        expect(screen.getByTestId('add-to-cart').closest('[data-slot="inline-add-to-cart"]')).toHaveFocus();
        rerender(<InlineAddToCart {...props} quantityInCart={0} loading />);
        rerender(<InlineAddToCart {...props} quantityInCart={0} />);
        expect(screen.getByTestId('add-to-cart')).toHaveFocus();
    });
});

test('blocks a first add while an optimistic removal is still debounced', async () => {
    const onAdd = vi.fn();
    const props = { onAdd, onIncrement: vi.fn(), onDecrement: vi.fn(), quantityInCart: 0 };
    const { rerender } = render(<InlineAddToCart {...props} pendingQuantity />);
    const add = screen.getByTestId('add-to-cart');
    expect(add).toBeDisabled();
    await userEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
    rerender(<InlineAddToCart {...props} pendingQuantity={false} />);
    expect(add).toBeEnabled();
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
});
