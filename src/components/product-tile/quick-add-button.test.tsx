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
import { useEffect, type ComponentProps } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useParams } from 'react-router';
import { QuickAddButton } from './quick-add-button';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Tracks how many times the mocked modal has mounted/unmounted, so tests can assert the
// subtree is actually torn down on close rather than just visually hidden. A stuck-mounted
// modal keeps its SCAPI fetchers registered for revalidation.
const modalLifecycle = { mounts: 0, unmounts: 0 };

// Thin harness for CartItemModal — the real modal's behaviour (fetching, swatches,
// variant resolution) is covered end-to-end through ProductTile in index.test.tsx.
// Here we only need to drive the onBuyNow callback via a user interaction, and observe
// the mount/unmount lifecycle via `data-testid="modal-mounted"`.
vi.mock('@/components/cart-item-modal', () => ({
    CartItemModal: ({
        open,
        onBuyNow,
        onOpenChange,
    }: {
        open: boolean;
        onBuyNow?: () => void;
        onOpenChange?: (open: boolean) => void;
    }) => {
        useEffect(() => {
            modalLifecycle.mounts += 1;
            return () => {
                modalLifecycle.unmounts += 1;
            };
        }, []);
        return (
            <div data-testid="modal-mounted">
                {open ? (
                    <div role="dialog" aria-label="Quick add">
                        <button type="button" onClick={onBuyNow}>
                            Buy It Now
                        </button>
                        <button type="button" onClick={() => onOpenChange?.(false)}>
                            Close
                        </button>
                    </div>
                ) : null}
            </div>
        );
    },
}));

const renderButton = (props: Partial<ComponentProps<typeof QuickAddButton>> = {}) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: <QuickAddButton productId="test-product" productName="Test Product" {...props} />,
            },
            // Sink route so we can assert that navigation happened, by rendering a
            // marker that exposes the resolved URL to the DOM. The path mirrors the
            // site-prefixed URL that the project's useNavigate wrapper produces.
            {
                path: '/global/en-GB/product/:id',
                element: <PdpSink />,
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(
        <AllProvidersWrapper>
            <RouterProvider router={router} />
        </AllProvidersWrapper>
    );
};

function PdpSink() {
    const { id } = useParams();
    const { search } = useLocation();
    return (
        <div>
            PDP loaded: /global/en-GB/product/{id}
            {search}
        </div>
    );
}

describe('QuickAddButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        modalLifecycle.mounts = 0;
        modalLifecycle.unmounts = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('renders the button with the default label', () => {
        renderButton();
        expect(screen.getByRole('button', { name: /quick add test product/i })).toBeInTheDocument();
    });

    test('renders the button with a custom label', () => {
        renderButton({ label: 'Fast Add' });
        expect(screen.getByRole('button', { name: /fast add test product/i })).toBeInTheDocument();
    });

    test('clicking the button opens the quick-add dialog', async () => {
        const user = userEvent.setup();
        renderButton();

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /quick add/i }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    test('clicking Buy It Now navigates to the PDP with the selected color', async () => {
        const user = userEvent.setup();
        renderButton({ selectedColorValue: 'navy' });

        await user.click(screen.getByRole('button', { name: /quick add/i }));
        await user.click(await screen.findByRole('button', { name: /Buy It Now/i }));

        expect(
            await screen.findByText('PDP loaded: /global/en-GB/product/test-product?color=navy')
        ).toBeInTheDocument();
    });

    test('clicking Buy It Now navigates to the PDP without query when no color is selected', async () => {
        const user = userEvent.setup();
        renderButton();

        await user.click(screen.getByRole('button', { name: /quick add/i }));
        await user.click(await screen.findByRole('button', { name: /Buy It Now/i }));

        expect(await screen.findByText('PDP loaded: /global/en-GB/product/test-product')).toBeInTheDocument();
    });

    // Uses fireEvent (not userEvent) so fake timers stay in control — userEvent's internal
    // real-timer waits would deadlock against vi.useFakeTimers().
    test('unmounts the modal subtree after close so its fetchers deregister', () => {
        vi.useFakeTimers();
        renderButton();

        fireEvent.click(screen.getByRole('button', { name: /quick add/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(modalLifecycle.mounts).toBe(1);
        expect(modalLifecycle.unmounts).toBe(0);

        // Closing via the dialog's own control (backdrop/Esc/X) must eventually tear the
        // subtree down — not merely hide it — so useScapiFetcher's unmount cleanup fires.
        fireEvent.click(screen.getByRole('button', { name: /Close/i }));

        // Still mounted through the 200ms exit animation so it can finish playing.
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(modalLifecycle.unmounts).toBe(0);

        // Unmounts once the keep-alive delay (which outlasts the animation) elapses.
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(modalLifecycle.unmounts).toBe(1);
        expect(screen.queryByTestId('modal-mounted')).not.toBeInTheDocument();
    });
});
