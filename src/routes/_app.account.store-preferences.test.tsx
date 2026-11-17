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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { loader } from './_app.account.store-preferences';
import { getPreferredStoreId } from '@/extensions/store-locator/lib/api/preferred-store.server';
import { createTestContext, ROUTE_PATTERN } from '@/lib/test-utils';
vi.mock('@/extensions/store-locator/providers/selection', () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

const { t } = getTranslation();

const mockLogger = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('@/lib/logger.server', () => ({
    getLogger: vi.fn(() => mockLogger),
}));

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import { selectedStoreContext } from '@/extensions/store-locator/middlewares/selected-store.server';

const mockGetStores = vi.fn();

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: () => ({
        shopperStores: {
            getStores: mockGetStores,
        },
    }),
}));

import { resolveSelectedStore } from '@/extensions/store-locator/lib/resolve-selected-store.server';
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({ resolveSelectedStore: vi.fn() }));
vi.mock('@/extensions/store-locator/lib/api/preferred-store.server', () => ({ getPreferredStoreId: vi.fn() }));

vi.mock('@/extensions/store-locator/middlewares/selected-store.server', () => ({
    selectedStoreContext: { id: 'selectedStoreContext' },
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

vi.mock('@/components/store-preferences', () => ({
    default: () => <div data-testid="store-preferences" />,
}));

vi.mock('@/components/seo-meta', () => ({
    SeoMeta: ({ title, noIndex }: { title: string; noIndex?: boolean }) => (
        <div data-testid="seo-meta" data-title={title} data-no-index={String(noIndex)} />
    ),
}));

describe('Store Preferences page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        vi.mocked(resolveSelectedStore).mockResolvedValue({
            store: null,
            selectedStoreInfo: null,
            preferredStoreId: null,
            status: 'empty',
            error: null,
        });
        vi.mocked(getPreferredStoreId).mockResolvedValue(null);
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    });

    describe('when a shopper visits the store preferences page', () => {
        test('shows the store preferences section with the correct page title', async () => {
            const AccountStorePreferencesRoute = (await import('./_app.account.store-preferences')).default;

            const router = createMemoryRouter(
                [
                    {
                        path: '/account/store-preferences',
                        element: <AccountStorePreferencesRoute />,
                    },
                ],
                { initialEntries: ['/account/store-preferences'] }
            );

            render(
                <AllProvidersWrapper>
                    <RouterProvider router={router} />
                </AllProvidersWrapper>
            );

            expect(screen.getByTestId('store-preferences')).toBeInTheDocument();

            const seoMeta = screen.getByTestId('seo-meta');
            expect(seoMeta).toHaveAttribute('data-title', t('account:meta.storePreferencesTitle'));
            expect(seoMeta).toHaveAttribute('data-no-index', 'true');
        });
    });

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    describe('when loading preferred store data on the server', () => {
        test('returns no preferred store when the shopper has not selected a store', async () => {
            const context = createTestContext();
            context.set(selectedStoreContext, null);

            const result = await loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost/account/store-preferences'),
                url: new URL('http://localhost/account/store-preferences'),
                pattern: ROUTE_PATTERN,
            });

            expect(result).toMatchObject({ preferredStore: null, error: null });
            expect(mockGetStores).not.toHaveBeenCalled();
        });

        test('loads the preferred store details when the shopper has a saved store', async () => {
            const mockStore = { id: 'store-1', name: 'Downtown Store', city: 'San Francisco' };
            vi.mocked(resolveSelectedStore).mockResolvedValue({
                store: mockStore,
                selectedStoreInfo: { id: 'store-1' },
                preferredStoreId: 'store-1',
                status: 'resolved',
                error: null,
            });
            vi.mocked(getPreferredStoreId).mockResolvedValue('store-1');
            mockGetStores.mockResolvedValue({
                data: { data: [mockStore] },
            });

            const context = createTestContext();
            context.set(selectedStoreContext, { id: 'store-1' });

            const result = await loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost/account/store-preferences'),
                url: new URL('http://localhost/account/store-preferences'),
                pattern: ROUTE_PATTERN,
            });

            expect(result).toMatchObject({ preferredStore: mockStore, error: null });
            expect(resolveSelectedStore).toHaveBeenCalledWith(context);
            expect(mockGetStores).not.toHaveBeenCalled();
        });

        test('shows an error message when the store lookup fails', async () => {
            vi.mocked(resolveSelectedStore).mockResolvedValue({
                store: null,
                selectedStoreInfo: null,
                preferredStoreId: 'store-1',
                status: 'error',
                error: 'store',
            });
            mockGetStores.mockRejectedValue(new Error('Network error'));

            const context = createTestContext();
            context.set(selectedStoreContext, { id: 'store-1' });

            const result = await loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost/account/store-preferences'),
                url: new URL('http://localhost/account/store-preferences'),
                pattern: ROUTE_PATTERN,
            });

            expect(result.preferredStore).toBeNull();
            expect(typeof result.error).toBe('string');
            expect(result.error).toBe('storePreferences.preferredStore.error');
            expect(resolveSelectedStore).toHaveBeenCalledWith(context);
        });

        test('returns no preferred store when the saved store no longer exists', async () => {
            vi.mocked(resolveSelectedStore).mockResolvedValue({
                store: null,
                selectedStoreInfo: null,
                error: null,
                preferredStoreId: 'deleted-store',
                status: 'stale',
            });
            mockGetStores.mockResolvedValue({
                data: { data: [] },
            });

            const context = createTestContext();
            context.set(selectedStoreContext, { id: 'store-1' });

            const result = await loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost/account/store-preferences'),
                url: new URL('http://localhost/account/store-preferences'),
                pattern: ROUTE_PATTERN,
            });

            expect(result).toEqual({ preferredStore: null, preferredStoreId: null, error: null });
            expect(resolveSelectedStore).toHaveBeenCalledExactlyOnceWith(context);
            expect(mockGetStores).not.toHaveBeenCalled();
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
});
