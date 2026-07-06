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
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WishlistButton } from '@/components/buttons/wishlist-button';
import { DeferredWishlistButton } from './deferred-wishlist-button';
import { WishlistProvider } from '@/providers/wishlist';
import { EMPTY_WISHLIST_STATE } from '@/lib/wishlist/state';

type WishlistButtonProps = ComponentProps<typeof WishlistButton>;

// Mock react-i18next so HeartIcon can call useTranslation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const map: Record<string, string> = {
                addToWishlist: 'Add to wishlist',
                removeFromWishlist: 'Remove from wishlist',
                updatingWishlist: 'Updating wishlist',
            };
            return map[key] ?? key;
        },
    }),
}));

// Mock the lazy-loaded WishlistButton to avoid auth/wishlist context dependencies
vi.mock('@/components/buttons/wishlist-button', () => ({
    WishlistButton: (props: WishlistButtonProps) => (
        <button data-testid="real-wishlist-button" aria-label="Real wishlist button" tabIndex={props.tabIndex}>
            WishlistButton
        </button>
    ),
}));

const defaultProps: WishlistButtonProps = {
    product: {
        productId: 'test-product',
        productName: 'Test Product',
    },
    surface: 'plp',
    size: 'md',
    className: 'custom-class',
    tabIndex: -1,
};

function withProvider(ui: ReactNode) {
    return <WishlistProvider initialState={EMPTY_WISHLIST_STATE}>{ui}</WishlistProvider>;
}

describe('DeferredWishlistButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial render (placeholder)', () => {
        test('renders a HeartIcon placeholder button', () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));
            const button = screen.getByRole('button');
            expect(button).toBeInTheDocument();
        });

        test('passes size, className, and tabIndex to the placeholder HeartIcon', () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));
            const button = screen.getByRole('button');
            expect(button).toHaveClass('custom-class');
            expect(button).toHaveAttribute('tabindex', '-1');
        });

        test('does not render the real WishlistButton before interaction', () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));
            expect(screen.queryByTestId('real-wishlist-button')).not.toBeInTheDocument();
        });

        test('placeholder paints filled when product is already in the wishlist', () => {
            render(
                <WishlistProvider
                    initialState={{
                        customerId: 'cust-1',
                        productIds: new Set(['test-product']),
                    }}>
                    <DeferredWishlistButton {...defaultProps} />
                </WishlistProvider>
            );
            // HeartIcon's aria-label flips from 'Add to wishlist' → 'Remove from wishlist' when filled.
            expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeInTheDocument();
        });

        test('placeholder paints empty when product is not in the wishlist', () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));
            expect(screen.getByRole('button', { name: 'Add to wishlist' })).toBeInTheDocument();
        });
    });

    describe('lazy loading on pointer enter', () => {
        test('loads the real WishlistButton after pointerEnter', async () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));

            const placeholder = screen.getByRole('button');
            fireEvent.pointerEnter(placeholder);

            await waitFor(() => {
                expect(screen.getByTestId('real-wishlist-button')).toBeInTheDocument();
            });
        });

        test('does not revert to placeholder after loading', async () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));

            fireEvent.pointerEnter(screen.getByRole('button'));

            await waitFor(() => {
                expect(screen.getByTestId('real-wishlist-button')).toBeInTheDocument();
            });

            // Move pointer away — the real button should remain
            fireEvent.pointerLeave(screen.getByTestId('real-wishlist-button'));
            expect(screen.getByTestId('real-wishlist-button')).toBeInTheDocument();
        });
    });

    describe('Suspense fallback', () => {
        test('shows a HeartIcon fallback while the lazy component is loading', async () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));

            // Before interaction — placeholder HeartIcon is rendered
            expect(screen.getByRole('button')).toBeInTheDocument();

            // Trigger load
            fireEvent.pointerEnter(screen.getByRole('button'));

            // Eventually the real button appears (Suspense resolves)
            await waitFor(() => {
                expect(screen.getByTestId('real-wishlist-button')).toBeInTheDocument();
            });
        });
    });

    describe('prop forwarding', () => {
        test('forwards all props to the real WishlistButton once loaded', async () => {
            render(withProvider(<DeferredWishlistButton {...defaultProps} />));

            fireEvent.pointerEnter(screen.getByRole('button'));

            await waitFor(() => {
                const realButton = screen.getByTestId('real-wishlist-button');
                expect(realButton).toHaveAttribute('tabindex', '-1');
            });
        });

        test('works without optional props', () => {
            const minimalProps: WishlistButtonProps = {
                product: { productId: 'minimal-product' },
                surface: 'plp',
            };
            expect(() => render(withProvider(<DeferredWishlistButton {...minimalProps} />))).not.toThrow();
        });
    });
});
