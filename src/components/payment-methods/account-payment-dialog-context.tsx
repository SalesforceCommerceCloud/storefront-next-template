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

import { createContext, useContext, type ReactNode } from 'react';
import type { ShopperCustomers } from '@/scapi';
import type { PaymentMethod } from './payment-method-card';

/**
 * Host-owned add-payment dialog contract for extensions that replace
 * `sfcc.myAccount.payments.addMethod` (form body inside the shared shell).
 * Close/cancel stay on the host Dialog; CAP calls onComplete / onError after ECOM.
 */
export type AddPaymentMethodDialogContextValue = {
    addresses: ShopperCustomers.schemas['CustomerAddress'][];
    isLoading: boolean;
    /** Close the shared shell without treating the flow as complete. */
    onClose: () => void;
    /** CAP finished setup/complete successfully — host closes, toasts, revalidates. */
    onComplete: () => void;
    /** CAP setup/complete failed — host surfaces an error; shell may stay open. */
    onError: (error?: unknown) => void;
};

/**
 * Host-owned remove-payment dialog contract for extensions that replace
 * `sfcc.myAccount.payments.removeMethod`.
 */
export type RemovePaymentMethodDialogContextValue = {
    paymentMethod: PaymentMethod;
    isLoading: boolean;
    onClose: () => void;
    onComplete: () => void;
    onError: (error?: unknown) => void;
};

const AddPaymentMethodDialogContext = createContext<AddPaymentMethodDialogContextValue | null>(null);
const RemovePaymentMethodDialogContext = createContext<RemovePaymentMethodDialogContextValue | null>(null);

export function AddPaymentMethodDialogProvider({
    value,
    children,
}: {
    value: AddPaymentMethodDialogContextValue;
    children: ReactNode;
}) {
    return <AddPaymentMethodDialogContext.Provider value={value}>{children}</AddPaymentMethodDialogContext.Provider>;
}

export function RemovePaymentMethodDialogProvider({
    value,
    children,
}: {
    value: RemovePaymentMethodDialogContextValue;
    children: ReactNode;
}) {
    return (
        <RemovePaymentMethodDialogContext.Provider value={value}>{children}</RemovePaymentMethodDialogContext.Provider>
    );
}

/**
 * Context for the add-payment shared dialog shell. Use from extensions registered
 * on `sfcc.myAccount.payments.addMethod`.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useAddPaymentMethodDialog(): AddPaymentMethodDialogContextValue {
    const value = useContext(AddPaymentMethodDialogContext);
    if (!value) {
        throw new Error(
            'useAddPaymentMethodDialog must be used inside <AddPaymentMethodDialogProvider> (add payment dialog shell).'
        );
    }
    return value;
}

/**
 * Context for the remove-payment shared dialog shell. Use from extensions registered
 * on `sfcc.myAccount.payments.removeMethod`.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useRemovePaymentMethodDialog(): RemovePaymentMethodDialogContextValue {
    const value = useContext(RemovePaymentMethodDialogContext);
    if (!value) {
        throw new Error(
            'useRemovePaymentMethodDialog must be used inside <RemovePaymentMethodDialogProvider> (remove payment dialog shell).'
        );
    }
    return value;
}
