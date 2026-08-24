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
import { Skeleton } from '@/components/ui/skeleton';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { ProductTileSkeleton } from '@/components/category-skeleton';
import { cn } from '@/lib/utils';
import { merchandisingGridClasses, resolveMerchandisingGridLayout } from './constants';

/** Reserves the configured merchandising layout while a category search streams. */
export default function ProductMerchandisingGridSkeleton({
    columns,
    rows,
    title,
    shopAllUrl,
    shopAllText,
    className,
}: {
    columns?: unknown;
    rows?: unknown;
    title?: string;
    shopAllUrl?: string;
    shopAllText?: string;
    className?: string;
}) {
    const config = useConfig();
    const layout = resolveMerchandisingGridLayout({ columns, rows });
    const imgAspectRatio = config.global.productListing.defaultProductTileImgAspectRatio;
    const hasHeader = Boolean(title || shopAllUrl);

    return (
        <div className={cn('section-container py-12 md:py-16 animate-pulse', className)} aria-busy>
            {hasHeader && (
                <div
                    className="mb-6 flex items-end justify-between gap-4 md:mb-8"
                    data-testid="product-merchandising-grid-skeleton-header">
                    {title ? <Skeleton className="h-9 w-56 md:h-10" /> : <span />}
                    {shopAllUrl && shopAllText && <Skeleton className="h-5 w-16 shrink-0" />}
                </div>
            )}
            <div
                className={cn('grid gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10', merchandisingGridClasses[layout.columns])}>
                {Array.from({ length: layout.limit }, (_, index) => (
                    <ProductTileSkeleton key={index} imgAspectRatio={imgAspectRatio} />
                ))}
            </div>
        </div>
    );
}
