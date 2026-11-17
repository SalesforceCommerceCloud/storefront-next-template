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
import { AuthTokenInvalidError, type ShopperProducts } from '@/scapi';
import { fetchAvailabilityByIds } from '@/lib/api/availability.server';
import { getInitialVariant } from '@/lib/product/initial-variant';
import { NormalizedApiError } from '@/lib/api/normalized-api-error';

/** Seed only initial exact-SKU delivery availability, independently of selected-store resolution. */
export async function seedPdpDeliveryInventory(
    context: Readonly<RouterContextProvider>,
    product: ShopperProducts.schemas['Product'] | null,
    searchParams = new URLSearchParams()
): Promise<ShopperProducts.schemas['Product'] | null> {
    if (!product) return product;
    type Product = ShopperProducts.schemas['Product'];
    const targets = [
        { product, params: searchParams, child: false },
        ...(product.setProducts ?? []).map((child) => ({
            product: child,
            params: new URLSearchParams(searchParams.get(child.id) ?? ''),
            child: true,
        })),
        ...(product.bundledProducts ?? []).flatMap(({ product: child }) =>
            child
                ? [{ product: child, params: new URLSearchParams(searchParams.get(child.id) ?? ''), child: true }]
                : []
        ),
    ];
    const inventoryById = new Map<string, ShopperProducts.schemas['Inventory']>();
    const selected = targets.map((target) => {
        const variant = getInitialVariant(target.product, target.params, target.child) as
            | (ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] })
            | undefined;
        const id =
            variant?.productId ??
            (target.product.type?.master || target.product.type?.set ? undefined : target.product.id);
        const inventory = variant
            ? (variant.inventory ?? (variant.productId === target.product.id ? target.product.inventory : undefined))
            : target.product.inventory;
        if (id && inventory) inventoryById.set(id, inventory);
        return { ...target, variant, id };
    });
    const missing = [...new Set(selected.flatMap(({ id }) => (id && !inventoryById.has(id) ? [id] : [])))];
    if (!selected.some(({ id }) => id)) return product;
    if (missing.length) {
        try {
            const fetched = await fetchAvailabilityByIds(context, missing);
            for (const id of missing)
                inventoryById.set(
                    id,
                    // No inventoryIds were requested, so the first inventory is the site's default.
                    fetched.find((item) => item.id === id)?.inventories?.[0] ?? {
                        id: 'unavailable',
                        ats: 0,
                        stockLevel: 0,
                        orderable: false,
                    }
                );
        } catch (error) {
            const cause = error instanceof NormalizedApiError ? error.cause : error;
            if (cause instanceof AuthTokenInvalidError) throw cause;
            if (error instanceof NormalizedApiError && error.status === 401)
                throw new AuthTokenInvalidError(error.message);
            // Supplemental request errors are already logged by the API helper.
            return product;
        }
    }
    const merge = (item: Product): Product => {
        const target = selected.find((entry) => entry.product === item);
        const inventory = target?.id ? inventoryById.get(target.id) : undefined;
        if (!inventory) return item;
        return {
            ...item,
            ...(target?.child || !target?.variant || target.id === item.id ? { inventory } : {}),
            ...(target?.variant
                ? {
                      variants: item.variants?.map((variant) =>
                          variant.productId === target.id ? { ...variant, inventory } : variant
                      ),
                  }
                : {}),
        };
    };
    return {
        ...merge(product),
        ...(product.setProducts ? { setProducts: product.setProducts.map(merge) } : {}),
        ...(product.bundledProducts
            ? {
                  bundledProducts: product.bundledProducts.map((item) => ({
                      ...item,
                      ...(item.product ? { product: merge(item.product) } : {}),
                  })),
              }
            : {}),
    };
}
