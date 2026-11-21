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
import type { RouterContextProvider } from 'react-router';
import { createApiClients } from '@/lib/api-clients.server';
import type { ShopperCustomers, ShopperBasketsV2 } from '@/scapi';

/** Most recently modified non-temporary basket; ID breaks ties deterministically. Never merges or creates. */
export function selectRegisteredBasket(
    baskets: ShopperCustomers.schemas['Basket'][],
    customerId: string
): string | undefined {
    return baskets
        .filter(
            (basket) =>
                basket.basketId &&
                !basket.temporaryBasket &&
                (!basket.customerInfo?.customerId || basket.customerInfo.customerId === customerId)
        )
        .sort(
            (a, b) =>
                (Date.parse(b.lastModified ?? '') || 0) - (Date.parse(a.lastModified ?? '') || 0) ||
                String(a.basketId).localeCompare(String(b.basketId))
        )[0]?.basketId;
}

export async function resolveRegisteredBasket(
    context: Readonly<RouterContextProvider>,
    customerId: string
): Promise<ShopperBasketsV2.schemas['Basket'] | undefined> {
    const clients = createApiClients(context);
    let data;
    try {
        ({ data } = await clients.shopperCustomers.getCustomerBaskets({ params: { path: { customerId } } }));
    } catch (error) {
        // A backend that does not accept the agent token on the customer API must not take the whole page down;
        // the agent then starts from an empty basket.
        if ((error as { status?: number }).status === 403) return undefined;
        throw error;
    }
    const basketId = selectRegisteredBasket(data.baskets ?? [], customerId);
    if (!basketId) return undefined;
    return (
        await clients.shopperBasketsV2.getBasket({
            params: { path: { basketId }, query: { expand: ['approaching_discounts'] } },
        })
    ).data;
}
