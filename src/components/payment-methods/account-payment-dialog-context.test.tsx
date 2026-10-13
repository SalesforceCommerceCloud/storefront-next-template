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
    useAddPaymentMethodDialog,
    type AddPaymentMethodDialogContextValue,
} from './account-payment-dialog-context';

const addValue = (): AddPaymentMethodDialogContextValue => ({
    addresses: [
        {
            addressId: 'addr_1',
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '1 Market St',
            city: 'San Francisco',
            countryCode: 'US',
        },
    ],
    email: 'jane@example.com',
    isLoading: false,
    setBusy: vi.fn(),
    onClose: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
});

describe('account payment dialog context', () => {
    it('exposes the CAP Account Add host dialog contract', () => {
        const value = addValue();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AddPaymentMethodDialogProvider value={value}>{children}</AddPaymentMethodDialogProvider>
        );
        const { result } = renderHook(() => useAddPaymentMethodDialog(), { wrapper });

        // CAP AccountAddSavedPaymentMethod depends on this shape — catch host/CAP stub drift.
        expect(Object.keys(result.current).sort()).toEqual([
            'addresses',
            'email',
            'isLoading',
            'onClose',
            'onComplete',
            'onError',
            'setBusy',
        ]);
        expect(result.current).toBe(value);
        expect(result.current.email).toBe('jane@example.com');
        expect(result.current.addresses).toHaveLength(1);
    });

    it('throws when add hook is used outside its provider', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useAddPaymentMethodDialog())).toThrow(/AddPaymentMethodDialogProvider/);
        consoleError.mockRestore();
    });
});
