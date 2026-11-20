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
export default function PromoCallout({
    product,
    parentProduct,
    className,
}: {
    product: Product;
    /** Native parent offers retained when displaying a selected SKU's financial amounts. */
    parentProduct?: Product;
    className?: string;
}) {
    const lowestPriceResult = useMemo(() => findLowestPrice(product), [product]);

    // Expanded SKU details and an optional distinct parent can both supply native callouts.
    const promos = [
        ...(lowestPriceResult?.data?.productPromotions ?? []),
        ...(product?.productPromotions ?? []),
        ...(parentProduct?.productPromotions ?? []),
    ];
    // Ecom determines qualification. Preserve returned callouts, including conditional and
    // gift offers without a promotionalPrice; do not infer eligibility here.
    const seen = new Set<string>();
    const callouts = promos.filter((promo) => {
        const key = promo.promotionId || String(promo.calloutMsg || '');
        if (!promo.calloutMsg || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (!callouts.length) return null;

    return (
        <div className={cn('items-center gap-2', className)}>
            {callouts.map((promo) => (
                <span
                    key={promo.promotionId || String(promo.calloutMsg)}
                    className={cn('line-clamp-2 text-[inherit] font-medium', callouts.length > 1 && 'block')}
                    // BM-authored callouts follow the existing trusted-content policy.
                    // oxlint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: String(promo.calloutMsg) }}
                />
            ))}
        </div>
    );
}
