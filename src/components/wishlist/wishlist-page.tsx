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
import { type ReactElement, useEffect, useState, useCallback, useMemo } from 'react';
import type { ShopperCustomers, ShopperProducts } from '@/scapi';
import { createLogger } from '@/lib/logger';

const logger = createLogger();
import { Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { WishlistListItem } from '@/components/wishlist/wishlist-list-item';
import {
    WishlistSortFilter,
    type WishlistSortOption,
    type WishlistFilterOption,
} from '@/components/wishlist/wishlist-sort-filter';
import { getPriceData } from '@/components/product-price/utils';

type CustomerProductListItem = ShopperCustomers.schemas['CustomerProductListItem'];
type Product = ShopperProducts.schemas['Product'];

/**
 * Returns true when the product shows as "available" — i.e. InventoryMessage would
 * render IN_STOCK, PRE_ORDER, or BACK_ORDER. Mirrors the status logic in InventoryMessage.
 *
 * Note: The SCAPI Variant schema does not carry an `inventory` object, so InventoryMessage
 * always falls through to `product.inventory` for items from the variants array. We use
 * `product.inventory` directly to stay consistent.
 */
function isItemInStock(product: Product): boolean {
    const inventory = product.inventory;
    if (!inventory) return false;
    if (!inventory.orderable) return false;
    if (inventory.preorderable || inventory.backorderable) return true;
    return (inventory.ats || 0) > 0;
}

/**
 * Returns true when the product shows as OUT_OF_STOCK — i.e. InventoryMessage would
 * render "Out of stock". Items without inventory data (UNKNOWN status) are excluded
 * from both stock filters.
 */
function isItemOutOfStock(product: Product): boolean {
    const inventory = product.inventory;
    if (!inventory) return false;
    if (!inventory.orderable) return true;
    if (inventory.preorderable || inventory.backorderable) return false;
    return (inventory.ats || 0) === 0;
}

/**
 * Returns true when ProductPrice would show a strikethrough list price.
 * Delegates to the existing `getPriceData` utility so the filter stays consistent
 * with the rendered price display — handles master products, tiered prices, price
 * ranges, and promotional prices.
 */
function isProductOnSale(product: Product): boolean {
    return getPriceData(product).isOnSale;
}

/**
 * Skeleton shown while product details are streaming from the server.
 */
export function WishlistSkeleton(): ReactElement {
    const { t } = useTranslation('account');

    return (
        <div className="space-y-6">
            {/* Header card skeleton */}
            <Card className="px-6 py-3 gap-0 rounded-ui bg-card border-border">
                <h1 className="text-2xl font-semibold text-foreground mb-1">{t('navigation.wishlist')}</h1>
                <Skeleton className="h-4 w-48" />
            </Card>

            {/* Items card skeleton */}
            <Card className="py-0 gap-0">
                <div className="p-4 border-b border-border">
                    <Skeleton className="h-6 w-36" />
                </div>
                <div className="p-4 space-y-4">
                    <Skeleton className="h-5 w-36" />
                    {(['skeleton-1', 'skeleton-2', 'skeleton-3'] as const).map((key) => (
                        <div key={key} className="flex gap-4 p-4 rounded-ui border border-border">
                            <Skeleton className="w-20 h-20 md:w-28 md:h-28 flex-shrink-0 rounded-ui" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                                <Skeleton className="h-5 w-16" />
                            </div>
                            <Skeleton className="w-20 h-6 flex-shrink-0" />
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

export interface WishlistPageContentProps {
    items: CustomerProductListItem[];
    productsByProductId: Record<string, Product>;
}

/**
 * WishlistPageContent — full client-side content for the My Wishlist page.
 *
 * Owns all client state: removed-item tracking, sort option, filter option.
 * Computes the filtered/sorted display list from the loader-provided data.
 */
export function WishlistPageContent({ items, productsByProductId }: WishlistPageContentProps): ReactElement {
    const { t } = useTranslation('account');

    // Track removed items client-side, persisted in sessionStorage to survive revalidations
    const [disabledItemIds, setDisabledItemIds] = useState<Set<string>>(() => {
        if (typeof window !== 'undefined') {
            const stored = sessionStorage.getItem('wishlist-disabled');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored) as string[];
                    return new Set(parsed);
                } catch (e) {
                    logger.error('Failed to parse stored disabled IDs', { error: e });
                }
            }
        }
        return new Set();
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('wishlist-disabled', JSON.stringify(Array.from(disabledItemIds)));
        }
    }, [disabledItemIds]);

    useEffect(() => {
        return () => {
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('wishlist-disabled');
            }
        };
    }, []);

    const [sortOption, setSortOption] = useState<WishlistSortOption>('recently-added');
    const [filterOption, setFilterOption] = useState<WishlistFilterOption>('all');

    const handleItemRemove = useCallback((itemId: string) => {
        setDisabledItemIds((prev) => new Set(prev).add(itemId));
    }, []);

    const visibleItems = useMemo(
        () => items.filter((item) => !item.id || !disabledItemIds.has(item.id)),
        [items, disabledItemIds]
    );

    const displayItems = useMemo(() => {
        const filtered = visibleItems.filter((item) => {
            if (!item.productId) return false;
            const product = productsByProductId[item.productId];
            if (!product?.name) return false;
            if (filterOption === 'all') return true;
            if (filterOption === 'in-stock') return isItemInStock(product);
            if (filterOption === 'out-of-stock') return isItemOutOfStock(product);
            if (filterOption === 'on-sale') return isProductOnSale(product);
            return true;
        });

        if (sortOption === 'recently-added') return filtered;

        return [...filtered].sort((a, b) => {
            const pA = productsByProductId[a.productId ?? ''];
            const pB = productsByProductId[b.productId ?? ''];
            if (sortOption === 'name-asc') return (pA?.name ?? '').localeCompare(pB?.name ?? '');
            if (sortOption === 'price-low') return (pA?.price ?? 0) - (pB?.price ?? 0);
            if (sortOption === 'price-high') return (pB?.price ?? 0) - (pA?.price ?? 0);
            return 0;
        });
    }, [visibleItems, productsByProductId, sortOption, filterOption]);

    return (
        <div className="space-y-5">
            {/* Page Header Card */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <h1 className="text-2xl font-semibold text-foreground mb-1">{t('wishlist.pageTitle')}</h1>
                    <p className="text-sm text-muted-foreground">{t('wishlist.pageSubtitle')}</p>
                </CardContent>
            </Card>

            {/* Saved Items Card */}
            <Card className="py-0 gap-0">
                {/* Header: title + item count + sort/filter — separator (border-b) sits below */}
                <div className="p-4 space-y-3 border-b border-border">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-foreground">{t('wishlist.savedItems')}</h2>
                        {visibleItems.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {t('wishlist.itemCount', { count: visibleItems.length })}
                            </p>
                        )}
                    </div>
                    {visibleItems.length > 0 && (
                        <WishlistSortFilter
                            sortValue={sortOption}
                            filterValue={filterOption}
                            onSortChange={setSortOption}
                            onFilterChange={setFilterOption}
                        />
                    )}
                </div>

                {visibleItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <Heart className="w-16 h-16 text-muted-foreground/40 mb-4" />
                        <h3 className="text-sm font-medium text-foreground mb-2">{t('wishlist.emptyTitle')}</h3>
                        <p className="text-muted-foreground">{t('wishlist.emptySubtitle')}</p>
                    </div>
                ) : displayItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <p className="text-muted-foreground">{t('wishlist.noFilterResults')}</p>
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        {displayItems.map((item) => {
                            if (!item.id || !item.productId) return null;
                            const product = productsByProductId[item.productId];
                            if (!product?.name) return null;

                            return (
                                <WishlistListItem
                                    key={item.id}
                                    product={product}
                                    wishlistItem={item}
                                    onRemove={handleItemRemove}
                                />
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
