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
import { aggregateInventoryQuantities, hasInventoryStock, type ShopperBasketsV2, type ShopperProducts } from '@/scapi';
import type { CartInventoryValidationResult } from '@/lib/cart/inventory-validation';

export type InventoryLine = Pick<ShopperBasketsV2.schemas['ProductItem'], 'productId' | 'quantity'> & {
    itemId?: string;
    bundledProductItems?: InventoryLine[];
};

/** Native basket child quantities are totals, including the parent quantity. */
export function flattenInventoryLines(items: InventoryLine[]): InventoryLine[] {
    return items.flatMap((item) => [item, ...flattenInventoryLines(item.bundledProductItems ?? [])]);
}

/** Keep original line/option identities while sharing the stock budget of duplicate SKUs. */
export function validateLocalCartInventory(
    basket: ShopperBasketsV2.schemas['Basket'],
    productsByItemId: Record<string, ShopperProducts.schemas['Product']>
): CartInventoryValidationResult {
    const items = basket.productItems ?? [];
    const demand = aggregateInventoryQuantities(flattenInventoryLines(items));
    const products = new Map<string, ShopperProducts.schemas['Product']>();
    const collect = (product: ShopperProducts.schemas['Product']) => {
        products.set(product.id, product);
        product.bundledProducts?.forEach((child) => collect(child.product));
    };
    Object.values(productsByItemId).forEach(collect);
    const issues = items.flatMap((item) => {
        const lines = flattenInventoryLines([item]);
        const invalid = lines.find(
            (line) =>
                !hasInventoryStock(products.get(line.productId ?? '')?.inventory, demand.get(line.productId ?? ''))
        );
        if (!invalid) return [];
        const inventory = products.get(invalid.productId ?? '')?.inventory;
        return [
            {
                itemId: item.itemId ?? '',
                productId: item.productId ?? '',
                productName: item.productName ?? products.get(item.productId ?? '')?.name ?? '',
                requestedQuantity: item.quantity ?? 0,
                availableStock: Math.max(
                    0,
                    Math.min(inventory?.stockLevel ?? 0, inventory?.ats ?? inventory?.stockLevel ?? 0)
                ),
                isPickup: false,
            },
        ];
    });
    return {
        hasInventoryIssues: issues.length > 0,
        itemsExceedingInventory: issues,
        totalItemsWithIssues: issues.length,
    };
}
