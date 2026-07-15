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
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { QuickLinksSection } from './index';

// QuickLinksSection renders <Link>, which reads SiteProvider via useResolvedTarget,
// so the test tree must supply the same providers the account route does in production.
const renderWithRouter = (component: React.ReactElement) => {
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
                            {component}
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/account'] }
    );

    return render(<RouterProvider router={router} />);
};

describe('QuickLinksSection', () => {
    describe('Semantic list markup', () => {
        it('renders quick links in a ul with role="list"', () => {
            renderWithRouter(<QuickLinksSection />);

            const list = screen.getByRole('list');
            expect(list).toBeInTheDocument();
            expect(list.tagName).toBe('UL');
        });

        it('renders each quick link in a li element', () => {
            renderWithRouter(<QuickLinksSection />);

            const list = screen.getByRole('list');
            const listItems = list.querySelectorAll('li');
            expect(listItems).toHaveLength(4);
        });
    });
});
