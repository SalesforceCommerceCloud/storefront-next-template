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
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import AddressCard from './index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
import type { ShopperCustomers } from '@/scapi';

// Mock AddressDisplay component
vi.mock('@/components/address-display', () => ({
    default: ({
        address,
        isPreferred,
    }: {
        address: ShopperCustomers.schemas['CustomerAddress'];
        isPreferred?: boolean;
    }) => (
        <div data-testid="address-display">
            {address.firstName} {address.lastName}
            {isPreferred && <span>{t('account:addresses.default')}</span>}
            {address.address1 && `, ${address.address1}`}
        </div>
    ),
}));

describe('AddressCard', () => {
    const mockAddress: ShopperCustomers.schemas['CustomerAddress'] = {
        addressId: 'address-123',
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main Street',
        city: 'New York',
        stateCode: 'NY',
        postalCode: '10001',
        countryCode: 'US',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        test('renders address card with address data', () => {
            render(<AddressCard address={mockAddress} />);

            expect(screen.getByTestId('address-display')).toBeInTheDocument();
        });

        test('does not display card header', () => {
            const { container } = render(<AddressCard address={mockAddress} />);

            // Card header should not exist
            const cardHeader = container.querySelector('[data-slot="card-header"]');
            expect(cardHeader).not.toBeInTheDocument();
        });

        test('renders AddressDisplay component with address prop', () => {
            render(<AddressCard address={mockAddress} />);

            const addressDisplay = screen.getByTestId('address-display');
            expect(addressDisplay).toBeInTheDocument();
            expect(addressDisplay.textContent).toContain('John Doe');
            expect(addressDisplay.textContent).toContain('123 Main Street');
        });
    });

    describe('Default Badge', () => {
        test('passes isPreferred prop to AddressDisplay when true', () => {
            render(<AddressCard address={mockAddress} isPreferred={true} />);

            // Badge is now rendered inside AddressDisplay, check it exists
            expect(screen.getByText(t('account:addresses.default'))).toBeInTheDocument();
        });

        test('does not display default badge when isPreferred is false', () => {
            render(<AddressCard address={mockAddress} isPreferred={false} />);

            expect(screen.queryByText(t('account:addresses.default'))).not.toBeInTheDocument();
        });

        test('does not display default badge when isPreferred is not provided (defaults to false)', () => {
            render(<AddressCard address={mockAddress} />);

            expect(screen.queryByText(t('account:addresses.default'))).not.toBeInTheDocument();
        });
    });

    describe('Action Buttons', () => {
        test('does not render footer when no action handlers are provided', () => {
            const { container } = render(<AddressCard address={mockAddress} />);

            const footer = container.querySelector('[data-slot="card-footer"]');
            expect(footer).toBeNull();
        });

        test('renders Edit button when onEdit is provided', () => {
            const onEdit = vi.fn();
            render(<AddressCard address={mockAddress} onEdit={onEdit} />);

            const editButton = screen.getByRole('button', { name: t('account:addresses.editAddress') });
            expect(editButton).toBeInTheDocument();
            expect(editButton).toHaveAttribute('aria-label', t('account:addresses.editAddress'));
        });

        test('renders Remove button when onRemove is provided', () => {
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onRemove={onRemove} />);

            const removeButton = screen.getByRole('button', { name: t('actionCard:remove') });
            expect(removeButton).toBeInTheDocument();
            expect(removeButton).toHaveAttribute('aria-label', t('actionCard:remove'));
        });

        test('renders both Edit and Remove buttons when both handlers are provided', () => {
            const onEdit = vi.fn();
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onEdit={onEdit} onRemove={onRemove} />);

            expect(screen.getByRole('button', { name: t('account:addresses.editAddress') })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: t('actionCard:remove') })).toBeInTheDocument();
        });

        test('renders footer when at least one action handler is provided', () => {
            const onEdit = vi.fn();
            const { container } = render(<AddressCard address={mockAddress} onEdit={onEdit} />);

            const footer = container.querySelector('[data-slot="card-footer"]');
            expect(footer).toBeInTheDocument();
        });
    });

    describe('Button Interactions', () => {
        test('calls onEdit when Edit button is clicked', async () => {
            const user = userEvent.setup();
            const onEdit = vi.fn();
            render(<AddressCard address={mockAddress} onEdit={onEdit} />);

            const editButton = screen.getByRole('button', { name: t('account:addresses.editAddress') });
            await user.click(editButton);

            expect(onEdit).toHaveBeenCalledTimes(1);
        });

        test('calls onRemove when Remove button is clicked', async () => {
            const user = userEvent.setup();
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onRemove={onRemove} />);

            const removeButton = screen.getByRole('button', { name: t('actionCard:remove') });
            await user.click(removeButton);

            expect(onRemove).toHaveBeenCalledTimes(1);
        });

        test('calls both handlers independently when both buttons are clicked', async () => {
            const user = userEvent.setup();
            const onEdit = vi.fn();
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onEdit={onEdit} onRemove={onRemove} />);

            const editButton = screen.getByRole('button', { name: t('account:addresses.editAddress') });
            const removeButton = screen.getByRole('button', { name: t('actionCard:remove') });

            await user.click(editButton);
            expect(onEdit).toHaveBeenCalledTimes(1);
            expect(onRemove).not.toHaveBeenCalled();

            await user.click(removeButton);
            expect(onRemove).toHaveBeenCalledTimes(1);
            expect(onEdit).toHaveBeenCalledTimes(1); // Still only called once
        });
    });

    describe('Button Styling', () => {
        test('Remove button has link styling classes', () => {
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onRemove={onRemove} />);

            const removeButton = screen.getByRole('button', { name: t('actionCard:remove') });
            expect(removeButton).toHaveClass('font-bold');
            expect(removeButton).toHaveClass('px-0');
        });
    });

    describe('Card Structure', () => {
        test('card has correct className', () => {
            const { container } = render(<AddressCard address={mockAddress} />);

            const card = container.querySelector('[data-slot="card"]');
            expect(card).toHaveClass('border-border', 'gap-0', 'py-4');
        });

        test('card does not have header section', () => {
            const { container } = render(<AddressCard address={mockAddress} isPreferred={true} />);

            // Card header should not exist
            const cardHeader = container.querySelector('[data-slot="card-header"]');
            expect(cardHeader).not.toBeInTheDocument();
        });

        test('card content contains AddressDisplay', () => {
            render(<AddressCard address={mockAddress} />);

            const content = screen.getByTestId('address-display').closest('[data-slot="card-content"]');
            expect(content).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        test('handles address with minimal required fields', () => {
            const minimalAddress: ShopperCustomers.schemas['CustomerAddress'] = {
                addressId: 'minimal-address',
                countryCode: 'US',
                firstName: 'Jane',
                lastName: 'Smith',
            };

            render(<AddressCard address={minimalAddress} />);

            // Display name (firstName + lastName) is shown - check it exists
            expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0);
            expect(screen.getByTestId('address-display')).toBeInTheDocument();
        });

        test('handles address with missing name fields', () => {
            // oxlint-disable-next-line @typescript-eslint/no-unused-vars
            const { firstName, lastName, ...addressWithNoName } = mockAddress;

            const { container } = render(
                <AddressCard address={addressWithNoName as ShopperCustomers.schemas['CustomerAddress']} />
            );

            // AddressDisplay should still render
            const addressDisplay = container.querySelector('[data-testid="address-display"]');
            expect(addressDisplay).toBeInTheDocument();
        });

        test('handles multiple rapid clicks on Edit button', async () => {
            const user = userEvent.setup();
            const onEdit = vi.fn();
            render(<AddressCard address={mockAddress} onEdit={onEdit} />);

            const editButton = screen.getByRole('button', { name: t('account:addresses.editAddress') });
            await user.click(editButton);
            await user.click(editButton);
            await user.click(editButton);

            expect(onEdit).toHaveBeenCalledTimes(3);
        });

        test('handles multiple rapid clicks on Remove button', async () => {
            const user = userEvent.setup();
            const onRemove = vi.fn();
            render(<AddressCard address={mockAddress} onRemove={onRemove} />);

            const removeButton = screen.getByRole('button', { name: t('actionCard:remove') });
            await user.click(removeButton);
            await user.click(removeButton);

            expect(onRemove).toHaveBeenCalledTimes(2);
        });
    });
});
