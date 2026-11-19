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
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useLoaderData, useNavigation } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperStores } from '@/scapi';
import PreferredStore from '.';

const { t } = getTranslation();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        href: (path: string) => path,
        useLoaderData: vi.fn(),
        useNavigation: vi.fn(() => ({ state: 'idle' })),
    };
});

// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
// Mock ChangeStoreButton to avoid client component issues in tests
vi.mock('./change-store-button', () => ({
    default: () => <button data-testid="change-store-button">Change store</button>,
}));

// Mock the default-store controls (own fetchers and locator config are covered in save-default-store tests)
vi.mock('./save-default-store', () => ({
    SaveCurrentStoreAsDefault: ({ activeStore }: { activeStore: { id: string } }) => (
        <button data-testid="save-current-button">{activeStore.id}</button>
    ),
    ChooseDefaultStore: () => <button data-testid="choose-default-button">Choose</button>,
}));

// Mock StoreAddress extension component
vi.mock('@/extensions/store-locator/components/store-locator/address', () => ({
    default: ({ store }: { store: ShopperStores.schemas['Store'] }) => (
        <span data-testid="store-address">
            {store.address1}, {store.city}, {store.stateCode} {store.postalCode}
        </span>
    ),
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

// Mock useToast
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

const mockStore: ShopperStores.schemas['Store'] = {
    id: 'store-001',
    name: 'Downtown Store',
    address1: '123 Main Street',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94105',
    storeHours: '10:00 AM - 8:00 PM',
};

describe('PreferredStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('With Store Selected', () => {
        beforeEach(() => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: mockStore, activeError: null, defaultError: null });
        });

        test('renders Preferred Store for Pickup heading', () => {
            render(<PreferredStore />);
            expect(screen.getByText('Preferred Store for Pickup')).toBeInTheDocument();
        });

        test('renders preferred store description', () => {
            render(<PreferredStore />);
            expect(screen.getByText('Select your preferred store for in-store pickup orders')).toBeInTheDocument();
        });

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders Change store button', () => {
            render(<PreferredStore />);
            const button = screen.getByTestId('change-store-button');
            expect(button).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders store name', () => {
            render(<PreferredStore />);
            expect(screen.getByText('Downtown Store')).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders store address', () => {
            render(<PreferredStore />);
            expect(screen.getByText(/123 Main Street/)).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders collapsible Store Hours trigger when hours available', () => {
            render(<PreferredStore />);
            expect(screen.getByText('Store Hours')).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('hides store hours content by default', () => {
            render(<PreferredStore />);
            expect(screen.queryByText('10:00 AM - 8:00 PM')).not.toBeInTheDocument();
        });

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('reveals store hours content when trigger is clicked', async () => {
            const user = userEvent.setup();
            render(<PreferredStore />);

            await user.click(screen.getByText('Store Hours'));
            expect(screen.getByText('10:00 AM - 8:00 PM')).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('does not render store hours when not available', () => {
            const storeWithoutHours = { ...mockStore, storeHours: undefined };
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: storeWithoutHours,
                activeError: null,
                defaultError: null,
            });

            render(<PreferredStore />);
            expect(screen.queryByText('Store Hours')).not.toBeInTheDocument();
        });
    });

    describe('Without Store Selected', () => {
        beforeEach(() => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: null, activeError: null, defaultError: null });
        });

        test('renders empty state message', () => {
            render(<PreferredStore />);
            expect(screen.getByText(t('account:storePreferences.preferredStore.noStoreSelected'))).toBeInTheDocument();
        });

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders Change store button when no store is saved', () => {
            render(<PreferredStore />);
            const button = screen.getByTestId('change-store-button');
            expect(button).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('does not render store details', () => {
            render(<PreferredStore />);
            expect(screen.queryByText('Downtown Store')).not.toBeInTheDocument();
        });
    });

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    describe('Saved default store', () => {
        const defaultStore = { ...mockStore, id: 'store-default', name: 'Uptown Default Store' };

        test('shows the saved default and the current store independently when they differ', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: mockStore,
                defaultStore,
                defaultStoreId: 'store-default',
                activeError: null,
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(screen.getByText('Uptown Default Store')).toBeInTheDocument();
            expect(screen.getByText('Downtown Store')).toBeInTheDocument();
            expect(screen.getByTestId('save-current-button')).toBeInTheDocument();
        });

        test('hides save-current when the active store is already the default', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: mockStore,
                defaultStore: mockStore,
                defaultStoreId: 'store-001',
                activeError: null,
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(screen.queryByTestId('save-current-button')).not.toBeInTheDocument();
            expect(screen.getByTestId('choose-default-button')).toBeInTheDocument();
        });

        test('shows the no-default state without borrowing the active store', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: mockStore,
                defaultStore: null,
                defaultStoreId: null,
                activeError: null,
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(screen.getByText(t('account:storePreferences.defaultStore.none'))).toBeInTheDocument();
            expect(screen.getByTestId('save-current-button')).toBeInTheDocument();
        });

        test('shows the default without an active store and offers no save-current', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: null,
                defaultStore,
                defaultStoreId: 'store-default',
                activeError: null,
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(screen.queryByTestId('save-current-button')).not.toBeInTheDocument();
            expect(screen.getByText(t('account:storePreferences.preferredStore.noStoreSelected'))).toBeInTheDocument();
        });
    });
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    describe('Error Handling', () => {
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('shows saved-store-unavailable messaging for an unresolved saved ID', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: null,
                defaultStoreId: 'other-site',
                activeError: null,
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(
                screen.getByText('Your saved store is unavailable on this site. You can change it.')
            ).toBeInTheDocument();
            // The default section reports the unavailable store; the (empty) current store is separate.
            expect(screen.queryByText(t('account:storePreferences.defaultStore.none'))).not.toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('shows the lookup error instead of saved-store messaging when profile lookup failed', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: null,
                defaultStoreId: null,
                activeError: 'Lookup failed',
                defaultError: null,
            });
            render(<PreferredStore />);
            expect(
                screen.queryByText('Your saved store is unavailable on this site. You can change it.')
            ).not.toBeInTheDocument();
            expect(screen.getByText('Lookup failed')).toBeInTheDocument();
        });

        test('shows error toast when store fetch fails', () => {
            vi.mocked(useLoaderData).mockReturnValue({
                activeStore: null,
                activeError: 'Failed to load store details. Please try again later.',
                defaultError: null,
            });

            render(<PreferredStore />);

            expect(mockAddToast).toHaveBeenCalledWith('Failed to load store details. Please try again later.', 'error');
        });

        test('does not show toast when there is no error', () => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: mockStore, activeError: null, defaultError: null });

            render(<PreferredStore />);

            expect(mockAddToast).not.toHaveBeenCalled();
        });
    });

    describe('Loading State', () => {
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('shows one skeleton card per section when the locator is enabled', () => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: mockStore, activeError: null, defaultError: null });
            vi.mocked(useNavigation).mockReturnValue({ state: 'loading' } as ReturnType<typeof useNavigation>);
            render(<PreferredStore />);
            expect(screen.getAllByTestId('skeleton')).toHaveLength(6);
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('shows skeleton while revalidating', () => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: mockStore, activeError: null, defaultError: null });
            vi.mocked(useNavigation).mockReturnValue({ state: 'loading' } as ReturnType<typeof useNavigation>);

            render(<PreferredStore />);

            // Should show skeletons instead of actual content
            expect(screen.queryByText('Downtown Store')).not.toBeInTheDocument();
            expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(3);
        });

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('shows content when not revalidating', () => {
            vi.mocked(useLoaderData).mockReturnValue({ activeStore: mockStore, activeError: null, defaultError: null });
            vi.mocked(useNavigation).mockReturnValue({ state: 'idle' } as ReturnType<typeof useNavigation>);

            render(<PreferredStore />);

            // Should show actual content
            expect(screen.getByText('Downtown Store')).toBeInTheDocument();
            expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    });
});
