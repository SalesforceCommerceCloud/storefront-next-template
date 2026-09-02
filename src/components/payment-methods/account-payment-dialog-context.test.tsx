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

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
    AddPaymentMethodDialogProvider,
    RemovePaymentMethodDialogProvider,
    useAddPaymentMethodDialog,
    useRemovePaymentMethodDialog,
    type AddPaymentMethodDialogContextValue,
    type RemovePaymentMethodDialogContextValue,
} from './account-payment-dialog-context';
import type { PaymentMethod } from './payment-method-card';

const addValue = (): AddPaymentMethodDialogContextValue => ({
    addresses: [],
    isLoading: false,
    onClose: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
});

const removeValue = (): RemovePaymentMethodDialogContextValue => ({
    paymentMethod: {
        id: 'pi-1',
        type: 'Visa',
        last4: '1111',
        expiryMonth: '12',
        expiryYear: '2030',
        cardholderName: 'Test',
        isDefault: false,
    } satisfies PaymentMethod,
    isLoading: false,
    onClose: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
});

describe('account payment dialog context', () => {
    it('exposes add-dialog values to descendants', () => {
        const value = addValue();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AddPaymentMethodDialogProvider value={value}>{children}</AddPaymentMethodDialogProvider>
        );
        const { result } = renderHook(() => useAddPaymentMethodDialog(), { wrapper });
        expect(result.current).toBe(value);
    });

    it('exposes remove-dialog values to descendants', () => {
        const value = removeValue();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <RemovePaymentMethodDialogProvider value={value}>{children}</RemovePaymentMethodDialogProvider>
        );
        const { result } = renderHook(() => useRemovePaymentMethodDialog(), { wrapper });
        expect(result.current).toBe(value);
    });

    it('throws when add hook is used outside its provider', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useAddPaymentMethodDialog())).toThrow(/AddPaymentMethodDialogProvider/);
        consoleError.mockRestore();
    });

    it('throws when remove hook is used outside its provider', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useRemovePaymentMethodDialog())).toThrow(/RemovePaymentMethodDialogProvider/);
        consoleError.mockRestore();
    });
});
