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
import type React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useParams } from 'react-router';
import { QuickAddButton } from './quick-add-button';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Thin harness for CartItemModal — the real modal's behaviour (fetching, swatches,
// variant resolution) is covered end-to-end through ProductTile in index.test.tsx.
// Here we only need to drive the onBuyNow callback via a user interaction.
vi.mock('@/components/cart-item-modal', () => ({
    CartItemModal: ({ open, onBuyNow }: { open: boolean; onBuyNow?: () => void }) =>
        open ? (
            <div role="dialog" aria-label="Quick add">
                <button type="button" onClick={onBuyNow}>
                    Buy It Now
                </button>
            </div>
        ) : null,
}));

const renderButton = (props: Partial<React.ComponentProps<typeof QuickAddButton>> = {}) => {
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
});
