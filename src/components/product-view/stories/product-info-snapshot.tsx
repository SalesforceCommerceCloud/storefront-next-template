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
import { vi, expect, test, describe, afterEach } from 'vitest';

// Use partial mocks (importOriginal) so RouterProvider / createMemoryRouter
// keep their real implementations — the story decorator wraps content in a
// MemoryRouter and the previous "wholesale replacement" mock dropped the
// router subtree, producing null snapshots for every story (W-22451618).
const fetcherMock = {
    data: null,
    state: 'idle',
    submit: vi.fn(),
    Form: (props: React.PropsWithChildren<Record<string, unknown>>) => <form {...props}>{props.children}</form>,
    load: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: () => fetcherMock,
        useFetchers: () => [],
    };
});

// Avoid the toast provider — components only need a no-op `addToast`.
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: () => {} }),
}));

// BOPIS extension reads StoreLocatorProvider via `useStoreLocator`. The
// extension provider isn't part of the snapshot story decorator, so stub it.
// Selectors must receive a stable store snapshot because contributors register
// themselves from effects.
const { storeLocatorState } = vi.hoisted(() => ({
    storeLocatorState: {
        isOpen: false,
        open: () => {},
        selectedStoreInfo: null,
    },
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (selector: (state: typeof storeLocatorState) => unknown) => selector(storeLocatorState),
}));

// `useProductActions` reaches into useNavigate → useConfig and useAnalytics →
// useAuth/useSite — none of which are wired in the snapshot harness. Stub the
// hook with a shape ProductInfo consumes so the rendered DOM matches a real PDP.
vi.mock('@/hooks/product/use-product-actions', () => ({
    useProductActions: () => ({
        isAddingToOrUpdatingCart: false,
        isAddingToWishlist: false,
        canAddToCart: true,
        handleAddToCart: () => Promise.resolve(),
        handleAddToWishlist: () => Promise.resolve(),
        handleProductSetAddToCart: () => Promise.resolve(),
        handleProductBundleAddToCart: () => Promise.resolve(),
        quantity: 1,
        setQuantity: () => {},
        stockLevel: 50,
        maxQuantity: undefined,
        isOutOfStock: false,
        mode: 'add' as const,
        basketPickupStore: undefined,
    }),
}));

import { composeStories } from '@storybook/react-vite';

import * as ProductInfoStories from './product-info.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(ProductInfoStories);

afterEach(() => {
    cleanup();
});

describe('ProductInfo stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
