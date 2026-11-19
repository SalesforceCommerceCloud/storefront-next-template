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
import { describe, test, expect, vi } from 'vitest';
import { useLoaderData } from 'react-router';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import StorePreferences from '.';

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
// Mock the default-store controls (own fetchers and locator config are covered in save-default-store tests)
vi.mock('./preferred-store/save-default-store', () => ({
    SaveCurrentStoreAsDefault: ({ activeStore }: { activeStore: { id: string } }) => (
        <button data-testid="save-current-button">{activeStore.id}</button>
    ),
    ChooseDefaultStore: () => <button data-testid="choose-default-button">Choose</button>,
}));

vi.mock('./preferred-store/change-store-button', () => ({
    default: () => <button>Change store</button>,
}));

// Mock StoreAddress extension component
vi.mock('@/extensions/store-locator/components/store-locator/address', () => ({
    default: () => <span data-testid="store-address">Mock address</span>,
}));
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

// Mock useToast
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

describe('StorePreferences', () => {
    const renderStorePreferences = () => {
        vi.mocked(useLoaderData).mockReturnValue({ activeStore: null, activeError: null, defaultError: null });
        return render(<StorePreferences />);
    };

    describe('Page Content', () => {
        test('renders Store Preferences title', () => {
            renderStorePreferences();
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Store Preferences');
        });

        test('renders Store Preferences subtitle', () => {
            renderStorePreferences();
            expect(screen.getByText(t('account:storePreferences.subtitle'))).toBeInTheDocument();
        });

        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        test('renders Preferred Store for Pickup section heading', () => {
            renderStorePreferences();
            expect(screen.getByText('Preferred Store for Pickup')).toBeInTheDocument();
        });

        test('renders preferred store description', () => {
            renderStorePreferences();
            expect(screen.getByText('Select your preferred store for in-store pickup orders')).toBeInTheDocument();
        });

        test('renders Change store button', () => {
            renderStorePreferences();
            expect(screen.getByRole('button', { name: 'Change store' })).toBeInTheDocument();
        });

        test('renders empty state when no store selected', () => {
            renderStorePreferences();
            expect(screen.getByText(t('account:storePreferences.preferredStore.noStoreSelected'))).toBeInTheDocument();
        });
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

        test('renders Pickup Preferences section heading', () => {
            renderStorePreferences();
            expect(screen.getByText('Pickup Preferences')).toBeInTheDocument();
        });

        test('renders Pickup Preferences description', () => {
            renderStorePreferences();
            expect(screen.getByText('Manage your pickup notification and store preferences')).toBeInTheDocument();
        });

        test('renders Edit button in Pickup Preferences', () => {
            renderStorePreferences();
            expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        });

        test('renders all three pickup preference toggles', () => {
            renderStorePreferences();
            expect(screen.getByText('Auto-select preferred store')).toBeInTheDocument();
            expect(screen.getByText('Pickup notifications')).toBeInTheDocument();
            expect(screen.getByText('Store events & promotions')).toBeInTheDocument();
        });
    });
});
