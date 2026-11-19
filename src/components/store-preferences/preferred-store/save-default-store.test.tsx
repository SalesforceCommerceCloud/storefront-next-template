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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useFetcher, useFetchers } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { resourceRoutes } from '@/route-paths';
import { ChooseDefaultStore, SaveCurrentStoreAsDefault } from './save-default-store';

const { t } = getTranslation();

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    useFetcher: vi.fn(),
    useFetchers: vi.fn(() => []),
}));
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (select: (state: unknown) => unknown) =>
        select({
            config: {
                supportedCountries: [{ countryCode: 'US', countryName: 'United States' }],
                radius: 50,
                radiusUnit: 'mi',
                limit: 10,
                geoTimeout: 1000,
            },
        }),
}));
vi.mock('@/extensions/store-locator/components/store-locator/address', () => ({
    default: () => <span data-testid="store-address" />,
}));

type FetcherStub = { state: string; data?: unknown; submit: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
const stub = (partial: Partial<FetcherStub> = {}): FetcherStub => ({
    state: 'idle',
    submit: vi.fn(),
    load: vi.fn(),
    ...partial,
});
const store = { id: 'store-9', name: 'Candidate Store', inventoryId: 'inv-9' };

describe('save default store controls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useFetchers).mockReturnValue([]);
    });

    describe('SaveCurrentStoreAsDefault', () => {
        test('submits the active store id to the dedicated action only', async () => {
            const fetcher = stub();
            vi.mocked(useFetcher).mockReturnValue(fetcher as never);
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            await userEvent.click(
                screen.getByRole('button', { name: t('account:storePreferences.defaultStore.saveCurrent') })
            );
            expect(fetcher.submit).toHaveBeenCalledWith(
                { storeId: 'store-1' },
                { method: 'post', action: resourceRoutes.saveDefaultStore }
            );
        });

        test('keeps its save state separate from the chooser dialog', () => {
            vi.mocked(useFetcher).mockReturnValue(stub() as never);
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            expect(useFetcher).toHaveBeenCalledWith({ key: 'save-default-store:current' });
        });

        test('is disabled while the other control has a save in flight', () => {
            vi.mocked(useFetcher).mockReturnValue(stub() as never);
            vi.mocked(useFetchers).mockReturnValue([
                { state: 'submitting', formAction: resourceRoutes.saveDefaultStore },
            ] as never);
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            expect(screen.getByRole('button')).toBeDisabled();
        });

        test('disables the button and announces progress while saving', () => {
            vi.mocked(useFetcher).mockReturnValue(stub({ state: 'submitting' }) as never);
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            expect(screen.getByRole('button')).toBeDisabled();
            expect(screen.getByRole('status')).toHaveTextContent(t('account:storePreferences.defaultStore.saving'));
        });

        test('reports success only from a successful response', () => {
            vi.mocked(useFetcher).mockReturnValue(stub({ data: { success: true } }) as never);
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            expect(screen.getByRole('status')).toHaveTextContent(t('account:storePreferences.defaultStore.saved'));
        });

        test('a failed save shows an alert and offers retry without claiming success', () => {
            vi.mocked(useFetcher).mockReturnValue(
                stub({ data: { success: false, code: 'DEFAULT_SAVE_FAILED' } }) as never
            );
            render(<SaveCurrentStoreAsDefault activeStore={{ id: 'store-1' }} />);
            expect(screen.getByRole('alert')).toHaveTextContent(t('account:storePreferences.defaultStore.saveFailed'));
            expect(
                screen.getByRole('button', { name: t('account:storePreferences.defaultStore.retry') })
            ).toBeEnabled();
            expect(screen.queryByText(t('account:storePreferences.defaultStore.saved'))).not.toBeInTheDocument();
        });
    });

    describe('ChooseDefaultStore', () => {
        // The save fetcher is registered with a shared key; the dialog's search fetcher has none.
        const mockFetchers = (search: FetcherStub, save: FetcherStub) =>
            vi
                .mocked(useFetcher)
                .mockImplementation(((opts?: { key?: string }) => (opts?.key ? save : search)) as never);
        const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
            await user.click(screen.getByRole('button', { name: t('account:storePreferences.defaultStore.choose') }));
            return screen.findByRole('dialog');
        };

        test('searches with its own fetcher and saves the picked candidate through the save action', async () => {
            const search = stub({ data: { success: true, stores: { data: [store] } } });
            const save = stub();
            mockFetchers(search, save);
            const user = userEvent.setup();
            render(<ChooseDefaultStore />);
            await openDialog(user);
            await user.type(screen.getByLabelText(t('account:storePreferences.defaultStore.postalCode')), '94105');
            await user.click(screen.getByRole('button', { name: t('account:storePreferences.defaultStore.search') }));
            expect(search.load).toHaveBeenCalledWith(
                expect.stringContaining(`${resourceRoutes.stores}?mode=input&countryCode=US&postalCode=94105`)
            );
            await user.click(screen.getByRole('radio', { name: /Candidate Store/ }));
            await user.click(
                screen.getByRole('button', { name: t('account:storePreferences.defaultStore.saveAsDefault') })
            );
            expect(save.submit).toHaveBeenCalledWith(
                { storeId: 'store-9' },
                { method: 'post', action: resourceRoutes.saveDefaultStore }
            );
        });

        test('does not load the dialog until the trigger is used', () => {
            mockFetchers(stub(), stub());
            render(<ChooseDefaultStore />);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        test('a blank postal code shows an announced error instead of silently doing nothing', async () => {
            const search = stub();
            mockFetchers(search, stub());
            const user = userEvent.setup();
            render(<ChooseDefaultStore />);
            await openDialog(user);
            const postal = screen.getByLabelText(t('account:storePreferences.defaultStore.postalCode'));
            expect(postal).toBeRequired();
            await user.type(postal, '   ');
            await user.click(screen.getByRole('button', { name: t('account:storePreferences.defaultStore.search') }));
            expect(search.load).not.toHaveBeenCalled();
            expect(screen.getByText(t('account:storePreferences.defaultStore.postalRequired'))).toBeInTheDocument();
            expect(postal).toHaveAttribute('aria-invalid', 'true');
            expect(postal).toHaveFocus();
            await user.type(postal, '94105');
            expect(postal).toHaveAttribute('aria-invalid', 'false');
        });

        test('a save result already present when opening neither closes nor decorates the dialog', async () => {
            mockFetchers(stub(), stub({ data: { success: true, preferredStoreId: 'store-9' } }));
            const user = userEvent.setup();
            render(<ChooseDefaultStore />);
            const dialog = await openDialog(user);
            expect(dialog).toBeInTheDocument();
            expect(screen.queryByText(t('account:storePreferences.defaultStore.saved'))).not.toBeInTheDocument();
        });

        test('closes and returns focus to the trigger once a new save succeeds', async () => {
            const search = stub();
            const save = stub();
            mockFetchers(search, save);
            const user = userEvent.setup();
            const { rerender } = render(<ChooseDefaultStore />);
            await openDialog(user);
            save.data = { success: true, preferredStoreId: 'store-9' };
            rerender(<ChooseDefaultStore />);
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: t('account:storePreferences.defaultStore.choose') })
                ).toHaveFocus()
            );
        });
    });
});
