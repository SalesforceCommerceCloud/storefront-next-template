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
import type { PaymentSubmissionRef } from '@/hooks/use-checkout-actions';

const PaymentSubmissionRefContext = createContext<PaymentSubmissionRef | null>(null);

/**
 * Wraps the checkout payment region so extension components rendered inside
 * a `<UITarget>` can reach `paymentSubmissionRef` via context. The storefront
 * mounts this provider; extensions consume via `usePaymentSubmissionRef()`.
 */
export function PaymentSubmissionRefProvider({
    refValue,
    children,
}: {
    refValue: PaymentSubmissionRef;
    children: ReactNode;
}) {
    return <PaymentSubmissionRefContext.Provider value={refValue}>{children}</PaymentSubmissionRefContext.Provider>;
}

/**
 * Returns the storefront's `paymentSubmissionRef`. Extension components call
 * this from inside the checkout payment region (any `UITarget` under the
 * provider) to register `onPlaceOrder`.
 *
 * Throws when used outside the provider so misuses fail loudly during dev.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function usePaymentSubmissionRef(): PaymentSubmissionRef {
    const ref = useContext(PaymentSubmissionRefContext);
    if (!ref) {
        throw new Error(
            'usePaymentSubmissionRef must be used inside <PaymentSubmissionRefProvider> (the checkout payment region).'
        );
    }
    return ref;
}
