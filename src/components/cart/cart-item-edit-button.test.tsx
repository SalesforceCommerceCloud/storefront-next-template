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
import { useEffect } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

// Track mounting independently from visible dialog state. A closed-but-mounted modal
// keeps its fetchers alive, so cart edit must tear down the deferred subtree after close.
const modalLifecycle = { mounts: 0, unmounts: 0 };

// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

// Components
import { CartItemEditButton } from './cart-item-edit-button';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Utils
// Mock useScapiFetcher to prevent actual API calls
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: () => ({
        load: vi.fn().mockResolvedValue(undefined),
        data: null,
        state: 'idle',
    }),
}));

vi.mock('@/components/cart-item-modal', () => ({
    CartItemModal: ({
        open,
        onOpenChange,
        product,
    }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        product: { name?: string };
    }) => {
        useEffect(() => {
            modalLifecycle.mounts += 1;
            return () => {
                modalLifecycle.unmounts += 1;
            };
        }, []);

        return (
            <div data-testid="cart-edit-modal-mounted">
                {open ? (
                    <div role="dialog" aria-label={t('editItem:title')}>
                        <span>{t('editItem:title')}</span>
                        <span>{product.name}</span>
                        <button type="button" onClick={() => onOpenChange(false)}>
                            Close
                        </button>
                    </div>
                ) : null}
            </div>
        );
    },
}));

const renderCartItemEditButton = (props: React.ComponentProps<typeof CartItemEditButton>) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <CartItemEditButton {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return { ...render(<RouterProvider router={router} />), router };
};

describe('CartItemEditButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        modalLifecycle.mounts = 0;
        modalLifecycle.unmounts = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
    });
    const mockProduct = {
        itemId: 'test-item-123',
        productId: 'test-product-456',
        name: 'Test Product',
        quantity: 2,
        price: 29.99,
        image: {
            alt: 'Test Product Image',
            src: 'test-image.jpg',
        },
        variants: [{ productId: 'test-product-456', variationValues: { color: 'black' } }],
        variationAttributes: [
            { id: 'color', name: 'Color', values: [{ name: 'Black', value: 'black', orderable: true }] },
        ],
    };

    const defaultProps = {
        product: mockProduct,
    };

    test('renders edit button with correct text and attributes', () => {
        renderCartItemEditButton(defaultProps);

        const editButton = screen.getByTestId('edit-item-test-item-123');
        expect(editButton).toHaveTextContent(t('actionCard:edit'));
        expect(editButton).toHaveAttribute('aria-label', `${t('actionCard:edit')} `);
    });

    test('applies custom className to button', () => {
        const customClassName = 'custom-edit-button';
        renderCartItemEditButton({ ...defaultProps, className: customClassName });

        const editButton = screen.getByTestId('edit-item-test-item-123');
        expect(editButton).toHaveClass(customClassName);
    });

    test('uses default empty className when not provided', () => {
        renderCartItemEditButton(defaultProps);

        // When className is not provided, it defaults to empty string
        // We can verify the button renders by getting it by testId
        screen.getByTestId('edit-item-test-item-123');
    });

    test('initially renders modal as closed', () => {
        renderCartItemEditButton(defaultProps);

        // Modal should not be visible initially
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText(t('editItem:title'))).not.toBeInTheDocument();
    });

    test('opens modal when edit button is clicked', async () => {
        const user = userEvent.setup();
        renderCartItemEditButton(defaultProps);

        const editButton = screen.getByTestId('edit-item-test-item-123');
        await user.click(editButton);

        // Modal should be visible after clicking edit button
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(t('editItem:title'))).toBeInTheDocument();
    });

    test('passes correct product data to ProductViewModal', async () => {
        const user = userEvent.setup();
        renderCartItemEditButton(defaultProps);

        const editButton = screen.getByTestId('edit-item-test-item-123');
        await user.click(editButton);

        // Verify product name is displayed in the modal
        expect(await screen.findByText(mockProduct.name)).toBeInTheDocument();
    });

    test('closes modal when close button is clicked', async () => {
        const user = userEvent.setup();
        renderCartItemEditButton(defaultProps);

        // Open modal first
        const editButton = screen.getByTestId('edit-item-test-item-123');
        await user.click(editButton);

        // Verify modal is open
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        // Close modal using the close button (X button)
        const closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);

        // Modal should be closed
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('handles multiple open/close cycles correctly', async () => {
        const user = userEvent.setup();
        renderCartItemEditButton(defaultProps);

        const editButton = screen.getByTestId('edit-item-test-item-123');

        // First cycle
        await user.click(editButton);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        let closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // Second cycle
        await user.click(editButton);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        // Get fresh reference to close button
        closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('defers mounting until edit and unmounts after the exit animation', () => {
        vi.useFakeTimers();
        renderCartItemEditButton(defaultProps);

        expect(modalLifecycle.mounts).toBe(0);
        expect(screen.queryByTestId('cart-edit-modal-mounted')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('edit-item-test-item-123'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(modalLifecycle.mounts).toBe(1);

        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(modalLifecycle.unmounts).toBe(0);

        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(modalLifecycle.unmounts).toBe(1);
        expect(screen.queryByTestId('cart-edit-modal-mounted')).not.toBeInTheDocument();
    });
});
