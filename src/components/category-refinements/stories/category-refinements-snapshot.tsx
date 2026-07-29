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
import { mockSiteObject } from '@/test-utils/config';

type MockFormProps = React.PropsWithChildren<Record<string, unknown>>;
type MockLinkProps = React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>;

const fetcherMock = {
    data: null,
    state: 'idle',

    submit: () => {},
    Form: (props: MockFormProps) => <form {...props}>{props.children}</form>,
};

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        createContext: vi.fn().mockImplementation(() => ({})),
        useFetcher: () => fetcherMock,
        useFetchers: () => [],

        useNavigate: () => () => {},
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useNavigation: () => ({
            state: 'idle',
            location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
        }),
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
        Link: (props: MockLinkProps) => {
            const { to, href, children, ...rest } = props ?? {};
            return (
                <a href={to ?? href} {...rest}>
                    {children}
                </a>
            );
        },
    };
});

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


vi.mock('@/components/link', () => ({
    Link: (props: React.PropsWithChildren<{ to?: string; [key: string]: unknown }>) => {
        const { to, children, ...rest } = props ?? {};
        return (
            <a href={typeof to === 'string' ? to : undefined} {...rest}>
                {children}
            </a>
        );
    },
    NavLink: (props: React.PropsWithChildren<{ to?: string; [key: string]: unknown }>) => {
        const { to, children, ...rest } = props ?? {};
        return (
            <a href={typeof to === 'string' ? to : undefined} {...rest}>
                {children}
            </a>
        );
    },
}));

vi.mock('@/config', () => ({
    useConfig: () => ({}),
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

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => null,
    buildUrl: ({ to }: { to: string }) => to,
    SiteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { composeStories } from '@storybook/react-vite';

import * as CategoryRefinementsStories from './index.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(CategoryRefinementsStories);

afterEach(() => {
    cleanup();
});

describe('CategoryRefinements stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
