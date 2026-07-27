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
import type { ReactNode } from 'react';

type MockFormProps = React.PropsWithChildren<Record<string, unknown>>;
type MockLinkProps = React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>;

const fetcherMock = {
    data: null,
    state: 'idle',

    submit: () => {},
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    createCookie: vi.fn().mockImplementation((name) => ({ name, parse: vi.fn(), serialize: vi.fn() })),
    useFetcher: () => fetcherMock,
    useFetchers: () => [],
    useMatches: () => [{ id: 'root', pathname: '/', params: {}, handle: {} }],

    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    // Add missing Form component
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
    // Add missing createMemoryRouter
    createMemoryRouter: vi.fn().mockImplementation(() => ({
        navigate: vi.fn(),
        state: { location: { pathname: '/', search: '', hash: '', state: null } },
    })),
    Await: ({ children }: { resolve: Promise<unknown>; children: (data: unknown) => ReactNode }) =>
        children([]),
    Link: (props: MockLinkProps) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
    // Synthesize Await's resolved value so the snapshot captures the
    // empty-state baseline instead of the suspended fallback.
    Await: ({ children }: { resolve: Promise<unknown>; children: (data: unknown) => ReactNode }) =>
        children([]),
}));
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: () => {},
    }),
}));
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (selector: (store: unknown) => unknown) => {
        const mockStore = {
            selectedStoreInfo: null,
            setSelectedStoreInfo: vi.fn(),
        };
        return selector(mockStore);
    },
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
            language: mockSiteObject.defaultLocale,
            currency: mockSiteObject.defaultCurrency,
        })),
    };
});

import { composeStories } from '@storybook/react-vite';

import * as HeaderStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockSiteObject } from '@/test-utils/config';

const composed = composeStories(HeaderStories);

afterEach(() => {
    cleanup();
});

describe('Header stories snapshot', () => {
    const snapshotStories = Object.entries(composed).filter(
        ([, Story]) => Story?.parameters?.snapshot !== false
    );

    if (snapshotStories.length === 0) {
        // Every story opted out (e.g., they mount a Suspense/Await tree the harness's
        // vi.mock can't pass through). Vitest fails an empty suite, so register one
        // no-op assertion. Interaction + a11y suites cover these stories.
        test('all stories opt out of snapshot (covered by interaction/a11y)', () => {
            expect(snapshotStories).toEqual([]);
        });
        return;
    }

    for (const [storyName, Story] of snapshotStories) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <ConfigProvider config={mockConfig}>
                    <Story />
                </ConfigProvider>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
