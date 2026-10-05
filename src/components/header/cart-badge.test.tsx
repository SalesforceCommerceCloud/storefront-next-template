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
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import CartBadge from './cart-badge';
import { useBasketSnapshot } from '@/providers/basket';
import { useMiniCartDataLoader } from '@/hooks/use-mini-cart-data';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';

vi.mock('@/providers/basket', () => ({
    useBasketSnapshot: vi.fn(),
}));

vi.mock('@/hooks/use-mini-cart-data', () => ({
    useMiniCartDataLoader: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, options?: { count?: number }) => `My Cart (${options?.count ?? 0})`,
    }),
}));

vi.mock('./cart-sheet', () => ({
    default: ({ children }: PropsWithChildren) => <div data-testid="cart-sheet">{children}</div>,
}));

describe('CartBadge', () => {
    const mockUseBasketSnapshot = vi.mocked(useBasketSnapshot);
    const mockUseMiniCartDataLoader = vi.mocked(useMiniCartDataLoader);
    const loadMiniCartData = vi.fn();

    beforeEach(() => {
        mockUseBasketSnapshot.mockReset();
        loadMiniCartData.mockReset();
        mockUseMiniCartDataLoader.mockReturnValue(loadMiniCartData);
        // The mini-cart store is module-scoped shared state and the click handler mutates it; reset so an open state
        // can't leak from one case into the next.
        setMiniCartOpen(false);
    });

    it('renders a badge with the snapshot count', () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 2,
            uniqueProductCount: 2,
            lastModified: '',
        });

        render(<CartBadge />);

        expect(screen.getByRole('button', { name: 'My Cart (2)' })).toBeInTheDocument();
        expect(screen.getByTestId('shopping-cart-badge')).toHaveTextContent('2');
    });

    it('shows the summed quantity, not the distinct line-item count, when they diverge', () => {
        // Regression guard: 3 units of the same product is one line item (uniqueProductCount: 1)
        // but should badge as 3 (totalItemCount), not 1.
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 3,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        expect(screen.getByRole('button', { name: 'My Cart (3)' })).toBeInTheDocument();
        expect(screen.getByTestId('shopping-cart-badge')).toHaveTextContent('3');
    });

    it('defaults to zero when no snapshot is available', () => {
        mockUseBasketSnapshot.mockReturnValue(undefined);

        render(<CartBadge />);

        expect(screen.getByRole('button', { name: 'My Cart (0)' })).toBeInTheDocument();
        expect(screen.queryByTestId('shopping-cart-badge')).not.toBeInTheDocument();
    });

    it('shows the cart sheet after the first click', async () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'My Cart (1)' }));

        expect(await screen.findByTestId('cart-sheet')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'My Cart (1)' })).toBeInTheDocument();
    });

    it('mounts the cart sheet when the store opens externally without a prior click', () => {
        // Add-to-cart opens the flyout via the mini-cart store, not via the badge click. The badge must lazy-mount the
        // sheet when it observes the store already open (the `miniCartOpen && !clicked` branch), so the panel appears
        // without the shopper ever clicking the cart icon.
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });
        setMiniCartOpen(true);

        render(<CartBadge />);

        expect(screen.getByTestId('cart-sheet')).toBeInTheDocument();
    });

    it('triggers prefetch on hover without opening the cart sheet', async () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        await user.hover(screen.getByRole('button', { name: 'My Cart (1)' }));

        expect(loadMiniCartData).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('cart-sheet')).not.toBeInTheDocument();
    });

    it('triggers prefetch on keyboard focus', async () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        await user.tab();

        expect(screen.getByRole('button', { name: 'My Cart (1)' })).toHaveFocus();
        expect(loadMiniCartData).toHaveBeenCalled();
        expect(screen.queryByTestId('cart-sheet')).not.toBeInTheDocument();
    });

    it('does not prefetch when the cart is empty', async () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 0,
            uniqueProductCount: 0,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        await user.hover(screen.getByRole('button', { name: 'My Cart (0)' }));

        expect(loadMiniCartData).not.toHaveBeenCalled();
    });

    it('does not prefetch when no basketId is known', async () => {
        // Regression guard: visitors with no snapshot (e.g. fresh session, no __sfdc_basket cookie) must not trigger
        // a network call on hover. Skipping here avoids the network call entirely on low-engagement traffic.
        mockUseBasketSnapshot.mockReturnValue(undefined);

        render(<CartBadge />);

        const user = userEvent.setup();
        await user.hover(screen.getByRole('button', { name: 'My Cart (0)' }));

        expect(loadMiniCartData).not.toHaveBeenCalled();
    });

    it('keeps prefetch handlers wired after the sheet has been mounted', async () => {
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        const button = screen.getByRole('button', { name: 'My Cart (1)' });
        await user.click(button);

        // Sheet is now mounted; second hover on the post-click button should still prefetch.
        loadMiniCartData.mockClear();
        await user.hover(screen.getByRole('button', { name: 'My Cart (1)' }));

        expect(loadMiniCartData).toHaveBeenCalled();
    });

    it('triggers prefetch on focus after the sheet has been mounted', async () => {
        // Regression guard: focus-triggered prefetch must keep working after the lazy CartSheet
        // mounts so keyboard-only users still benefit from the same loading-flicker mitigation
        // as pointer users.
        mockUseBasketSnapshot.mockReturnValue({
            basketId: 'basket-123',
            totalItemCount: 1,
            uniqueProductCount: 1,
            lastModified: '',
        });

        render(<CartBadge />);

        const user = userEvent.setup();
        const button = screen.getByRole('button', { name: 'My Cart (1)' });
        await user.click(button);

        loadMiniCartData.mockClear();
        fireEvent.focus(screen.getByRole('button', { name: 'My Cart (1)' }));

        expect(loadMiniCartData).toHaveBeenCalled();
    });
});
