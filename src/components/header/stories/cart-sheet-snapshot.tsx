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
import { vi, expect, test, describe, afterEach, beforeEach } from 'vitest';
import type React from 'react';

// Suppress Radix UI Dialog accessibility warnings (intentional for snapshot testing)
// oxlint-disable-next-line no-console
const originalWarn = console.warn;
beforeEach(() => {
    // oxlint-disable-next-line no-console
    console.warn = vi.fn((...args: unknown[]) => {
        const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');
        // Suppress Dialog Description warnings
        if (message.includes('Missing `Description`') && message.includes('DialogContent')) {
            return;
        }
        originalWarn(...args);
    });
});

afterEach(() => {
    // oxlint-disable-next-line no-console
    console.warn = originalWarn;
});

vi.mock('@salesforce/storefront-next-runtime/config', async () => {
    const actual = await vi.importActual('@salesforce/storefront-next-runtime/config');
    return {
        ...(actual as Record<string, unknown>),
        useConfig: () => ({
            pages: {
                cart: {
                    quantityUpdateDebounce: 500,
                    maxQuantityPerItem: 10,
                    removeAction: '/api/cart/remove',
                },
            },
        }),
    };
});

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => ({
        data: null,
        state: 'idle',

        submit: () => {},

        load: () => {},
        Form: (props: React.PropsWithChildren<Record<string, unknown>>) => <form {...props}>{props.children}</form>,
    }),
    useFetchers: () => [],

    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: (props: React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
    createMemoryRouter: vi.fn((routes) => ({ routes })),
    RouterProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

let mockBasketValue: unknown = undefined;

vi.mock('@/providers/basket', () => ({
    default: ({
        children,
        value,
        basket,
        snapshot,
    }: {
        children: React.ReactNode;
        value?: unknown;
        basket?: unknown;
        snapshot?: unknown;
    }) => {
        if (value !== undefined) {
            mockBasketValue = value;
        } else {
            mockBasketValue = { current: basket, snapshot };
        }
        return <div>{children}</div>;
    },
    useBasket: () => {
        if (mockBasketValue && typeof mockBasketValue === 'object' && 'current' in mockBasketValue) {
            return (mockBasketValue as { current?: unknown }).current;
        }
        return mockBasketValue;
    },
    useBasketSnapshot: () => {
        if (mockBasketValue && typeof mockBasketValue === 'object' && 'snapshot' in mockBasketValue) {
            return (mockBasketValue as { snapshot?: unknown }).snapshot;
        }
        return undefined;
    },
    useBasketUpdater: () => vi.fn(),
}));

vi.mock('@/hooks/mini-cart-store', () => ({
    useMiniCartStore: () => true,
    setMiniCartOpen: vi.fn(),
    markMiniCartPanelMounted: vi.fn(),
    markMiniCartPanelUnmounted: vi.fn(),
    isMiniCartPanelMounted: () => true,
}));

import { composeStories } from '@storybook/react-vite';

import * as CartSheetStories from './cart-sheet.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(CartSheetStories);

afterEach(() => {
    cleanup();
});

describe('CartSheet stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            // @ts-expect-error vitest snapshot matcher type resolution
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
