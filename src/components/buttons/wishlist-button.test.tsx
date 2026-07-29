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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WishlistButton } from './wishlist-button';

let mockIsPending = false;
const mockToggle = vi.fn().mockResolvedValue({ success: true, data: null });
// `mockIsMember` survives as the source of truth for the per-product hook in
// these tests; toast/analytics branches read it via useIsInWishlist below.
const mockIsMember = vi.fn().mockReturnValue(false);
const mockLoad = vi.fn().mockResolvedValue(undefined);

vi.mock('@/providers/wishlist', () => ({
    useIsInWishlist: (productId: string | undefined) => (productId ? (mockIsMember(productId) as boolean) : false),
    useWishlistLoader: () => mockLoad,
    useWishlistActions: () => ({
        add: vi.fn(),
        remove: vi.fn(),
        toggle: mockToggle,
        isPending: mockIsPending,
    }),
}));

const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('../icons', () => ({
    HeartIcon: ({ isFilled, isLoading, onClick }: { isFilled: boolean; isLoading: boolean; onClick: () => void }) => (
        <button
            data-filled={isFilled}
            data-loading={isLoading}
            onClick={onClick}
            aria-label={isLoading ? 'loading' : isFilled ? 'filled' : 'empty'}>
            heart
        </button>
    ),
}));

const baseProduct = { productId: 'prod-123', productName: 'Test Shoe' } as Parameters<
    typeof WishlistButton
>[0]['product'];

describe('WishlistButton — toast UX', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsPending = false;
        mockIsMember.mockReturnValue(false);
        mockToggle.mockReset();
        mockLoad.mockClear();
    });

    test('triggers the lazy wishlist load on mount (PDP heart is visible at load)', () => {
        // The PDP heart renders immediately at load, so it kicks the once-per-session lazy read
        // itself rather than waiting on a tile intent. Idempotent (module-level guard).
        render(<WishlistButton product={baseProduct} surface="pdp" />);

        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    test('success add: shows addedToWishlist success toast', async () => {
        mockIsMember.mockReturnValue(false);
        mockToggle.mockResolvedValue({ success: true, data: null });

        render(<WishlistButton product={baseProduct} surface="pdp" />);
        await userEvent.click(screen.getByRole('button'));

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        const [message, level] = mockAddToast.mock.calls[0];
        expect(message).toBe('Added Test Shoe to wishlist.');
        expect(level).toBe('success');
    });

    test('success remove: shows removedFromWishlist success toast', async () => {
        mockIsMember.mockReturnValue(true);
        mockToggle.mockResolvedValue({ success: true, data: null });

        render(<WishlistButton product={baseProduct} surface="pdp" />);
        await userEvent.click(screen.getByRole('button'));

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        const [message, level] = mockAddToast.mock.calls[0];
        expect(message).toBe('Removed from wishlist.');
        expect(level).toBe('success');
    });

    test('failure add: shows failedToAddToWishlist error toast', async () => {
        mockIsMember.mockReturnValue(false);
        mockToggle.mockResolvedValue({ success: false, errors: ['Boom'] });

        render(<WishlistButton product={baseProduct} surface="pdp" />);
        await userEvent.click(screen.getByRole('button'));

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        const [message, level] = mockAddToast.mock.calls[0];
        expect(message).toBe('Failed to add item to wishlist.');
        expect(level).toBe('error');
    });

    test('alreadyInWishlist signal: shows alreadyInWishlist info toast', async () => {
        // wasInWishlist=false → would otherwise show addedToWishlist; the
        // alreadyInWishlist signal in result.data must take precedence.
        mockIsMember.mockReturnValue(false);
        mockToggle.mockResolvedValue({ success: true, data: { alreadyInWishlist: true } });

        render(<WishlistButton product={baseProduct} surface="pdp" />);
        await userEvent.click(screen.getByRole('button'));

        expect(mockAddToast).toHaveBeenCalledTimes(1);
        const [message, level] = mockAddToast.mock.calls[0];
        expect(message).toBe('Test Shoe is already in your wishlist.');
        expect(level).toBe('info');
    });

    test('guest click: invokes toggle directly with no auth redirect or sign-in toast', async () => {
        // Acceptance criteria: a guest clicking the heart silently adds the item to
        // their guest wishlist via the provider's toggle(). No useRequireAuth gate,
        // no "Sign in to continue" toast, no navigation. The provider's add() works
        // for guest gcid sessions because SCAPI's product-list endpoints accept guest
        // tokens; the client-side experience for guests should be indistinguishable
        // from registered users.
        mockIsMember.mockReturnValue(false);
        mockToggle.mockResolvedValue({ success: true, data: null });

        render(<WishlistButton product={baseProduct} surface="pdp" />);
        await userEvent.click(screen.getByRole('button'));

        // toggle was called with the productId — same as the registered path.
        expect(mockToggle).toHaveBeenCalledTimes(1);
        expect(mockToggle).toHaveBeenCalledWith('prod-123');
        // The success toast appears once — there is no separate "Sign in to continue" toast.
        expect(mockAddToast).toHaveBeenCalledTimes(1);
        expect(mockAddToast.mock.calls[0][0]).toBe('Added Test Shoe to wishlist.');
    });
});
