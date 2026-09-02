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
import { describe, test, expect, vi } from 'vitest';
import type { ShopperCustomers } from '@/scapi';
import { AddPaymentMethodDialog } from './add-payment-method-dialog';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

// Mock child components
vi.mock('@/components/credit-card-input-fields', () => ({
    CreditCardInputFields: () => <div data-testid="credit-card-fields">Credit Card Fields</div>,
}));

vi.mock('@/components/address-form-fields', () => ({
    AddressFormFields: () => <div data-testid="address-form-fields">Address Fields</div>,
}));

// Passthrough — transformTargets strips <UITarget> at compile time in tests.
vi.mock('@/targets/ui-target', () => ({
    UITarget: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('AddPaymentMethodDialog', () => {
    const mockAddresses: ShopperCustomers.schemas['CustomerAddress'][] = [
        {
            addressId: 'address-1',
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'New York',
            countryCode: 'US',
        },
    ];

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        onSubmitForm: vi.fn(),
        addresses: mockAddresses,
    };

    test('renders dialog when open is true', () => {
        render(<AddPaymentMethodDialog {...defaultProps} />);

        expect(screen.getByText(t('account:paymentMethods.addPaymentMethodTitle'))).toBeInTheDocument();
    });

    test('does not render dialog when open is false', () => {
        render(<AddPaymentMethodDialog {...defaultProps} open={false} />);

        expect(screen.queryByText(t('account:paymentMethods.addPaymentMethodTitle'))).not.toBeInTheDocument();
    });

    test('renders credit card input fields', () => {
        render(<AddPaymentMethodDialog {...defaultProps} />);

        expect(screen.getByTestId('credit-card-fields')).toBeInTheDocument();
    });

    test('renders billing address select', () => {
        render(<AddPaymentMethodDialog {...defaultProps} />);

        expect(screen.getByText(t('account:paymentMethods.billingAddress'))).toBeInTheDocument();
    });

    test('calls onOpenChange when cancel button is clicked', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();

        render(<AddPaymentMethodDialog {...defaultProps} onOpenChange={onOpenChange} />);

        await user.click(screen.getAllByText(t('account:paymentMethods.cancel'))[0]);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test('shows error when save is clicked without selecting a billing address', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(<AddPaymentMethodDialog {...defaultProps} onSubmitForm={onSubmit} />);

        await user.click(screen.getByText(t('account:paymentMethods.save')));

        expect(
            screen.getByText(t('account:paymentMethods.selectAddressError', 'Please select a billing address'))
        ).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });
});
