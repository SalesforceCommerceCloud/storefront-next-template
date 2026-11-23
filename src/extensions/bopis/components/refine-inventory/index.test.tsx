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
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { ConfigWrapper } from '@/test-utils/config';
import RefineInventory from './index';

// Mock the store locator provider
const mockOpen = vi.fn();
const mockStoreLocator = {
    selectedStoreInfo: null as { inventoryId: string; name: string } | null,
    open: mockOpen,
    isOpen: false,
};

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (selector: any) => selector(mockStoreLocator),
}));

// Wrapper component to provide routing context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ConfigWrapper>
        <MemoryRouter>{children}</MemoryRouter>
    </ConfigWrapper>
);

describe('RefineInventory', () => {
    const mockToggleFilter = vi.fn();
    const mockIsFilterSelected = vi.fn();
    const mockHasActiveFilter = vi.fn();

    beforeEach(() => {
        mockToggleFilter.mockClear();
        mockIsFilterSelected.mockClear();
        mockHasActiveFilter.mockClear();
        mockOpen.mockClear();
        mockStoreLocator.selectedStoreInfo = null;
        mockHasActiveFilter.mockImplementation(() => false);
    });

    test('renders the component with heading and checkbox', () => {
        mockIsFilterSelected.mockReturnValue(false);

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        expect(screen.getByText('Shop by Availability')).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeInTheDocument();
        expect(screen.getByTestId('sf-store-inventory-filter')).toBeInTheDocument();
    });

    test('displays "Select Store" when no store is selected', () => {
        mockIsFilterSelected.mockReturnValue(false);

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        expect(screen.getByText('Select Store')).toBeInTheDocument();
    });

    test('checkbox is unchecked when filter is not selected', () => {
        mockIsFilterSelected.mockReturnValue(false);

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();
    });

    test('checkbox is checked when filter is selected', () => {
        mockIsFilterSelected.mockReturnValue(true);
        mockHasActiveFilter.mockImplementation((attributeId) => attributeId === 'ilids');
        mockStoreLocator.selectedStoreInfo = {
            inventoryId: 'inventory_m_store_store1',
            name: 'Downtown Store',
        };

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
    });

    test('displays store name when a store is selected', () => {
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = {
            inventoryId: 'inventory_m_store_store1',
            name: 'Downtown Store',
        };

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        expect(screen.getByText('Downtown Store')).toBeInTheDocument();
    });

    test('calls toggleFilter when checkbox is clicked with a selected store', async () => {
        const user = userEvent.setup();
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = {
            inventoryId: 'inventory_m_store_store1',
            name: 'Downtown Store',
        };

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        expect(mockToggleFilter).toHaveBeenCalledWith('ilids', 'inventory_m_store_store1');
    });

    test('checkbox opens store locator when no store is selected', async () => {
        const user = userEvent.setup();
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = null;

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeDisabled();

        await user.click(checkbox);

        // Should open store locator when no store is selected
        expect(mockToggleFilter).not.toHaveBeenCalled();
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    test('has proper accessibility attributes', () => {
        mockIsFilterSelected.mockReturnValue(false);

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('aria-label');
        expect(checkbox).toHaveAttribute('id', 'inventory-filter');
    });

    test('store name button has proper accessibility when no store selected', () => {
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = null;

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const storeButton = screen.getByRole('button', { name: /Select Store/i });
        expect(storeButton).toBeInTheDocument();
        expect(storeButton).toHaveAttribute('tabIndex', '0');
    });

    test('store name button has proper accessibility when store is selected', () => {
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = {
            inventoryId: 'inventory_m_store_store1',
            name: 'Downtown Store',
        };

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const storeButton = screen.getByRole('button', { name: /Change Store/i });
        expect(storeButton).toBeInTheDocument();
        expect(storeButton).toHaveAttribute('tabIndex', '0');
    });

    test('clicking store name button opens store locator', async () => {
        const user = userEvent.setup();
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = {
            inventoryId: 'inventory_m_store_store1',
            name: 'Downtown Store',
        };

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const storeButton = screen.getByRole('button', { name: /Change Store/i });
        await user.click(storeButton);

        // Verify that the store locator was opened
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    test('pressing Enter on store name button triggers it', async () => {
        const user = userEvent.setup();
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = null;

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const storeButton = screen.getByRole('button', { name: /Select Store/i });
        storeButton.focus();
        await user.keyboard('{Enter}');

        // Verify that the store locator was opened
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    test('pressing other keys on store name button does not trigger it', async () => {
        const user = userEvent.setup();
        mockIsFilterSelected.mockReturnValue(false);
        mockStoreLocator.selectedStoreInfo = null;

        render(
            <TestWrapper>
                <RefineInventory
                    isFilterSelected={mockIsFilterSelected}
                    hasActiveFilter={mockHasActiveFilter}
                    toggleFilter={mockToggleFilter}
                />
            </TestWrapper>
        );

        const storeButton = screen.getByRole('button', { name: /Select Store/i });
        storeButton.focus();
        await user.keyboard('a');

        // Verify that the store locator was NOT opened for other keys
        expect(mockOpen).not.toHaveBeenCalled();
    });
});
