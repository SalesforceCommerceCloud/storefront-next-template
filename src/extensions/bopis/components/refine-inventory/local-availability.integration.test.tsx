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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import {
    StoreLocatorStateProvider,
    type SelectedStoreResolution,
} from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import english from '@/extensions/bopis/locales/en-GB/translations.json';
import LocalAvailability from './local-availability';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-navigate', () => ({ useNavigate: () => navigate }));
const selected: SelectedStoreInfo = { id: 'A', inventoryId: 'list-A', name: 'Store A' };
const search =
    '/search?q=milk&sort=best-matches&inventoryStore=A&refine=ilids%3Dlist-A&refine=orderable_only%3Dtrue&offset=48&page=3';

function show(initialSelection?: SelectedStoreInfo) {
    let settle: (result: SelectedStoreResolution) => void = () => {};
    const promise = new Promise<SelectedStoreResolution>((resolve) => {
        settle = resolve;
    });
    const i18n = createInstance();
    void i18n.init({ lng: 'en-GB', resources: { 'en-GB': { extBopis: english } }, initImmediate: false });
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <ConfigProvider
                        config={{
                            ...mockConfig,
                            features: {
                                ...mockConfig.features,
                                localInventory: { enabled: true, nativeSearchVerified: true },
                            },
                        }}>
                        <SiteProvider
                            site={mockSiteObject}
                            locale={mockLocale}
                            language={mockSiteObject.defaultLocale}
                            currency={mockSiteObject.defaultCurrency}>
                            <I18nextProvider i18n={i18n}>
                                <StoreLocatorStateProvider
                                    selectedStoreInfo={initialSelection}
                                    selectedStoreResolution={promise}>
                                    <LocalAvailability />
                                </StoreLocatorStateProvider>
                            </I18nextProvider>
                        </SiteProvider>
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: [search] }
    );
    render(<RouterProvider router={router} />);
    return { promise, settle: (result: SelectedStoreResolution) => settle(result) };
}

beforeEach(() => {
    navigate.mockReset();
});

describe('availability with the real deferred selection boundary', () => {
    it('retains a filtered later page while selection resolves and after the matching store is adopted', async () => {
        const { settle, promise } = show();
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(navigate).not.toHaveBeenCalled();
        await act(async () => {
            settle({ selectedStoreInfo: selected, error: null });
            await promise;
        });
        await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
        expect(screen.getByRole('checkbox')).not.toBeChecked();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('preserves filters and pagination when selection resolution fails', async () => {
        const { settle, promise } = show();
        expect(navigate).not.toHaveBeenCalled();
        await act(async () => {
            settle({ selectedStoreInfo: null, error: 'store' });
            await promise;
        });
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('clears inventory and pagination after an authoritative empty selection resolves', async () => {
        const { settle, promise } = show(selected);
        expect(navigate).not.toHaveBeenCalled();
        await act(async () => {
            settle({ selectedStoreInfo: null, error: null });
            await promise;
        });
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        const params = new URLSearchParams(navigate.mock.calls.at(-1)?.[0]?.search);
        expect(params.has('refine')).toBe(false);
        expect(params.has('inventoryStore')).toBe(false);
        expect(params.has('offset')).toBe(false);
        expect(params.has('page')).toBe(false);
        expect(params.get('q')).toBe('milk');
        expect(params.get('sort')).toBe('best-matches');
    });
});
