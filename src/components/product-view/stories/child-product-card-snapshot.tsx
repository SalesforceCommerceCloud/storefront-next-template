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
import { composeStories } from '@storybook/react-vite';
import * as ChildProductCardStories from './child-product-card.stories';
import { render, cleanup, waitFor } from '@testing-library/react';

// Mock useItemFetcher
vi.mock('@/hooks/use-item-fetcher', () => ({
    useItemFetcherLoading: () => false,
    useItemFetcher: () => ({ Form: (props: any) => <form {...props} />, state: 'idle', submit: vi.fn() }),
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

const composed = composeStories(ChildProductCardStories);

afterEach(() => {
    cleanup();
});

describe('ChildProductCard stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, async () => {
            const { container } = render(<Story />);
            // Assert the reserved fallback before the lazy gallery resolves, then snapshot the shopper-visible gallery.
            expect(container.querySelector('div[aria-hidden="true"].h-full.w-full.bg-muted')).toBeInTheDocument();
            // Snapshot the shopper-visible gallery after its lazy chunk resolves.
            await waitFor(() => {
                expect(container.querySelector('[data-gallery-hero]')).toBeInTheDocument();
            });
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
