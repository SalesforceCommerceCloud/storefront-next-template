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
import type { Client } from 'openapi-fetch';
import type { ShopperBasketsV2 } from '../types';
import type { ProxyClient } from '../proxy-types';
import type { operations as shopperBasketsV2Ops } from '../generated/shopper-baskets-v2.operations';

/**
 * Basket schema from Shopper Baskets V2.
 */
export type Basket = ShopperBasketsV2.schemas['Basket'];

/**
 * Shopper Baskets V2 client type used by basket helpers.
 */
export type ShopperBasketsV2Client = ProxyClient<Client<ShopperBasketsV2.endpoints>, typeof shopperBasketsV2Ops>;

/**
 * Configuration required for basket helpers.
 */
export interface BasketHelpersConfig {
    shopperBasketsClient: ShopperBasketsV2Client;
}

export interface BasketHelpersNamespace {
    getOrCreateBasket: (options: GetOrCreateBasketOptions) => Promise<Basket>;
}

/**
 * Query parameters accepted by the Shopper Baskets V2 `getBasket` operation (global params like
 * `siteId` are auto-injected, so they're optional here). Callers request expansions; the SDK never
 * hardcodes a value.
 */
export type GetBasketQuery = NonNullable<
    NonNullable<Parameters<ShopperBasketsV2Client['getBasket']>[0]>['params']
>['query'];

/**
 * Options for retrieving or creating a basket.
 */
export interface GetOrCreateBasketOptions {
    params: {
        path?: {
            basketId?: string;
        };
        /** Optional query forwarded to the GET basket operation (e.g. `{ expand: ['approaching_discounts'] }`). */
        query?: GetBasketQuery;
    };
    body: {
        currency: string;
    };
}
