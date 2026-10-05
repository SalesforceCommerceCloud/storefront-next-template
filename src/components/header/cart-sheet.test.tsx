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
const mockRegisterPendingCartMutation = vi.fn();
const mockUnregisterPendingCartMutation = vi.fn();
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

// A factory, not a shared constant: the original mock returned a brand-new object on every call, and some
// effects/memos downstream key off that per-render object identity. Keep that semantics for the default case so
// only tests that explicitly override miniCartDataFactory change behavior.
const buildDefaultMiniCartData = () => ({
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
});

let miniCartDataFactory: () => unknown = buildDefaultMiniCartData;

vi.mock('@/hooks/use-mini-cart-data', () => ({
    useMiniCartData: () => miniCartDataFactory(),
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

// Spy on the close-flush handoff plus the reclaim-on-resubmit. cart-sheet registers a pending mutation on
// close-before-settle and unregisters (reclaims the key) whenever this mounted container submits a remove.
vi.mock('@/hooks/cart-mutation-toast-store', () => ({
    registerPendingCartMutation: (...args: unknown[]) => mockRegisterPendingCartMutation(...args),
    unregisterPendingCartMutation: (...args: unknown[]) => mockUnregisterPendingCartMutation(...args),
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

describe('CartSheet remove close-flush handoff (W-24310245)', () => {
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
        setMiniCartOpen(true);
    });

    afterEach(() => {
        setMiniCartOpen(false);
    });

    it('hands the remove off to the watcher when the drawer closes before the request settles', async () => {
        const user = userEvent.setup();
        const { unmount } = renderCartSheet();

        // Shopper removes an item, then closes the mini-cart in the same beat: the request is still in flight
        // (the mocked submit never resolves), so unmounting must register the keyed fetcher for the watcher.
        await user.click(screen.getByRole('button', { name: 'remove-item' }));
        expect(mockSubmit).toHaveBeenCalledTimes(1);

        unmount();

        expect(mockRegisterPendingCartMutation).toHaveBeenCalledWith('item-1-mini-cart-remove', 'remove');
    });

    it('does not hand off when the drawer closes without a remove in flight', () => {
        const { unmount } = renderCartSheet();

        unmount();

        expect(mockRegisterPendingCartMutation).not.toHaveBeenCalled();
    });

    it('does not hand off an in-panel remove that already settled while mounted', async () => {
        const user = userEvent.setup();
        const { rerender, unmount } = renderCartSheet();

        await user.click(screen.getByRole('button', { name: 'remove-item' }));

        // Response arrives while the drawer is still open: the settled-response effect consumes the flag and
        // fires the toast in place, so a later close must not re-register the (already shown) removal.
        currentFetcher = {
            state: 'idle',
            data: { success: true, basket: { basketId: 'basket-1', productItems: [] } },
            submit: mockSubmit,
        };
        rerender(
            <CartSheet>
                <button>open-mini-cart</button>
            </CartSheet>
        );
        expect(mockAddToast).toHaveBeenCalledWith('success', 'success');

        unmount();

        expect(mockRegisterPendingCartMutation).not.toHaveBeenCalled();
    });

    it('reclaims the key from any parked handoff when it submits a remove', async () => {
        const user = userEvent.setup();
        renderCartSheet();

        // On (re)submit the mounted container reclaims its key so a still-armed watcher leaf from an earlier
        // close-flush handoff can't also fire for this response. Guards the double-toast race when a shopper
        // closes the panel mid-remove, reopens before it settles, then clicks remove again.
        await user.click(screen.getByRole('button', { name: 'remove-item' }));

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockUnregisterPendingCartMutation).toHaveBeenCalledWith('item-1-mini-cart-remove');
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

describe('CartSheet title count', () => {
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
        act(() => {
            setMiniCartOpen(true);
        });
    });

    afterEach(() => {
        miniCartDataFactory = buildDefaultMiniCartData;
        act(() => {
            setMiniCartOpen(false);
        });
    });

    it('shows the summed quantity, not the distinct line-item count, when they diverge', () => {
        // Regression guard: 3 units of the same product is one line item but the title must read
        // "My Cart (3)" to match the header badge, not "My Cart (1)".
        miniCartDataFactory = () => ({
            basket: {
                basketId: 'basket-1',
                productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 3, productName: 'Test Product' }],
                orderTotal: 37.5,
                productTotal: 37.5,
            },
            productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 3, productName: 'Test Product' }],
            productsById: {},
            isLoading: false,
            error: null,
        });

        renderCartSheet();

        // t() is mocked to return the raw key (see mockT above), so the rendered title is "cartTitle (3)".
        expect(screen.getByText('cartTitle (3)')).toBeInTheDocument();
    });
});

describe('CartSheet focus visibility (W-23325700)', () => {
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
        act(() => {
            setMiniCartOpen(true);
        });
    });

    afterEach(() => {
        act(() => {
            setMiniCartOpen(false);
        });
    });

    it('keeps the footer out of the scrollable content region so it can never overlay a focused item at high zoom', () => {
        // W-23325700 (2.4.11 Focus Not Obscured): the audit flagged the sticky footer covering
        // focused controls when the page is zoomed to 400%. The footer renders as a flex sibling
        // AFTER the `overflow-y-auto` content region, not inside it, so scrolling that region can
        // never carry a focused control underneath the footer regardless of viewport size.
        const { container } = renderCartSheet();

        const scrollRegion = container.querySelector('.overflow-y-auto');
        expect(scrollRegion).not.toBeNull();

        const checkoutLink = screen.getByRole('link', { name: /checkout/i });
        expect(scrollRegion?.contains(checkoutLink)).toBe(false);
    });
});
