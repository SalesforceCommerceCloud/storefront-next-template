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
import type React from 'react';

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => ({
        data: null,
        state: 'idle',
        submit: () => {},
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
    Suspense: ({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) => (
        <div>{fallback || children}</div>
    ),
    Await: ({ resolve, children }: { resolve: Promise<unknown>; children: (data: unknown) => React.ReactNode }) => {
        // For snapshot tests, we need to handle the promise synchronously
        // Try to access resolved value if available, otherwise render with empty array
        const resolveObj = resolve as any;
        const hasValue = resolveObj && typeof resolveObj === 'object' && '_value' in resolveObj;
        if (hasValue) {
            return <>{children(resolveObj._value)}</>;
        }
        // Fallback for unresolved promises - render with the promise itself
        return <>{children([])}</>;
    },
}));

vi.mock('@/components/content-card', () => ({
    default: (props: Record<string, unknown>) => <div data-testid="content-card">{JSON.stringify(props)}</div>,
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return {
        ...actual,
        useSite: vi.fn(() => ({
            site: {
                id: mockSiteObject.id,
                defaultLocale: mockSiteObject.defaultLocale,
                defaultCurrency: mockSiteObject.defaultCurrency,
                supportedLocales: [
                    { id: mockSiteObject.defaultLocale, preferredCurrency: mockSiteObject.defaultCurrency },
                ],
                supportedCurrencies: mockSiteObject.supportedCurrencies,
            },
            locale: mockLocale,
            language: mockSiteObject.defaultLocale,
            currency: mockSiteObject.defaultCurrency,
        })),
    };
});

import { composeStories } from '@storybook/react-vite';

import * as PopularCategoriesStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import type { ReactNode } from 'react';

const composed = composeStories(PopularCategoriesStories);

const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider config={mockConfig}>{children}</ConfigProvider>
);

afterEach(() => {
    cleanup();
});

describe('PopularCategories stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        // Skip interaction test stories from snapshots
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;

        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />, { wrapper });
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
