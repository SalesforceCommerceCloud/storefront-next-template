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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import CartSheet from './cart-sheet';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';

const mockUpdateBasket = vi.fn();
const mockSubmit = vi.fn();
const mockAddToast = vi.fn();
const mockT = (key: string) => key;
const mockI18n = { language: 'en-US' };

type MockFetcherState = {
    state: 'idle' | 'submitting' | 'loading';
    data?: BasketActionResponse;
    submit: typeof mockSubmit;
};

let currentFetcher: MockFetcherState = {
    state: 'idle',
    data: undefined,
    submit: mockSubmit,
};

let currentPathname = '/';

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: () => currentFetcher,
        useLocation: () => ({ pathname: currentPathname }),
    };
});

vi.mock('@/providers/basket', () => ({
    useBasketUpdater: () => mockUpdateBasket,
    // The mini-cart renders the sfcc.miniCart.promotions.approachingDiscounts UITarget. When an
    // extension fills that slot (via the build-time transform), its component calls useBasket().
    // Return undefined so the target renders null and CartSheet tests stay independent of it.
    useBasket: () => undefined,
}));

vi.mock('@/hooks/use-mini-cart-data', () => ({
    useMiniCartData: () => ({
        basket: {
            basketId: 'basket-1',
            productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1, productName: 'Test Product' }],
            orderTotal: 12.5,
            productTotal: 12.5,
        },
        productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1, productName: 'Test Product' }],
        productsById: {},
        isLoading: false,
        error: null,
    }),
}));

vi.mock('@/lib/cart/bonus-product-utils', () => ({
    buildBonusPromotionMap: () => new Map(),
    getAttachedBonusPromotions: () => new Map(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({
        pages: {
            cart: {
                removeAction: '/action/cart-item-remove',
                miniCart: { enableViewCartButton: false },
            },
        },
    }),
}));

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => ({ currency: 'USD' }),
}));

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: mockT,
        i18n: mockI18n,
    }),
}));

vi.mock('@/components/ui/sheet', () => ({
    Sheet: ({ children }: PropsWithChildren) => <div>{children}</div>,
    SheetTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
    SheetContent: ({
        children,
        onOpenAutoFocus: _onOpenAutoFocus,
        ...props
    }: PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    SheetHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
    SheetTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
    SheetFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
    SheetClose: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
        <button {...props}>{children}</button>
    ),
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick }: PropsWithChildren<{ onClick?: () => void }>) => (
        <button onClick={onClick}>{children}</button>
    ),
}));

vi.mock('@/components/ui/separator', () => ({
    Separator: () => <hr />,
}));

