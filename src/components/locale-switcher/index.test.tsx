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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import i18next from 'i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider, type Site } from '@salesforce/storefront-next-runtime/site-context';
import { mockSiteObject } from '@/test-utils/config';
import LocaleSwitcher from './index';
import { resourceRoutes } from '@/route-paths';

const { t } = getTranslation();

// Mock config with i18n settings
const mockConfig = {
    i18n: {
        fallbackLng: 'en-GB',
        supportedLngs: ['en-GB', 'it-IT'],
    },
} as any;

// Mock site with supported locales that match the i18n config
const mockSite: Site = mockSiteObject;

const mockLocale =
    mockSite.supportedLocales.find((l) => l.id === mockSite.defaultLocale) ?? mockSite.supportedLocales[0];

const mockFetcherSubmit = vi.fn();
const mockFetcher = {
    submit: mockFetcherSubmit,
    state: 'idle' as const,
    data: null,
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    text: undefined,
    formData: undefined,
    json: undefined,
    Form: vi.fn(),
    load: vi.fn(),
};

// Helper function to render component with router context
const renderWithRouter = ({ initialLanguage = 'en-GB' }: { initialLanguage?: string } = {}) => {
    // Set the initial language in i18next
    void i18next.changeLanguage(initialLanguage);

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
                            <LocaleSwitcher />
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'] }
    );

    return render(<RouterProvider router={router} />);
};

describe('LocaleSwitcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset to English before each test
        void i18next.changeLanguage('en-GB');
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue(mockFetcher as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders a language selector with proper accessibility label', () => {
        renderWithRouter();

        // The accessible name folds the SC 3.2.2 context-change hint into aria-label.
        const selector = screen.getByRole('combobox', {
            name: `${t('localeSwitcher:ariaLabel')}. ${t('localeSwitcher:changesContextHint')}`,
        });
        expect(selector).toBeInTheDocument();
    });

    test('displays English and Italian language options', () => {
        renderWithRouter();

        expect(screen.getByRole('option', { name: t('localeSwitcher:locales.en-GB') })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: t('localeSwitcher:locales.it-IT') })).toBeInTheDocument();
    });

    test('shows current language as selected when initialized with English', () => {
        renderWithRouter({ initialLanguage: 'en-GB' });

        const selector = screen.getByRole('combobox');
        expect(selector).toHaveValue('en-GB');
    });

    test('shows current language as selected when initialized with Italian', () => {
        renderWithRouter({ initialLanguage: 'it-IT' });

        const selector = screen.getByRole('combobox');
        expect(selector).toHaveValue('it-IT');
    });

    test('changes displayed language when user selects a new language', async () => {
        const user = userEvent.setup();
        renderWithRouter({ initialLanguage: 'en-GB' });

        const selector = screen.getByRole('combobox');
        expect(selector).toHaveValue('en-GB');

        // Change to Italian
        await user.selectOptions(selector, 'it-IT');

        // Verify the language changed in i18next
        await waitFor(() => {
            expect(i18next.language).toBe('it-IT');
        });

        // Verify the selector shows the new value
        expect(selector).toHaveValue('it-IT');
    });

    test('changes from Italian to English when user selects English', async () => {
        const user = userEvent.setup();
        renderWithRouter({ initialLanguage: 'it-IT' });

        const selector = screen.getByRole('combobox');
        expect(selector).toHaveValue('it-IT');

        // Change to English
        await user.selectOptions(selector, 'en-GB');

        // Verify the language changed in i18next
        await waitFor(() => {
            expect(i18next.language).toBe('en-GB');
        });

        expect(selector).toHaveValue('en-GB');
    });

    test('submits locale change to server action', async () => {
        const user = userEvent.setup();
        renderWithRouter();

        const selector = screen.getByRole('combobox');
        await user.selectOptions(selector, 'it-IT');

        // Wait for the submit to be called
        await waitFor(() => {
            expect(mockFetcherSubmit).toHaveBeenCalled();
        });

        // Verify the submit was called with correct parameters
        const submitCall = mockFetcherSubmit.mock.calls[0];
        const formData = submitCall[0] as FormData;
        const options = submitCall[1];

        expect(formData.get('type')).toBe('locale');
        const payload = JSON.parse(formData.get('payload') as string);
        expect(payload.locale).toBe('it-IT');
        expect(options).toEqual({
            method: 'POST',
            action: resourceRoutes.setSiteContext,
        });
    });

    test('has correct English option value', () => {
        renderWithRouter();

        const englishOption = screen.getByRole('option', { name: t('localeSwitcher:locales.en-GB') });
        expect(englishOption).toHaveValue('en-GB');
    });

    test('has correct Italian option value', () => {
        renderWithRouter();

        const italianOption = screen.getByRole('option', { name: t('localeSwitcher:locales.it-IT') });
        expect(italianOption).toHaveValue('it-IT');
    });

    test('language selector is keyboard accessible', async () => {
        const user = userEvent.setup();
        renderWithRouter();

        const selector = screen.getByRole('combobox');

        // Tab to the selector
        await user.tab();
        expect(selector).toHaveFocus();

        // For native select elements, we can use selectOptions even when focused
        await user.selectOptions(selector, 'it-IT');

        // The selection should change
        await waitFor(() => {
            expect(selector).toHaveValue('it-IT');
        });
    });

    test('renders without crashing when language is changed multiple times', async () => {
        const user = userEvent.setup();
        renderWithRouter();

        const selector = screen.getByRole('combobox');

        // Change to Italian
        await user.selectOptions(selector, 'it-IT');
        await waitFor(() => {
            expect(selector).toHaveValue('it-IT');
        });

        // Change back to English
        await user.selectOptions(selector, 'en-GB');
        await waitFor(() => {
            expect(selector).toHaveValue('en-GB');
        });

        // Change to Italian again
        await user.selectOptions(selector, 'it-IT');
        await waitFor(() => {
            expect(selector).toHaveValue('it-IT');
        });

        // Component should still be rendered and functional
        expect(selector).toBeInTheDocument();
    });

    test('maintains selected language when re-rendered', async () => {
        const user = userEvent.setup();
        const { rerender } = renderWithRouter();

        const selector = screen.getByRole('combobox');
        await user.selectOptions(selector, 'it-IT');

        await waitFor(() => {
            expect(selector).toHaveValue('it-IT');
        });

        // Re-render the component
        rerender(
            <RouterProvider
                router={createMemoryRouter([
                    {
                        path: '/',
                        element: (
                            <ConfigProvider config={mockConfig}>
                                <SiteProvider
                                    site={mockSite}
                                    locale={mockLocale}
                                    language={mockSiteObject.defaultLocale}
                                    currency={mockSiteObject.defaultCurrency}>
                                    <LocaleSwitcher />
                                </SiteProvider>
                            </ConfigProvider>
                        ),
                    },
                ])}
            />
        );

        // The language should persist
        const updatedSelector = screen.getByRole('combobox');
        expect(updatedSelector).toHaveValue('it-IT');
    });
});
