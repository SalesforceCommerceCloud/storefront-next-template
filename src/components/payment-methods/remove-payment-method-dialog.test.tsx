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
import { RemovePaymentMethodDialog } from './remove-payment-method-dialog';
import type { PaymentMethod } from './payment-method-card';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

// Passthrough — transformTargets strips <UITarget> at compile time in tests.
vi.mock('@/targets/ui-target', () => ({
    UITarget: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('RemovePaymentMethodDialog', () => {
    const mockPaymentMethod: PaymentMethod = {
        id: '1',
        type: 'visa',
        last4: '4242',
        expiryMonth: '12',
        expiryYear: '2026',
        cardholderName: 'John Doe',
        isDefault: false,
    };

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        paymentMethod: mockPaymentMethod,
        onConfirm: vi.fn(),
    };

    test('renders dialog when open is true', () => {
        render(<RemovePaymentMethodDialog {...defaultProps} />);

        expect(screen.getByText(t('account:paymentMethods.removePaymentMethod'))).toBeInTheDocument();
    });

    test('does not render dialog when open is false', () => {
        render(<RemovePaymentMethodDialog {...defaultProps} open={false} />);

        expect(screen.queryByText(t('account:paymentMethods.removePaymentMethod'))).not.toBeInTheDocument();
    });

    test('displays payment method details', () => {
        render(<RemovePaymentMethodDialog {...defaultProps} />);

        expect(screen.getByText(/4242/)).toBeInTheDocument();
        expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });

    test('shows warning for default payment method', () => {
        const defaultPayment = { ...mockPaymentMethod, isDefault: true };
        render(<RemovePaymentMethodDialog {...defaultProps} paymentMethod={defaultPayment} />);

        expect(screen.getByText(t('account:paymentMethods.defaultRemovalWarning'))).toBeInTheDocument();
    });

    test('calls onOpenChange when cancel button is clicked', async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();

        render(<RemovePaymentMethodDialog {...defaultProps} onOpenChange={onOpenChange} />);

        await user.click(screen.getAllByText(t('account:paymentMethods.cancel'))[0]);
        expect(onOpenChange).toHaveBeenCalled();
    });

    test('shows final confirmation dialog when remove is clicked', async () => {
        const user = userEvent.setup();
        render(<RemovePaymentMethodDialog {...defaultProps} />);

        const removeButtons = screen.getAllByRole('button', { name: t('account:paymentMethods.remove') });
        await user.click(removeButtons[0]);

        // Wait for second dialog to appear
        await screen.findAllByText(t('account:paymentMethods.removeConfirmation'));
    });

    test('calls onConfirm when final remove is clicked', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();

        render(<RemovePaymentMethodDialog {...defaultProps} onConfirm={onConfirm} />);

        // Click first remove button
        const removeButtons = screen.getAllByRole('button', { name: t('account:paymentMethods.remove') });
        await user.click(removeButtons[0]);

        // Wait and click final remove button
        const finalRemoveButtons = await screen.findAllByRole('button', { name: t('account:paymentMethods.remove') });
        await user.click(finalRemoveButtons[finalRemoveButtons.length - 1]);

        expect(onConfirm).toHaveBeenCalled();
    });
});
