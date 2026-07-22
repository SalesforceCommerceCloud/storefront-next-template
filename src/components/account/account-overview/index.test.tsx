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

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import AccountOverview from './index';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';

vi.mock('@/providers/auth', () => ({
    useAuth: () => ({ customerId: 'test-customer-id' }),
}));

vi.mock('@/hooks/use-scapi-action-data', () => ({
    useScapiActionData: vi.fn(() => null),
}));

describe('AccountOverview', () => {
    const mockCustomer = {
        customerId: 'test-customer-id',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
    };

    const defaultMockLocale =
        mockSiteObject.supportedLocales.find((l) => l.id === mockSiteObject.defaultLocale) ??
        mockSiteObject.supportedLocales[0];

    const renderWithRouter = (component: React.ReactElement) => {
        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: (
                        <ConfigProvider config={mockConfig}>
                            <SiteProvider
                                site={mockSiteObject}
                                locale={defaultMockLocale}
                                language={mockSiteObject.defaultLocale}
                                currency={mockSiteObject.defaultCurrency}>
                                {component}
                            </SiteProvider>
                        </ConfigProvider>
                    ),
                },
            ],
            { initialEntries: ['/'] }
        );
        return render(<RouterProvider router={router} />);
    };

    describe('Heading structure', () => {
        test('quick link labels are not rendered as headings', () => {
            renderWithRouter(<AccountOverview customer={mockCustomer} />);

            // Quick link labels should not be headings
            expect(screen.queryByRole('heading', { name: /address book/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: /payment methods/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: /order history/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: /wishlist/i })).not.toBeInTheDocument();

            // But the section title should be a heading
            expect(screen.getByRole('heading', { name: /quick links/i })).toBeInTheDocument();
        });
    });
});
