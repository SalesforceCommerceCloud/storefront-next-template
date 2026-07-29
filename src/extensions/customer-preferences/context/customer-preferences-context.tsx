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
/** @sfdc-extension-file SFDC_EXT_CUSTOMER_PREFERENCES */
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { CustomerPreferencesData } from '@/extensions/customer-preferences/lib/api/customer-preferences.server';

const CustomerPreferencesContext = createContext<Promise<CustomerPreferencesData> | null>(null);

export function useCustomerPreferences(): Promise<CustomerPreferencesData> | null {
    return useContext(CustomerPreferencesContext);
}

export type CustomerPreferencesProviderProps = PropsWithChildren<{
    customerPreferencesPromise: Promise<CustomerPreferencesData>;
}>;

export function CustomerPreferencesProvider({
    customerPreferencesPromise,
    children,
}: CustomerPreferencesProviderProps): ReactElement {
    return (
        <CustomerPreferencesContext.Provider value={customerPreferencesPromise}>
            {children}
        </CustomerPreferencesContext.Provider>
    );
}
