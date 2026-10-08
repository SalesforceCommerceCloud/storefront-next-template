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
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import StoreLocatorFooter from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockAltSiteObject, mockConfig } from '@/test-utils/config';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

const defaultMockSite = mockAltSiteObject;
const defaultMockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

// Helper to render with router and necessary providers
const renderWithRouter = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={defaultMockSite}
                            locale={defaultMockLocale}
                            language={mockAltSiteObject.defaultLocale}
                            currency={mockAltSiteObject.defaultCurrency}>
                            <StoreLocatorProvider>{component}</StoreLocatorProvider>
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );
    return render(<RouterProvider router={router} />);
};

describe('StoreLocatorFooter', () => {
    it('renders Store Locator link', () => {
        renderWithRouter(<StoreLocatorFooter />);
        const link = screen.getByRole('link', { name: /store locator/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', `/${mockAltSiteObject.id}/${defaultMockLocale.id}/store-locator`);
    });

    it('has proper styling classes matching footer links', () => {
        renderWithRouter(<StoreLocatorFooter />);
        const link = screen.getByRole('link', { name: /store locator/i });
        expect(link).toHaveClass('text-sm');
        expect(link).toHaveClass('text-muted-foreground');
        expect(link).toHaveClass('hover:text-foreground');
        expect(link).toHaveClass('transition-colors');
    });
});
