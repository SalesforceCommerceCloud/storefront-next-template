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

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockSiteObject } from '@/test-utils/config';
import { Link, NavLink } from '../index';

const mockSite = {
    id: mockSiteObject.id,
    defaultCurrency: mockSiteObject.defaultCurrency,
    defaultLocale: mockSiteObject.defaultLocale,
    supportedCurrencies: mockSiteObject.supportedCurrencies,
    supportedLocales: mockSiteObject.supportedLocales,
};

const mockLocale =
    mockSite.supportedLocales.find((l) => l.id === mockSite.defaultLocale) ?? mockSite.supportedLocales[0];

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logNavigate = action('link-navigate');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;

            const link = target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || '';
                event.preventDefault();
                logNavigate({ href, label: text });
            }
        };

        root.addEventListener('click', handleClick, true);
        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

function withProviders(Story: ComponentType, context: { args: Record<string, unknown> }) {
    const RouterWrapper = (): ReactElement => {
        const inRouter = useInRouterContext();
        const content = (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <ActionLogger>
                        <Story {...context.args} />
                    </ActionLogger>
                </SiteProvider>
            </ConfigProvider>
        );

        if (inRouter) {
            return content;
        }

        const router = createMemoryRouter(
            [
                { path: '/', element: content },
                { path: '/product/:id', element: <div>Product Page</div> },
                { path: '/category/:id', element: <div>Category Page</div> },
                { path: '/account', element: <div>Account Page</div> },
            ],
            { initialEntries: ['/'] }
        );

        return <RouterProvider router={router} />;
    };

    return <RouterWrapper />;
}

const meta: Meta<typeof Link> = {
    title: 'Core/Navigation/Link',
    component: Link,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Site-context-aware Link and NavLink components. Drop-in replacements for React Router's Link/NavLink
that automatically prepend URL prefix and append search params from Url config.

When a SiteProvider is mounted, links are rewritten with the site prefix and locale search params.
When no SiteProvider is present, they behave identically to React Router's Link/NavLink.
                `,
            },
        },
    },
    decorators: [withProviders],
};

export default meta;
type Story = StoryObj<typeof Link>;

export const Default: Story = {
    args: {
        to: '/product/123',
        children: 'View Product',
    },
    parameters: {
        docs: {
            description: {
                story: 'A Link with site context prefix applied. The href is rewritten from `/product/123` to include the site prefix.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: 'View Product' });
        await expect(link).toBeInTheDocument();
        await expect(link.getAttribute('href')).toContain('/product/123');
    },
};

export const CategoryLink: Story = {
    args: {
        to: '/category/mens',
        children: 'Shop Mens',
    },
    parameters: {
        docs: {
            description: {
                story: 'A category navigation link with site context prefix.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: 'Shop Mens' });
        await expect(link).toBeInTheDocument();
        await expect(link.getAttribute('href')).toContain('/category/mens');
    },
};

export const WithClassName: Story = {
    args: {
        to: '/account',
        children: 'My Account',
        className: 'text-primary underline hover:text-primary/80',
    },
    parameters: {
        docs: {
            description: {
                story: 'A styled Link with custom className passed through to the anchor element.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: 'My Account' });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveClass('text-primary');
    },
};

export const ExternalUrl: Story = {
    args: {
        to: 'https://www.salesforce.com',
        children: 'Salesforce',
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    parameters: {
        docs: {
            description: {
                story: 'External URLs (http/https) are passed through without site context prefix.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: 'Salesforce' });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', 'https://www.salesforce.com');
    },
};

export const AsNavLink: StoryObj<typeof NavLink> = {
    render: () => (
        <nav className="flex gap-4">
            <NavLink to="/" className={({ isActive }) => (isActive ? 'font-bold underline' : 'text-muted-foreground')}>
                Home
            </NavLink>
            <NavLink
                to="/category/womens"
                className={({ isActive }) => (isActive ? 'font-bold underline' : 'text-muted-foreground')}>
                Womens
            </NavLink>
            <NavLink
                to="/category/mens"
                className={({ isActive }) => (isActive ? 'font-bold underline' : 'text-muted-foreground')}>
                Mens
            </NavLink>
        </nav>
    ),
    parameters: {
        docs: {
            description: {
                story: 'NavLink with active state styling. The current route link gets `font-bold underline`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const links = canvas.getAllByRole('link');
        await expect(links.length).toBe(3);
    },
};
