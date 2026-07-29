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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RemoveAddressConfirmationDialog } from './index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperCustomers } from '@/scapi';
import type { ScapiFetcher } from '@/hooks/use-scapi-fetcher';

const { t } = getTranslation();

// Mock the toast hook
const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

// Mock the revalidator hook - will be spied on in beforeEach
const mockRevalidate = vi.fn();

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
    return render(<RouterProvider router={router} />);
}

// Mock AddressDisplay component
vi.mock('@/components/address-display', () => ({
    default: ({ address }: { address: ShopperCustomers.schemas['CustomerAddress'] }) => (
        <div data-testid="address-display">{address.address1}</div>
    ),
}));

// Mock useScapiFetcher and useScapiFetcherEffect
const mockSubmit = vi.fn().mockResolvedValue(undefined);
const mockFetcher = {
    state: 'idle',
    data: undefined,
    success: false,
    errors: undefined,
    submit: mockSubmit,
    load: vi.fn().mockResolvedValue(undefined),
    formAction: undefined,
    formData: undefined,
    formEncType: 'application/x-www-form-urlencoded',
    formMethod: 'GET',
    formTarget: undefined,
    type: 'init',
} as unknown as ScapiFetcher<unknown>;

vi.mock('@/hooks/use-scapi-fetcher', async () => {
    const actual = await vi.importActual('@/hooks/use-scapi-fetcher');
    return {
        ...actual,
        useScapiFetcher: vi.fn(() => mockFetcher),
    };
});

// Mock useScapiFetcherEffect to simulate state changes
let mockOnSuccess: ((data: unknown) => void) | undefined;
let mockOnError: ((errors: string[]) => void) | undefined;
let currentFetcherState: 'idle' | 'loading' | 'submitting' = 'idle';
let currentFetcherSuccess = false;
let currentFetcherErrors: string[] | undefined = undefined;

vi.mock('@/hooks/use-scapi-fetcher-effect', () => ({
    useScapiFetcherEffect: vi.fn(
        (
            fetcher: ScapiFetcher<unknown>,
            config: { onSuccess?: (data: unknown) => void; onError?: (errors: string[]) => void }
        ) => {
            mockOnSuccess = config.onSuccess;
            mockOnError = config.onError;

            // Simulate effect running when fetcher state changes
            if (fetcher.state === 'idle' && fetcher.success && mockOnSuccess) {
                mockOnSuccess(fetcher.data);
            } else if (fetcher.state === 'idle' && !fetcher.success && fetcher.errors && mockOnError) {
                mockOnError(fetcher.errors);
            }
        }
    ),
}));

// Helper to update fetcher state
function updateFetcherState(state: 'idle' | 'loading' | 'submitting', success: boolean = false, errors?: string[]) {
    currentFetcherState = state;
    currentFetcherSuccess = success;
    currentFetcherErrors = errors;
    Object.assign(mockFetcher, {
        state: currentFetcherState,
        success: currentFetcherSuccess,
        errors: currentFetcherErrors,
    });
}

describe('RemoveAddressConfirmationDialog', () => {
    const mockAddress: ShopperCustomers.schemas['CustomerAddress'] = {
        addressId: 'address-123',
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main Street',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        countryCode: 'US',
        preferred: false,
    };

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        address: mockAddress,
        customerId: 'customer-456',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnSuccess = undefined;
        mockOnError = undefined;
        updateFetcherState('idle', false);
        mockSubmit.mockResolvedValue(undefined);
        // Use vi.spyOn for useRevalidator hook
        vi.spyOn(ReactRouter, 'useRevalidator').mockReturnValue({
            revalidate: mockRevalidate,
            state: 'idle',
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders dialog when open is true', () => {
        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        expect(screen.getByText(t('account:addresses.removeDialogTitle'))).toBeInTheDocument();
        expect(screen.getByText(t('account:addresses.removeDialogDescription'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('account:addresses.removeCancelButton') })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('account:addresses.removeButton') })).toBeInTheDocument();
    });

    test('does not render dialog when open is false', () => {
        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} open={false} />);

        expect(screen.queryByText(t('account:addresses.removeDialogTitle'))).not.toBeInTheDocument();
    });

    test('displays addressId in dialog', () => {
        render(<RemoveAddressConfirmationDialog {...defaultProps} />);

        // Dialog displays addressId in the heading
        expect(screen.getByText('address-123')).toBeInTheDocument();
    });

    test('displays default badge when address is preferred', () => {
        const preferredAddress = { ...mockAddress, preferred: true };
        render(<RemoveAddressConfirmationDialog {...defaultProps} address={preferredAddress} />);

        expect(screen.getByText(t('account:addresses.default'))).toBeInTheDocument();
    });

    test('displays warning when removing default address', () => {
        const preferredAddress = { ...mockAddress, preferred: true };
        render(<RemoveAddressConfirmationDialog {...defaultProps} address={preferredAddress} />);

        expect(screen.getByText(t('account:addresses.removeDefaultWarning'))).toBeInTheDocument();
    });

    test('calls onOpenChange(false) when cancel button is clicked', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} onOpenChange={onOpenChange} />);

        const cancelButton = screen.getByRole('button', { name: t('account:addresses.removeCancelButton') });
        await user.click(cancelButton);

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('calls fetcher.submit when confirm button is clicked', async () => {
        const user = userEvent.setup();

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        const confirmButton = screen.getByRole('button', { name: t('account:addresses.removeButton') });
        await user.click(confirmButton);

        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockSubmit).toHaveBeenCalledWith();
    });

    test('disables confirm button when loading', () => {
        updateFetcherState('submitting');

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        const confirmButton = screen.getByRole('button', { name: t('account:addresses.removeButton') });
        expect(confirmButton).toBeDisabled();
    });

    test('calls onSuccess callback when removal succeeds', async () => {
        const onSuccess = vi.fn();
        updateFetcherState('idle', true);

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} onSuccess={onSuccess} />);

        // Simulate success by calling the onSuccess callback directly
        if (mockOnSuccess) {
            mockOnSuccess(undefined);
        }

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(t('account:addresses.removeSuccess'), 'success');
        });

        expect(onSuccess).toHaveBeenCalled();
    });

    test('closes dialog when removal succeeds', async () => {
        const onOpenChange = vi.fn();
        updateFetcherState('idle', true);

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} onOpenChange={onOpenChange} />);

        // Simulate success
        if (mockOnSuccess) {
            mockOnSuccess(undefined);
        }

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });

    test('revalidates data when removal succeeds', async () => {
        updateFetcherState('idle', true);

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        // Simulate success
        if (mockOnSuccess) {
            mockOnSuccess(undefined);
        }

        await waitFor(() => {
            expect(mockRevalidate).toHaveBeenCalled();
        });
    });

    test('shows error toast when removal fails', async () => {
        const errors = ['Failed to remove address'];
        updateFetcherState('idle', false, errors);

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        // Simulate error
        if (mockOnError) {
            mockOnError(errors);
        }

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(errors.join(', '), 'error');
        });
    });

    test('shows default error message when removal fails without specific errors', async () => {
        updateFetcherState('idle', false, []);

        renderWithRouter(<RemoveAddressConfirmationDialog {...defaultProps} />);

        // Simulate error
        if (mockOnError) {
            mockOnError([]);
        }

        await waitFor(() => {
            expect(mockAddToast).toHaveBeenCalledWith(t('account:addresses.removeError'), 'error');
        });
    });
});
