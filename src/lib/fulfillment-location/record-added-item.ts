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
import { getProductAvailability, toCartFulfillment } from './availability';
import { upsertItem } from './cart-fulfillment';
import { getSelectedLocation } from './selected-location';
import { updateCartFulfillmentState } from './storage';

/**
 * Called after an add-to-cart succeeds: stores the product together with the fulfillment location the
 * shopper selected (or the default one). The quantity comes from the returned basket, not from the
 * add request, so re-adding a product never double counts. No-op for products without fulfillment data.
 */
export function recordAddedItemFulfillment(
    basket: Pick<ShopperBasketsV2.schemas['Basket'], 'productItems'>,
    productId: string
): void {
    const product = getProductAvailability(productId);
    const location = getSelectedLocation(productId);
    const line = basket.productItems?.find((item) => item.productId === productId);
    if (!product || !location || !line) return;

    updateCartFulfillmentState((state) =>
        upsertItem(state, {
            productId,
            productName: line.productName ?? product.productName,
            sku: product.sku,
            quantity: line.quantity ?? 1,
            fulfillment: toCartFulfillment(location),
        })
    );
}
