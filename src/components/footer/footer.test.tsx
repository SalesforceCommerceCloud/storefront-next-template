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
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, getSitePrefix, mockSiteObject } from '@/test-utils/config';
import { SiteProvider, type Site } from '@salesforce/storefront-next-runtime/site-context';
import Footer from './index';

// Mock useLocation to control route context
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router');
    return {
        ...actual,
        useLocation: vi.fn(),
    };
});

const { useLocation } = await import('react-router');

const mockSite: Site = mockSiteObject;

const mockLocale =
    mockSite.supportedLocales.find((l) => l.id === mockSite.defaultLocale) ?? mockSite.supportedLocales[0];

// Helper function to render component with router context
const renderWithRouter = (component: React.ReactElement) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={mockConfig}>
                        <SiteProvider
                            site={mockSite}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
                            {component}
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return render(<RouterProvider router={router} />);
};

describe('Footer', () => {
    beforeEach(() => {
        // Default to homepage route for most tests
        vi.mocked(useLocation).mockReturnValue({
            pathname: '/',
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });
    });

    test('renders newsletter heading on homepage', () => {
        renderWithRouter(<Footer />);

        // Newsletter title appears as h2 in prominent section
        expect(screen.getByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).toBeInTheDocument();
    });

    test('renders social media links with correct aria-labels and hrefs', () => {
        renderWithRouter(<Footer />);

        const youtubeLink = screen.getByLabelText(t('footer:socialMedia.youtubeLabel'));
        expect(youtubeLink).toBeInTheDocument();
        expect(youtubeLink).toHaveAttribute('href', 'https://youtube.com/channel/UCSTGHqzR1Q9yAVbiS3dAFHg');

        const instagramLink = screen.getByLabelText(t('footer:socialMedia.instagramLabel'));
        expect(instagramLink).toBeInTheDocument();
        expect(instagramLink).toHaveAttribute('href', 'https://instagram.com/commercecloud');

        const xLink = screen.getByLabelText(t('footer:socialMedia.xLabel'));
        expect(xLink).toBeInTheDocument();
        expect(xLink).toHaveAttribute('href', 'https://x.com/CommerceCloud');

        const facebookLink = screen.getByLabelText(t('footer:socialMedia.facebookLabel'));
        expect(facebookLink).toBeInTheDocument();
        expect(facebookLink).toHaveAttribute('href', 'https://facebook.com/CommerceCloud/');
    });

    test('renders newsletter section with signup form', () => {
        renderWithRouter(<Footer />);

        // Check for newsletter title and description
        expect(screen.getByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).toBeInTheDocument();
        expect(screen.getByText(t('footer:newsletter.description'))).toBeInTheDocument();

        // Check for Signup form elements
        expect(screen.getByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('footer:newsletter.subscribeButton') })).toBeInTheDocument();
    });

    test('renders all selectors, Locale and Currency Switcher', () => {
        renderWithRouter(<Footer />);

        // Check for Locale and Currency switchers
        const selectors = screen.getAllByRole('combobox');
        expect(selectors).toHaveLength(2);
    });

    test('renders LocaleSwitcher component with locale options', () => {
        renderWithRouter(<Footer />);
        expect(screen.getByRole('option', { name: 'English (UK)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Italiano (Italia)' })).toBeInTheDocument();
    });

    test('renders About Us links pointing to /about-us, before each Accessibility Statement', () => {
        renderWithRouter(<Footer />);

        // Footer renders PolicyLinks twice for responsive layout (mobile copy + desktop copy).
        const aboutUsLinks = screen.getAllByRole('link', { name: t('footer:links.aboutUs') });
        expect(aboutUsLinks).toHaveLength(2);
        for (const link of aboutUsLinks) {
            expect(link.getAttribute('href')).toMatch(/\/about-us$/);
        }

        const accessibilityLinks = screen.getAllByRole('link', { name: t('footer:links.accessibility') });
        expect(accessibilityLinks).toHaveLength(2);

        // Within each PolicyLinks block, About Us must precede Accessibility Statement.
        for (let i = 0; i < aboutUsLinks.length; i++) {
            expect(
                aboutUsLinks[i].compareDocumentPosition(accessibilityLinks[i]) & Node.DOCUMENT_POSITION_FOLLOWING
            ).toBeTruthy();
        }
    });

    test('renders copyright text with current year', () => {
        renderWithRouter(<Footer />);

        const currentYear = new Date().getFullYear();
        const copyrightText = `© ${currentYear} ${t('footer:copyright')}`;

        expect(screen.getByText(copyrightText)).toBeInTheDocument();
    });

    test('renders footer element with theme-aware classes', () => {
        const { container } = renderWithRouter(<Footer />);

        const footer = container.querySelector('footer');
        expect(footer).toBeInTheDocument();

        // Footer should have mt-auto class
        expect(footer).toHaveClass('mt-auto');

        // Newsletter section should have the newsletter-band background
        const newsletterSection = footer?.querySelector('.bg-newsletter-background');
        expect(newsletterSection).toBeInTheDocument();

        // Links section should have footer background
        const linksSection = footer?.querySelector('.bg-footer-background');
        expect(linksSection).toBeInTheDocument();
    });

    test('renders newsletter section on homepage', () => {
        // Explicitly mock homepage route
        vi.mocked(useLocation).mockReturnValue({
            pathname: '/',
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });

        renderWithRouter(<Footer />);

        // Newsletter should be visible
        expect(screen.getByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).toBeInTheDocument();
        expect(screen.getByText(t('footer:newsletter.description'))).toBeInTheDocument();
        expect(screen.getByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).toBeInTheDocument();
    });

    test('renders newsletter section on site-prefixed homepage', () => {
        // Mock site-prefixed homepage route
        vi.mocked(useLocation).mockReturnValue({
            pathname: `${getSitePrefix()}`,
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });

        renderWithRouter(<Footer />);

        // Newsletter should be visible
        expect(screen.getByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).toBeInTheDocument();
        expect(screen.getByText(t('footer:newsletter.description'))).toBeInTheDocument();
        expect(screen.getByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).toBeInTheDocument();
    });

    test('does not render newsletter section on non-homepage routes', () => {
        // Mock non-homepage route (e.g., product page)
        vi.mocked(useLocation).mockReturnValue({
            pathname: `${getSitePrefix()}/product/test-product`,
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });

        renderWithRouter(<Footer />);

        // Newsletter should NOT be visible
        expect(screen.queryByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).not.toBeInTheDocument();
        expect(screen.queryByText(t('footer:newsletter.description'))).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).not.toBeInTheDocument();
    });

    test('does not render newsletter on cart page', () => {
        // Mock cart route (with site prefix)
        vi.mocked(useLocation).mockReturnValue({
            pathname: `${getSitePrefix()}/cart`,
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });

        renderWithRouter(<Footer />);

        // Newsletter should NOT be visible
        expect(screen.queryByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).not.toBeInTheDocument();
    });

    test('does not render newsletter on category page', () => {
        // Mock category route (with site prefix)
        vi.mocked(useLocation).mockReturnValue({
            pathname: `${getSitePrefix()}/category/mens`,
            search: '',
            hash: '',
            state: null,
            key: 'default',
        });

        renderWithRouter(<Footer />);

        // Newsletter should NOT be visible
        expect(screen.queryByRole('heading', { name: t('footer:newsletter.title'), level: 2 })).not.toBeInTheDocument();
    });
});
