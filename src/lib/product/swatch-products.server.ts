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
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { fetchProductsByIds } from '@/lib/api/products.server';
import { getPrimaryProductImageUrl } from '@/lib/product/product-utils';
import { parseCustomSwatchImages, type CustomSwatchImageMap } from '@/lib/product/custom-swatch-images';
import { getLogger } from '@/lib/logger.server';

/**
 * Resolve DIS-served swatch tile images for variation axes SCAPI does not natively decorate, from
 * dedicated hidden "swatch products", and merge the results into `product.c_swatchImages`.
 *
 * Why swatch products: SFCC expands `viewType=swatch` imagery for only ONE variation axis (here
 * `fabric`). Other axes (`size`, `legStyle`) must carry their tile imagery another way. A detached
 * static file referenced by a bare catalog path can never be served through DIS at runtime — the
 * storefront can only *rewrite* an absolute SCAPI-returned URL (the DIS version segment is minted by
 * SFCC and unknowable client-side). Modelling each non-native swatch VALUE as a hidden, non-searchable
 * product whose primary image is the tile solves this: `getProducts` returns that product's image
 * with a fully version-stamped DIS URL, which the existing `<DynamicImage>` pipeline optimizes exactly
 * like the native `fabric` swatch. The variation-attribute fields (axes/values/labels/price deltas)
 * still come from the master natively — swatch products only supply the images.
 *
 * The master relates values to swatch products via the optional `c_swatchProductIds` attribute:
 * a JSON-string map `{ axisId: { value: swatchProductId } }`. This function reads it, batch-fetches the
 * referenced products (one `getProducts` call, images only), and writes the resolved absolute image
 * URLs into `product.c_swatchImages` — the same optional field {@link useVariationAttributes} already
 * reads, so the consumer path needs no change (`resolveCustomSwatchImagePath` passes absolute URLs
 * through untouched, and `<DynamicImage>` DIS-optimizes them).
 *
 * Generic + data-gated: a **no-op when `c_swatchProductIds` is absent**, so it is inert for any
 * vertical/product that does not ship swatch products. Any vertical can adopt the pattern by shipping
 * swatch products + `c_swatchProductIds` — no further storefront code.
 *
 * SSR: mutates `product` **in place** so the synchronous `useVariationAttributes` memo sees the map on
 * first render — callers must `await` it in the loader before returning. This adds one `getProducts`
 * round-trip per PDP render; the per-request client fetch does not cache across requests, so any
 * cross-PDP savings come from SCAPI's own server-side web-tier cache. Failures degrade to text swatches
 * (never fail the PDP).
 *
 * @param context - Router loader/action context
 * @param product - The resolved master product; mutated in place (its `c_swatchImages` may be set)
 */
export async function resolveSwatchProductImages(
    context: LoaderFunctionArgs['context'],
    product: ShopperProducts.schemas['Product']
): Promise<void> {
    // `c_swatchProductIds` has the same axis → value → string shape as `c_swatchImages`, so reuse its
    // validated parser (prototype-pollution guarded; tolerates a JSON string or an already-parsed object).
    const idMap = parseCustomSwatchImages((product as unknown as { c_swatchProductIds?: unknown }).c_swatchProductIds);
    if (!idMap) {
        return;
    }

    // Flatten the axis → value → id map to a lookup list, and dedupe the ids for a single batched fetch.
    const entries: Array<{ axis: string; value: string; id: string }> = [];
    for (const [axis, values] of Object.entries(idMap)) {
        for (const [value, id] of Object.entries(values)) {
            entries.push({ axis, value, id });
        }
    }
    const ids = Array.from(new Set(entries.map((entry) => entry.id)));
    if (!ids.length) {
        return;
    }

    const logger = getLogger(context);
    let swatchProducts: ShopperProducts.schemas['Product'][];
    try {
        // Images only — swatch products are pure tile carriers (no price/variation expansion needed).
        swatchProducts = await fetchProductsByIds(context, ids, { allImages: true });
    } catch (error) {
        // Non-critical: swatch tiles degrade to text swatches. Never fail the PDP over swatch imagery.
        // fetchProductsByIds wraps failures in NormalizedApiError, so the original error (client aborts,
        // timeouts) is on `.cause` — skip the warn for those to avoid log noise on navigate-away.
        const causeName = ((error as Error)?.cause as Error | undefined)?.name;
        if (causeName !== 'AbortError' && causeName !== 'TimeoutError') {
            logger.warn('Failed to resolve swatch-product images', { ids, error });
        }
        return;
    }

    // Map each swatch product id → its primary image URL (`disBaseLink || link`, i.e. the DIS base).
    const urlById = new Map<string, string>();
    for (const swatchProduct of swatchProducts) {
        const url = getPrimaryProductImageUrl(swatchProduct, 'small');
        if (swatchProduct.id && url) {
            urlById.set(swatchProduct.id, url);
        }
    }
    if (!urlById.size) {
        return;
    }

    // Merge onto any existing `c_swatchImages` (defensive: a catalog could ship both a native-path map
    // and swatch products for different axes). Swatch-product URLs win for the axes/values they cover.
    const merged: CustomSwatchImageMap = {};
    const existing = parseCustomSwatchImages((product as unknown as { c_swatchImages?: unknown }).c_swatchImages);
    if (existing) {
        for (const [axis, values] of Object.entries(existing)) {
            merged[axis] = { ...values };
        }
    }
    for (const { axis, value, id } of entries) {
        const url = urlById.get(id);
        if (url) {
            (merged[axis] ??= {})[value] = url;
        }
    }

    if (Object.keys(merged).length) {
        (product as unknown as { c_swatchImages?: unknown }).c_swatchImages = merged;
    }
}
