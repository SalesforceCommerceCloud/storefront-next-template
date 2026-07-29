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
import React from 'react';
import { mockSiteObject } from '@/test-utils/config';

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
    createMemoryRouter: vi.fn(),
    RouterProvider: ({ router }: { router: { routes: Array<{ element?: React.ReactNode }> } }) => (
        <div>{router.routes[0]?.element ?? null}</div>
    ),
}));
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: () => {},
    }),
}));


vi.mock('@/components/link', () => ({
    Link: (props: React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
    NavLink: (props: React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));

vi.mock('@/config', () => ({
    useConfig: () => ({
        i18n: { supportedLngs: [mockSiteObject.defaultLocale] },
        url: { showDefaults: true },
        localeAliasMap: {},
    }),
    getConfig: () => ({}),
    ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    getBadgeVariant: () => 'default',
}));

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => () => {},
}));

vi.mock('@/hooks/use-current-site-and-locale-ref', () => ({
    useCurrentSiteAndLocaleRef: () => ({ siteRef: mockSiteObject.id, localeRef: mockSiteObject.defaultLocale }),
}));

vi.mock('@/components/locale-switcher', () => ({
    default: () => <select aria-label="Select locale"><option>English (UK)</option></select>,
}));

vi.mock('@/components/currency-switcher', () => ({
    default: () => (
        <select aria-label="Select currency">
            <option>{mockSiteObject.defaultCurrency}</option>
        </select>
    ),
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

import * as FooterStories from './index.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(FooterStories);

afterEach(() => {
    cleanup();
});

describe('Footer stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        // Skip stories that have snapshot: false in their parameters
        if (Story.parameters?.snapshot === false) {
            continue;
        }
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
