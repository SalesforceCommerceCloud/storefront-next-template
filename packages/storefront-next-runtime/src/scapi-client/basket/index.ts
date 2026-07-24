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
import { ApiError } from '../ApiError';
import type { Basket, BasketHelpersConfig, BasketHelpersNamespace, GetOrCreateBasketOptions } from './types';

export type {
    Basket,
    BasketHelpersConfig,
    BasketHelpersNamespace,
    GetOrCreateBasketOptions,
    ShopperBasketsV2Client,
} from './types';

/**
 * Get an existing basket or create a new one when missing/unavailable.
 *
 * Currency is passed via the basket request body (Shopper Baskets V2).
 *
 * @param config - Helper configuration containing the Shopper Baskets client
 * @param options - Basket identifiers and create options
 * @returns Basket instance (existing or newly created)
 *
 * @example
 * ```ts
 * const basketHelpers = createBasketHelpers({ shopperBasketsClient: clients.shopperBasketsV2 });
 * const basket = await basketHelpers.getOrCreateBasket({
 *   params: { path: { basketId } },
 *   body: { currency: 'USD' },
 * });
 * ```
 */
export function createBasketHelpers(config: BasketHelpersConfig): BasketHelpersNamespace {
    const { shopperBasketsClient } = config;

    /**
     * Get an existing basket or create a new one when missing/unavailable.
     *
     * @param options - Request options matching ShopperBasketsV2.getBasket style
     * @returns Basket instance (existing or newly created)
     *
     * @example
     * ```ts
     * const basketHelpers = createBasketHelpers({ shopperBasketsClient: clients.shopperBasketsV2 });
     * const basket = await basketHelpers.getOrCreateBasket({
     *   params: { path: { basketId } },
     *   body: { currency: 'USD' },
     * });
     * ```
     */
    async function getOrCreateBasket(options: GetOrCreateBasketOptions): Promise<Basket> {
        const basketId = options.params?.path?.basketId;
        const currency = options.body.currency;
        // Forward any caller-supplied query (e.g. `expand`) onto the GET basket calls, value-agnostic.
        const query = options.params?.query;

        const createBasket = async (): Promise<Basket> => {
            try {
                // `query` is not forwarded here: a fresh basket is empty, so expansions have nothing
                // to return. Callers get expanded data on the subsequent `getBasket`.
                const { data } = await shopperBasketsClient.createBasket({
                    params: {
                        query: {
                            populateCustomerDetails: true,
                        },
                    },
                    body: { currency },
                });
                return data;
            } catch (error) {
                if (error instanceof ApiError) {
                    const basketIds = error.body?.basketIds;
                    const fallbackId = (Array.isArray(basketIds) ? basketIds : [basketIds].filter(Boolean)).at(0);
                    // Quota exceeded sometimes returns 429 (or 400) with basketIds; reuse the provided basket if present.
                    if ((error.status === 429 || error.status === 400) && fallbackId) {
                        const { data } = await shopperBasketsClient.getBasket({
                            params: { path: { basketId: fallbackId as string }, query },
                        });
                        return data;
                    }
                }
                throw error;
            }
        };

        if (basketId) {
            try {
                const { data } = await shopperBasketsClient.getBasket({
                    params: { path: { basketId }, query },
                });
                return data;
            } catch (error) {
                if (error instanceof ApiError) {
                    // Not found or bad request -> create a fresh basket.
                    if (error.status === 404 || error.status === 400) {
                        return createBasket();
                    }

                    // Quota exceeded: API returns 429 with basketIds to reuse.
                    const basketIds = error.body?.basketIds;
                    const fallbackId = (Array.isArray(basketIds) ? basketIds : [basketIds].filter(Boolean)).at(0);
                    if (error.status === 429 && fallbackId) {
                        const { data } = await shopperBasketsClient.getBasket({
                            params: { path: { basketId: fallbackId as string }, query },
                        });
                        return data;
                    }
                }
                throw error;
            }
        }

        return createBasket();
    }

    return { getOrCreateBasket };
}
