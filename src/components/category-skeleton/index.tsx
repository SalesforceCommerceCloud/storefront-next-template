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
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ProductTileSwatchesSkeleton({ count = 2 }: { count?: number }) {
    return (
        <div className="product-tile-swatches-skeleton flex items-center flex-wrap gap-1 mb-2 relative z-20">
            {Array.from({ length: count }, (_, i) => (
                <Skeleton key={i} className="h-4 w-4 rounded-full" />
            ))}
        </div>
    );
}

export function ProductTileSkeleton({ imgAspectRatio = 1 }: { imgAspectRatio?: number }) {
    return (
        <Card className="product-tile-skeleton overflow-hidden w-full min-w-0 max-w-full flex flex-col h-full gap-0 py-0">
            {/* Product image */}
            <CardHeader className="p-0">
                <Skeleton
                    className="aspect-square w-full"
                    style={imgAspectRatio === 1 ? undefined : { aspectRatio: String(imgAspectRatio) }}
                />
            </CardHeader>

            {/* Swatches */}
            <CardContent className="px-4 pt-3 pb-0">
                <ProductTileSwatchesSkeleton count={2} />
            </CardContent>

            {/* Product name */}
            <CardContent className="px-4 pt-2 pb-0">
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4" />
            </CardContent>

            {/* Price */}
            <CardContent className="px-4 pt-2 pb-4">
                <Skeleton className="h-5 w-16" />
            </CardContent>
        </Card>
    );
}
