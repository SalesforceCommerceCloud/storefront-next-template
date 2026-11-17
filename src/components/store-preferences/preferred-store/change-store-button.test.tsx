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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ChangeStoreButton from './change-store-button';

// Mock react-router
const mockRevalidate = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    href: (path: string) => path,
    useRevalidator: () => ({
        revalidate: mockRevalidate,
    }),
}));

// Mock the store locator hook
const mockOpen = vi.fn();
const mockState = {
    open: mockOpen,
    selectedStoreInfo: { id: 'store-001' } as { id: string } | null,
    isOpen: false,
    selectionPending: false,
    pickupPending: false,
    selectionError: null as string | null,
};
const mockRetry = vi.fn();
vi.mock('@/extensions/store-locator/providers/selection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/extensions/store-locator/providers/selection')>()),
    useStoreSelection: () => ({ retry: mockRetry }),
    useStoreSelectionFeedbackHost: vi.fn(),
}));

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

describe('ChangeStoreButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.open = mockOpen;
        mockState.selectedStoreInfo = { id: 'store-001' };
        mockState.isOpen = false;
        mockState.selectionPending = false;
        mockState.selectionError = null;
    });

    test('renders Change store button', () => {
        render(<ChangeStoreButton />);
        const button = screen.getByRole('button', { name: 'Change store' });
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-haspopup', 'dialog');
        expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    test('offers only Change store, with no control to clear the preference', () => {
        render(<ChangeStoreButton />);
        expect(screen.getByRole('button', { name: 'Change store' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    });

    test('calls openStoreLocator when button is clicked', () => {
        render(<ChangeStoreButton />);
        const button = screen.getByRole('button', { name: 'Change store' });
        fireEvent.click(button);
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    test('does not redundantly revalidate when locator closes with a different store selected', () => {
        // Start with locator open and a different store selected
        mockState.isOpen = true;
        mockState.selectedStoreInfo = { id: 'store-002' };
        const { rerender } = render(<ChangeStoreButton />);

        // No revalidation yet - locator is still open
        expect(mockRevalidate).not.toHaveBeenCalled();

        // Close the locator
        mockState.isOpen = false;
        rerender(<ChangeStoreButton />);

        // Revalidation should be triggered now that the locator closed
        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('does not trigger revalidation when locator closes with same store', () => {
        // Start with locator open, same store
        mockState.isOpen = true;
        mockState.selectedStoreInfo = { id: 'store-001' };
        const { rerender } = render(<ChangeStoreButton />);

        // Close the locator
        mockState.isOpen = false;
        rerender(<ChangeStoreButton />);

        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('does not trigger revalidation while locator is still open', () => {
        mockState.isOpen = true;
        mockState.selectedStoreInfo = { id: 'store-002' };
        render(<ChangeStoreButton />);

        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('does not trigger revalidation when store is unchanged', () => {
        render(<ChangeStoreButton />);
        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('does not trigger revalidation when no store is selected', () => {
        mockState.isOpen = true;
        mockState.selectedStoreInfo = null;
        const { rerender } = render(<ChangeStoreButton />);

        mockState.isOpen = false;
        rerender(<ChangeStoreButton />);

        expect(mockRevalidate).not.toHaveBeenCalled();
    });

    test('disables mutations during persistence and exposes retryable error', () => {
        mockState.selectionPending = true;
        const { rerender } = render(<ChangeStoreButton />);
        expect(screen.getByRole('button', { name: 'Change store' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Clear preferred store' })).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Saving');
        mockState.selectionPending = false;
        mockState.selectionError = 'persistence_failed';
        rerender(<ChangeStoreButton />);
        expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(mockRetry).toHaveBeenCalledOnce();
    });
});
