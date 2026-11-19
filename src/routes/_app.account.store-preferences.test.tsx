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

import {
    resolveDefaultStore,
    resolveSelectedStore,
} from '@/extensions/store-locator/lib/resolve-selected-store.server';
vi.mock('@/extensions/store-locator/lib/resolve-selected-store.server', () => ({
    resolveSelectedStore: vi.fn(),
    resolveDefaultStore: vi.fn(),
}));

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
        vi.mocked(resolveDefaultStore).mockResolvedValue({
            preferredStoreId: null,
            store: null,
            status: 'empty',
            error: null,
        });
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
    describe('when loading store data on the server', () => {
        const runLoader = (context = createTestContext()) =>
            loader({
                context,
                params: { siteId: 'test-site', localeId: 'en-US' },
                request: new Request('http://localhost/account/store-preferences'),
                url: new URL('http://localhost/account/store-preferences'),
                pattern: ROUTE_PATTERN,
            });
        const active = (store: unknown) => ({
            store,
            selectedStoreInfo: store ? { id: 'active-1' } : null,
            preferredStoreId: null,
            status: store ? 'resolved' : 'empty',
            error: null,
        });

        test('returns no stores when nothing is selected or saved', async () => {
            const context = createTestContext();
            context.set(selectedStoreContext, null);
            expect(await runLoader(context)).toEqual({
                activeStore: null,
                defaultStore: null,
                defaultStoreId: null,
                activeError: null,
                defaultError: null,
            });
        });

        test('keeps the active store and the saved default independent when they differ', async () => {
            const activeStore = { id: 'active-1', name: 'Active Store' };
            const defaultStore = { id: 'default-1', name: 'Default Store' };
            vi.mocked(resolveSelectedStore).mockResolvedValue(active(activeStore) as never);
            vi.mocked(resolveDefaultStore).mockResolvedValue({
                preferredStoreId: 'default-1',
                store: defaultStore,
                status: 'resolved',
                error: null,
            } as never);
            const result = await runLoader();
            expect(result).toEqual({
                activeStore,
                defaultStore,
                defaultStoreId: 'default-1',
                activeError: null,
                defaultError: null,
            });
        });

        test('does not present the active store as the default when no default is saved', async () => {
            vi.mocked(resolveSelectedStore).mockResolvedValue(active({ id: 'active-1' }) as never);
            const result = await runLoader();
            expect(result.activeStore).toEqual({ id: 'active-1' });
            expect(result.defaultStore).toBeNull();
            expect(result.defaultStoreId).toBeNull();
        });

        test('reports a stale default id without a store', async () => {
            vi.mocked(resolveDefaultStore).mockResolvedValue({
                preferredStoreId: 'deleted-store',
                store: null,
                status: 'stale',
                error: null,
            });
            const result = await runLoader();
            expect(result).toMatchObject({
                defaultStore: null,
                defaultStoreId: 'deleted-store',
                activeError: null,
                defaultError: null,
            });
        });

        test.each(['active', 'default'])('shows an error message when the %s lookup fails', async (which) => {
            if (which === 'active') {
                vi.mocked(resolveSelectedStore).mockResolvedValue({
                    ...active(null),
                    status: 'error',
                    error: 'store',
                } as never);
            } else {
                vi.mocked(resolveDefaultStore).mockResolvedValue({
                    preferredStoreId: null,
                    store: null,
                    status: 'error',
                    error: 'profile',
                });
            }
            const result = await runLoader();
            const message = 'storePreferences.preferredStore.error';
            // Only the failing lookup reports an error; the other section stays clean.
            expect(result.activeError).toBe(which === 'active' ? message : null);
            expect(result.defaultError).toBe(which === 'default' ? message : null);
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
});
