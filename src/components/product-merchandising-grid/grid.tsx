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
import type { ComponentPropsWithoutRef } from 'react';
import type { ShopperSearch } from '@/scapi';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import DynamicImageProvider from '@/providers/dynamic-image';
import { ProductTile, ProductTileProvider } from '@/components/product-tile';
import { Link } from '@/components/link';
import { Component } from '@/components/region/component';
import type { ComponentType } from '@/components/region';
import { cn } from '@/lib/utils';
import { merchandisingGridClasses, merchandisingGridImageWidths, resolveMerchandisingGridLayout } from './constants';

const EMPTY_STATE_PLACEHOLDER_COUNT = 8;

export interface ProductMerchandisingGridProps extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
    products: ShopperSearch.schemas['ProductSearchHit'][];
    columns?: unknown;
    rows?: unknown;
    title?: string;
    shopAllUrl?: string;
    shopAllText?: string;
    /** A selected category activates automatic SCAPI sourcing and takes precedence over manual tiles. */
    categoryId?: string;
    /** Page Designer component containing authored Product Tiles in its products region. */
    component?: ComponentType;
    /** Page Designer parent-region identity, not rendered as a DOM attribute. */
    regionId?: string;
}

/**
 * A bounded category assortment for landing-page merchandising. It intentionally
 * avoids PLP refinements, pagination, and load-more state so it can be used in
 * Page Designer regions and route compositions without listing-page coupling.
 */
export default function ProductMerchandisingGrid({
    products,
    columns,
    rows,
    title,
    shopAllUrl,
    shopAllText,
    categoryId,
    component,
    regionId: _regionId,
    className,
    ...props
}: ProductMerchandisingGridProps) {
    const { isDesignMode } = usePageDesignerMode();
    const layout = resolveMerchandisingGridLayout({ columns, rows });
    const visibleProducts = products?.slice(0, layout.limit) ?? [];
    const productsRegion = component?.regions?.find((region) => region.id === 'products');
    const curatedTiles = productsRegion?.components?.slice(0, layout.limit) ?? [];
    const hasCategory = Boolean(categoryId?.trim());
    const hasProducts = visibleProducts.length > 0;
    const hasCuratedTiles = curatedTiles.length > 0;

    if (!hasProducts && (!hasCuratedTiles || hasCategory) && !isDesignMode) {
        return null;
    }

    const placeholderCount = Math.min(layout.limit, EMPTY_STATE_PLACEHOLDER_COUNT);

    return (
        <section className={cn('section-container py-12 md:py-16', className)} {...props}>
            {(title || shopAllUrl) && (
                <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
                    {title ? <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2> : <span />}
                    {shopAllUrl && shopAllText && (
                        <Link to={shopAllUrl} className="shrink-0 text-sm font-medium hover:underline">
                            {shopAllText}
                        </Link>
                    )}
                </div>
            )}
            <ProductTileProvider>
                <DynamicImageProvider value={{ widths: merchandisingGridImageWidths[layout.columns] }}>
                    <div
                        data-testid="product-merchandising-grid"
                        data-slot="product-merchandising-grid"
                        className={cn(
                            'grid gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10',
                            merchandisingGridClasses[layout.columns]
                        )}>
                        {hasProducts
                            ? visibleProducts.map((product) => (
                                  <ProductTile key={product.productId} product={product} />
                              ))
                            : hasCuratedTiles && !hasCategory
                              ? curatedTiles.map((tile) => {
                                    const typedTile = tile as ComponentType;
                                    const key = typedTile.contentLinkUuid ?? typedTile.id;
                                    return (
                                        <Component
                                            key={key}
                                            component={typedTile}
                                            regionId={productsRegion?.id ?? 'products'}
                                        />
                                    );
                                })
                              : Array.from({ length: placeholderCount }, (_, index) => <ProductTile key={index} />)}
                    </div>
                </DynamicImageProvider>
            </ProductTileProvider>
        </section>
    );
}
