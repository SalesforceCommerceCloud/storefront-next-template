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
import * as ChildProductsStories from './child-products.stories';
import { render, cleanup } from '@testing-library/react';

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

// BOPIS contributors use selector-based store access. Keep the selected values
// stable so the contributor registration effects do not re-register on render.
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

const composed = composeStories(ChildProductsStories);

afterEach(() => {
    cleanup();
});

describe('ChildProducts stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
