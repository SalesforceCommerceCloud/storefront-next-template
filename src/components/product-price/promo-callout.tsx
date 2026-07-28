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
import { useMemo } from 'react';
import { findLowestPrice } from './utils';
import type { ShopperBasketsV2, ShopperSearch, ShopperProducts } from '@/scapi';
import { cn } from '@/lib/utils';

// for different pages
type Product =
    | ShopperProducts.schemas['Product']
    | (ShopperBasketsV2.schemas['ProductItem'] & Partial<ShopperProducts.schemas['Product']>)
    | ShopperSearch.schemas['ProductSearchHit'];

/**
 * Component that calls out the promo message for a product
 * @param product - product object
 * @param className - custom className
 * @returns {JSX.Element}
 */
export default function PromoCallout({ product, className }: { product: Product; className?: string }) {
    const lowestPriceResult = useMemo(() => findLowestPrice(product), [product]);

    // NOTE: API inconsistency - with getProduct call, a variant does not have productPromotions
    const promos = lowestPriceResult?.data?.productPromotions ?? product?.productPromotions ?? [];
    const promo = lowestPriceResult?.promotion ?? promos[0];

    if (!promo?.calloutMsg) {
        return null;
    }

    // Safely get the callout message as a string
    const calloutMsg = String(promo.calloutMsg || '');

    return (
        <div className={cn('items-center gap-2', className)}>
            {/* BM content is trusted, safe to render HTML. Works for both plain text and HTML strings */}
            <span
                className="line-clamp-2 text-[inherit] font-medium"
                // oxlint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: calloutMsg }}
            />
        </div>
    );
}
