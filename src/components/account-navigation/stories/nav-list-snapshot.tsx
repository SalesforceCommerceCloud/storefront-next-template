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
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type LinkProps =
    | (AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; href?: string; children?: ReactNode })
    | null;

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router');
    return {
        ...(actual as Record<string, unknown>),
        useFetcher: () => ({ data: null, state: 'idle', submit: vi.fn() }),
        useFetchers: () => [],
        useNavigate: () => vi.fn(),
        useLocation: () => ({ pathname: '/account', search: '', hash: '', state: null, key: 'test' }),
        useNavigation: () => ({
            state: 'idle',
            location: { pathname: '/account', search: '', hash: '', state: null, key: 'test' },
        }),
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
        Link: (props: LinkProps) => {
            const { to, href, children, ...rest } = (props ?? {}) as AnchorHTMLAttributes<HTMLAnchorElement> & {
                to?: string;
                href?: string;
                children?: ReactNode;
            };
            return (
                <a href={to ?? href} {...rest}>
                    {children}
                </a>
            );
        },
    };
});

import { composeStories } from '@storybook/react-vite';
import { render, cleanup } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import * as NavListStories from './nav-list.stories';

const composed = composeStories(NavListStories);
const mockLocale =
    mockSiteObject.supportedLocales.find((l) => l.id === mockSiteObject.defaultLocale) ?? mockSiteObject.supportedLocales[0];

afterEach(() => {
    cleanup();
});

describe('AccountNavList stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const router = createMemoryRouter(
                [
                    {
                        path: '/account',
                        element: (
                            <ConfigProvider config={mockConfig}>
                                <SiteProvider
                                    site={mockSiteObject}
                                    locale={mockLocale}
                                    language={mockSiteObject.defaultLocale}
                                    currency={mockSiteObject.defaultCurrency}>
                                    <Story />
                                </SiteProvider>
                            </ConfigProvider>
                        ),
                    },
                ],
                { initialEntries: ['/account'] }
            );
            const { container } = render(<RouterProvider router={router} />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
