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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { useLayoutEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoreLocatorStateProvider, useStoreLocatorApi } from './store-locator';
import { SelectionFeedback } from './selection';
import enUS from '@/extensions/store-locator/locales/en-US/translations.json';
import enGB from '@/extensions/store-locator/locales/en-GB/translations.json';
import accountUS from '@/locales/en-US/translations.json';
import accountGB from '@/locales/en-GB/translations.json';

vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => ({ site: { id: 'site' } }) }));

const canonical = { id: 'B', name: 'Store B', inventoryId: 'inventory-b' };

describe.each([
    ['en-US', enUS, accountUS.account],
    ['en-GB', enGB, accountGB.account],
] as const)('%s partial-success feedback', (locale, dictionary, account) => {
    it.each([
        canonical,
        null,
    ])('announces that the store choice %j applied when only account persistence failed', async (choice) => {
        const i18n = createInstance();
        await i18n.init({
            lng: locale,
            fallbackLng: false,
            resources: { [locale]: { extStoreLocator: dictionary, account } },
            interpolation: { escapeValue: false },
        });
        const retry = vi.fn();
        function Feedback() {
            const store = useStoreLocatorApi();
            useLayoutEffect(() => {
                store.setState({ selectionError: 'PREFERRED_STORE_PERSISTENCE_FAILED' });
            }, [store]);
            return <SelectionFeedback retry={retry} />;
        }
        const router = createMemoryRouter([
            {
                path: '/',
                element: (
                    <StoreLocatorStateProvider selectedStoreInfo={choice} identity="registered">
                        <Feedback />
                    </StoreLocatorStateProvider>
                ),
            },
        ]);
        try {
            render(
                <I18nextProvider i18n={i18n}>
                    <RouterProvider router={router} />
                </I18nextProvider>
            );
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Your store choice was applied, but could not be saved to your account. Try again.'
            );
            expect(screen.queryByText(/Your previous store is unchanged/)).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
            expect(retry).toHaveBeenCalledTimes(1);
        } finally {
            router.dispose();
        }
    });
});

describe.each([
    ['en-US', enUS, accountUS.routeError],
    ['en-GB', enGB, accountGB.routeError],
] as const)('%s basket-consent feedback', (locale, dictionary, routeError) => {
    it('explains the confirmation boundary without offering a retry that repeats the same refusal', async () => {
        const i18n = createInstance();
        await i18n.init({
            lng: locale,
            fallbackLng: false,
            resources: { [locale]: { extStoreLocator: dictionary, routeError } },
        });
        const retry = vi.fn();
        function Feedback() {
            const store = useStoreLocatorApi();
            useLayoutEffect(() => {
                store.setState({ selectionError: 'STORE_CHANGE_CONFIRMATION_REQUIRED' });
            }, [store]);
            return <SelectionFeedback retry={retry} />;
        }
        const router = createMemoryRouter([
            {
                path: '/',
                element: (
                    <StoreLocatorStateProvider selectedStoreInfo={canonical} identity="registered">
                        <Feedback />
                    </StoreLocatorStateProvider>
                ),
            },
        ]);
        try {
            render(
                <I18nextProvider i18n={i18n}>
                    <RouterProvider router={router} />
                </I18nextProvider>
            );
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Your current store and basket are unchanged. A store change needs confirmation'
            );
            expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
            expect(retry).not.toHaveBeenCalled();
        } finally {
            router.dispose();
        }
    });
});