vi.mock('@/components/link', () => ({
    Link: ({
        children,
        onClick,
        ...rest
    }: PropsWithChildren<{ onClick?: (e: { preventDefault: () => void }) => void }>) => (
        <a
            href="#"
            {...rest}
            onClick={(e) => {
                e.preventDefault();
                onClick?.(e);
            }}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/cart/mini-cart-item', () => ({
    default: ({ product, onRemove }: { product: { productName?: string }; onRemove: () => void }) => (
        <div>
            <div>{product.productName}</div>
            <button onClick={onRemove}>remove-item</button>
        </div>
    ),
}));

vi.mock('@/components/cart/select-bonus-products-card', () => ({
    default: () => null,
}));

describe('CartSheet remove flow', () => {
    const renderCartSheet = () =>
        render(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

    beforeEach(() => {
        vi.clearAllMocks();
        currentFetcher = {
            state: 'idle',
            data: undefined,
            submit: mockSubmit,
        };
        currentPathname = '/';
        // The panel renders only while the mini-cart store reports open; open it for the remove-flow cases.
        setMiniCartOpen(true);
    });

    afterEach(() => {
        // Module-scoped store — reset so an open state can't leak into other suites.
        setMiniCartOpen(false);
    });

    it('updates basket context from remove action response', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        await user.click(screen.getByRole('button', { name: 'remove-item' }));

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockUpdateBasket).not.toHaveBeenCalled();

        currentFetcher = {
            state: 'idle',
            data: {
                success: true,
                basket: {
                    basketId: 'basket-1',
                    productItems: [],
                },
            },
            submit: mockSubmit,
        };

        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(mockUpdateBasket).toHaveBeenCalledWith({
            basketId: 'basket-1',
            productItems: [],
        });
        expect(mockAddToast).toHaveBeenCalledWith('success', 'success');
    });

    it('shows an error toast and does not update basket on failed remove', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        await user.click(screen.getByRole('button', { name: 'remove-item' }));
        expect(mockSubmit).toHaveBeenCalledTimes(1);

        currentFetcher = {
            state: 'idle',
            data: { success: false },
            submit: mockSubmit,
        };

        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(mockUpdateBasket).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith('failed', 'error');
    });

    it('does not update basket when remove succeeds without basket payload', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        await user.click(screen.getByRole('button', { name: 'remove-item' }));
        expect(mockSubmit).toHaveBeenCalledTimes(1);

        currentFetcher = {
            state: 'idle',
            data: { success: true },
            submit: mockSubmit,
        };

        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(mockUpdateBasket).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith('success', 'success');
    });

    it('does not duplicate remove toast on idle rerender with same response object', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        await user.click(screen.getByRole('button', { name: 'remove-item' }));

        const settledResponse: BasketActionResponse = {
            success: true,
            basket: {
                basketId: 'basket-1',
                productItems: [],
            },
        };

        currentFetcher = {
            state: 'idle',
            data: settledResponse,
            submit: mockSubmit,
        };
        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        const toastCallsAfterFirstSettledRender = mockAddToast.mock.calls.length;
        const basketCallsAfterFirstSettledRender = mockUpdateBasket.mock.calls.length;
        expect(toastCallsAfterFirstSettledRender).toBeGreaterThan(0);
        expect(basketCallsAfterFirstSettledRender).toBeGreaterThan(0);

        // Same settled state object, additional render pass should not fire effect again.
        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(mockAddToast.mock.calls.length).toBe(toastCallsAfterFirstSettledRender);
        expect(mockUpdateBasket.mock.calls.length).toBe(basketCallsAfterFirstSettledRender);
    });

    it('shows loading and disables checkout link while remove request is in flight', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        expect(screen.getByText('Test Product')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'remove-item' }));
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Test Product')).not.toBeVisible();

        currentFetcher = {
            state: 'submitting',
            data: undefined,
            submit: mockSubmit,
        };

        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(screen.getAllByText('loading')).toHaveLength(2);
        const checkoutLink = screen.getByRole('link', { name: /checkout/i });
        expect(checkoutLink).toHaveAttribute('aria-disabled', 'true');
        expect(checkoutLink).toHaveClass('pointer-events-none');
    });

    it('restores optimistically hidden item when remove fails', async () => {
        const user = userEvent.setup();
        const { rerender } = renderCartSheet();

        expect(screen.getByText('Test Product')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'remove-item' }));
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Test Product')).not.toBeVisible();

        currentFetcher = {
            state: 'idle',
            data: { success: false },
            submit: mockSubmit,
        };

        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

        expect(screen.getByText('Test Product')).toBeVisible();
        expect(mockAddToast).toHaveBeenCalledWith('failed', 'error');
    });
});

describe('CartSheet navigation behavior', () => {
    const renderCartSheet = () =>
        render(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );

    beforeEach(() => {
        vi.clearAllMocks();
        currentFetcher = { state: 'idle', data: undefined, submit: mockSubmit };
        currentPathname = '/';
    });

    afterEach(() => {
        // Module-scoped store; wrap the reset in act() because a subscriber from the just-finished test is still
        // mounted until RTL's auto-cleanup, so the notify would otherwise fire outside act.
        act(() => {
            setMiniCartOpen(false);
        });
    });

    it('closes the open flyout when the pathname changes', () => {
        // The layout effect compares the previous pathname against the current one and closes the flyout on a real
        // navigation so the mini cart never lingers across page transitions. With the store open, the data panel
        // renders (its content is visible); a rerender at a new pathname must flip the store closed so the panel
        // unmounts. (useMiniCartData is mocked here, so the panel's presence — not the store's panelMounted flag — is
        // the observable signal.)
        act(() => {
            setMiniCartOpen(true);
        });
        const { rerender } = renderCartSheet();

        expect(screen.getByText('Test Product')).toBeInTheDocument();

        currentPathname = '/checkout';
        act(() => {
            rerender(
                <CartSheet>
                    <button>open-mini-cart</button>
                </CartSheet>
            );
        });

        expect(screen.queryByText('Test Product')).not.toBeInTheDocument();
    });

    it('keeps the flyout open when a rerender does not change the pathname', () => {
        // Guard the ref comparison: a rerender at the same pathname must not close an open flyout, otherwise unrelated
        // state changes would dismiss the mini cart.
        act(() => {
            setMiniCartOpen(true);
        });
        const { rerender } = renderCartSheet();

        expect(screen.getByText('Test Product')).toBeInTheDocument();

        act(() => {
            rerender(
                <CartSheet>
                    <button>open-mini-cart</button>
                </CartSheet>
            );
        });

        expect(screen.getByText('Test Product')).toBeInTheDocument();
    });

    it('does not render the panel while the store reports closed', () => {
        // The panel is gated on the store's open slice; a closed store renders only the trigger, never the data panel.
        renderCartSheet();

        expect(screen.getByText('open-mini-cart')).toBeInTheDocument();
        expect(screen.queryByText('Test Product')).not.toBeInTheDocument();
    });
});
