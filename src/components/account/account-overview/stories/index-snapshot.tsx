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
import { expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import { render, cleanup, act, within, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';

import * as AccountOverviewStories from './index.stories';

const composed = composeStories(AccountOverviewStories);
const mockLocale =
    mockSiteObject.supportedLocales.find((l) => l.id === mockSiteObject.defaultLocale) ?? mockSiteObject.supportedLocales[0];

// `<AccountOverviewOrdersAwait>` defers its content behind <Suspense> + <Await>
// until `ordersPromise` resolves. Without flushing that promise, snapshots
// capture the loading skeleton instead of the resolved DOM. For each story
// that includes the orders section, supply a query that locates a resolved-
// state DOM marker so the harness can wait for it before snapshotting.
const ORDERS_RESOLVED_MARKER: Record<string, ((c: HTMLElement) => Promise<unknown>) | undefined> = {
    Default: (c) => within(c).findByText('#INV001'),
    EmptyOrders: (c) => within(c).findByRole('link', { name: /view all/i }),
};

afterEach(() => {
    cleanup();
});

describe('AccountOverview stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, async () => {
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

            let result: RenderResult;
            await act(async () => {
                result = render(<RouterProvider router={router} />);
            });
            const { container } = result!;

            const waitForResolved = ORDERS_RESOLVED_MARKER[storyName];
            if (waitForResolved) {
                await waitForResolved(container as HTMLElement);
            }

            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
