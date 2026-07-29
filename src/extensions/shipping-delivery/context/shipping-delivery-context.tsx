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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { EstimatedDeliveryData } from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';

export interface ShippingDeliveryContextValue {
    estimatedDeliveryPromise: Promise<EstimatedDeliveryData>;
}

const ShippingDeliveryContext = createContext<ShippingDeliveryContextValue | null>(null);

export function useShippingDelivery(): ShippingDeliveryContextValue | null {
    return useContext(ShippingDeliveryContext);
}

export type ShippingDeliveryProviderProps = PropsWithChildren<{
    estimatedDeliveryPromise: Promise<EstimatedDeliveryData>;
}>;

export function ShippingDeliveryProvider({
    estimatedDeliveryPromise,
    children,
}: ShippingDeliveryProviderProps): ReactElement {
    return (
        <ShippingDeliveryContext.Provider value={{ estimatedDeliveryPromise }}>
            {children}
        </ShippingDeliveryContext.Provider>
    );
}
