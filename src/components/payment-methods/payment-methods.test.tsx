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
import { PaymentMethods } from './payment-methods';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();

vi.mock('./payment-method-card', () => ({
    PaymentMethodCard: ({ paymentMethod, onRemove }: { paymentMethod: { last4: string }; onRemove?: () => void }) => (
        <div data-testid="payment-method-card">
            <span>Card ending in {paymentMethod.last4}</span>
            <button type="button" onClick={onRemove}>
                Remove
            </button>
        </div>
    ),
}));

vi.mock('./add-payment-method-dialog', () => ({
    AddPaymentMethodDialog: ({ open }: { open?: boolean }) =>
        open ? <div data-testid="add-dialog">Add Dialog</div> : null,
}));

vi.mock('./remove-payment-method-dialog', () => ({
    RemovePaymentMethodDialog: ({ open }: { open?: boolean }) =>
        open ? <div data-testid="remove-dialog">Remove Dialog</div> : null,
}));

vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
        useFetcher: () => ({ state: 'idle', data: null, submit: vi.fn() }),
    };
});

vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

// Passthrough only — transformTargets strips <UITarget> at compile time in tests.
vi.mock('@/targets/ui-target', () => ({
    UITarget: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('PaymentMethods', () => {
    const mockCustomer: ShopperCustomers.schemas['Customer'] = {
        customerId: 'customer-1',
        addresses: [],
        paymentInstruments: [
            {
                paymentInstrumentId: 'pi-1',
                default: false,
                paymentCard: {
                    cardType: 'Visa',
                    maskedNumber: '************1111',
                    numberLastDigits: '1111',
                    expirationMonth: 12,
                    expirationYear: 2030,
                    holder: 'Test User',
                },
            },
        ],
    };

    test('renders payment methods page with header', () => {
        render(<PaymentMethods customer={mockCustomer} />);

        expect(screen.getAllByText(t('account:navigation.paymentMethods'))[0]).toBeInTheDocument();
        expect(screen.getByText(t('account:paymentMethods.pageSubtitle'))).toBeInTheDocument();
    });

    test('renders add payment method button', () => {
        render(<PaymentMethods customer={mockCustomer} />);

        expect(screen.getByText(t('account:paymentMethods.addPaymentMethod'))).toBeInTheDocument();
    });

    test('opens add dialog when add button is clicked', async () => {
        const user = userEvent.setup();
        render(<PaymentMethods customer={mockCustomer} />);

        expect(screen.queryByTestId('add-dialog')).not.toBeInTheDocument();

        await user.click(screen.getByText(t('account:paymentMethods.addPaymentMethod')));

        expect(screen.getByTestId('add-dialog')).toBeInTheDocument();
    });

    test('opens remove dialog when remove is clicked', async () => {
        const user = userEvent.setup();
        render(<PaymentMethods customer={mockCustomer} />);

        expect(screen.queryByTestId('remove-dialog')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Remove' }));

        expect(screen.getByTestId('remove-dialog')).toBeInTheDocument();
    });
});
