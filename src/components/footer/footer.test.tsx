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
import type { AppConfig } from '@/types/config';
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
const renderWithRouter = (component: React.ReactElement, config: AppConfig = mockConfig) => {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={config}>
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

    test('renders the inline "Get Email Updates" sign-up', () => {
        renderWithRouter(<Footer />);

        expect(screen.getByText(t('footer:newsletter.inlineLabel'))).toBeInTheDocument();
        expect(screen.getByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('footer:newsletter.signUpButton') })).toBeInTheDocument();
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

    test('renders the About Us link pointing to /about-us, before the Accessibility Statement', () => {
        renderWithRouter(<Footer />);

        const aboutUs = screen.getByRole('link', { name: t('footer:links.aboutUs') });
        expect(aboutUs.getAttribute('href')).toMatch(/\/about-us$/);

        const accessibility = screen.getByRole('link', { name: t('footer:links.accessibility') });
        expect(aboutUs.compareDocumentPosition(accessibility) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

        // Links section should have footer background
        const linksSection = footer?.querySelector('.bg-footer-background');
        expect(linksSection).toBeInTheDocument();
    });

    test.each([
        ['homepage', '/'],
        ['site-prefixed homepage', `${getSitePrefix()}`],
        ['product page', `${getSitePrefix()}/product/test-product`],
        ['cart page', `${getSitePrefix()}/cart`],
        ['category page', `${getSitePrefix()}/category/test`],
    ])('renders the email sign-up on the %s', (_name, pathname) => {
        vi.mocked(useLocation).mockReturnValue({ pathname, search: '', hash: '', state: null, key: 'default' });

        renderWithRouter(<Footer />);

        expect(screen.getByPlaceholderText(t('footer:newsletter.emailPlaceholder'))).toBeInTheDocument();
    });

    test('renders guest order lookup link when enabled', () => {
        const configWithGuestOrderLookup: AppConfig = {
            ...mockConfig,
            guestOrderLookup: {
                ...mockConfig.guestOrderLookup,
                enabled: true,
            },
        };

        renderWithRouter(<Footer />, configWithGuestOrderLookup);

        const guestOrderLookupLinks = screen.getAllByRole('link', {
            name: t('guestOrderLookup:footerLinkLabel'),
        });
        expect(guestOrderLookupLinks).toHaveLength(1);
        for (const link of guestOrderLookupLinks) {
            expect(link.getAttribute('href')).toMatch(/\/order-lookup$/);
        }
    });

    test('does not render guest order lookup link when disabled', () => {
        const configWithoutGuestOrderLookup: AppConfig = {
            ...mockConfig,
            guestOrderLookup: {
                ...mockConfig.guestOrderLookup,
                enabled: false,
            },
        };

        renderWithRouter(<Footer />, configWithoutGuestOrderLookup);

        expect(screen.queryByRole('link', { name: t('guestOrderLookup:footerLinkLabel') })).not.toBeInTheDocument();
    });
});
