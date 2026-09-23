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
import type { ShopperBasketsV2 } from '@/scapi';

/**
 * Finds the basket line for the PDP's selected SKU and fulfillment choice.
 *
 * A BOPIS line is associated with its shipment's `c_fromStoreId`, rather than
 * a `ProductItem` field. An explicit pickup selection must match that store
 * exactly: falling back to a delivery line would update the wrong fulfillment.
 */
export function findBasketItemForProduct(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    productId: string | undefined,
    storeId?: string | null
): ShopperBasketsV2.schemas['ProductItem'] | undefined {
    if (!basket?.productItems || !productId) {
        return undefined;
    }

    const matchingItems = basket.productItems.filter((item) => item.productId === productId);
    const storeIdForItem = (item: ShopperBasketsV2.schemas['ProductItem']) => {
        const shipment = basket.shipments?.find((candidate) => candidate.shipmentId === item.shipmentId);
        return typeof shipment?.c_fromStoreId === 'string' ? shipment.c_fromStoreId : undefined;
    };

    if (storeId) {
        return matchingItems.find((item) => storeIdForItem(item) === storeId);
    }

    // Ship-to-home: the normal PDP add path lands in the default `me` shipment, so target only that
    // line. Multi-address checkout can move this SKU to another recipient's (also non-pickup)
    // shipment; binding the stepper to that line would update or remove the wrong recipient's item.
    // When the SKU isn't in `me`, return undefined so the PDP offers a fresh add to `me` instead of
    // hijacking another recipient's line.
    return matchingItems.find((item) => item.shipmentId === 'me');
}
