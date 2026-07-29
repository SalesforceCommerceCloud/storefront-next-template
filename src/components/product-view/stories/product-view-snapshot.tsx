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
import React from 'react';
import { vi, expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import * as ProductViewStories from './product-view.stories';
import { render, cleanup } from '@testing-library/react';

// Mock useItemFetcher
vi.mock('@/hooks/use-item-fetcher', () => ({
    useItemFetcherLoading: () => false,
    useItemFetcher: () => ({ Form: (props: any) => <form {...props} />, state: 'idle', submit: vi.fn() }),
}));

// Mock ExpressPayments to avoid Suspense fallback in snapshots
vi.mock('@/components/checkout/components/express-payments', () => ({
    default: () => null, // Don't render ExpressPayments in snapshots
}));

// Mock react-router for useFetcher called directly in useProductActions
const fetcherMock = {
    data: null,
    state: 'idle',
    submit: vi.fn(),
    Form: (props: any) => <form {...props} />,
    load: vi.fn(),
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        useFetcher: () => fetcherMock,
        useFetchers: () => [],
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useNavigation: () => ({
            state: 'idle',
            location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
        }),
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
        useResolvedPath: () => ({ pathname: '/', search: '', hash: '' }),
        useHref: () => '/',
        useRouteLoaderData: () => undefined,
        Link: ({
            to,
            children,
            preventScrollReset: _preventScrollReset,
            relative: _relative,
            replace: _replace,
            state: _state,
            viewTransition: _viewTransition,
            ...rest
        }: any) => (
            <a href={to} {...rest}>
                {children}
            </a>
        ),
        NavLink: ({
            to,
            children,
            preventScrollReset: _preventScrollReset,
            relative: _relative,
            replace: _replace,
            state: _state,
            viewTransition: _viewTransition,
            ...rest
        }: any) => (
            <a href={to} {...rest}>
                {children}
            </a>
        ),
    };
});

// Mock useStoreLocator
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: () => ({
        selectedStoreInfo: null,
    }),
}));

// Mock useWishlistActions, useIsInWishlist, and useWishlistLoader
vi.mock('@/providers/wishlist', () => ({
    useWishlistActions: () => ({
        addItem: vi.fn(),
        removeItem: vi.fn(),
    }),
    useIsInWishlist: () => false,
    useWishlistLoader: () => vi.fn(),
}));

const composed = composeStories(ProductViewStories);

afterEach(() => {
    cleanup();
});

describe('ProductView stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
