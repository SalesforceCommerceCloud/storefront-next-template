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

/**
 * Skeleton loading placeholder for the CategoryBanner component.
 *
 * Mirrors the banner's responsive heights and text layout:
 * - Image area background
 * - Gradient overlay
 * - Root category label, category heading, and product count skeletons
 *
 * Shown during initial page load via the Region `fallbackElement` prop while
 * Page Designer data and route loader data are both pending.
 */
export default function CategoryBannerSkeleton() {
    return (
        <div className="relative w-full overflow-hidden animate-pulse h-[250px] md:h-[300px] lg:h-[350px]">
            {/* Image skeleton */}
            <Skeleton className="absolute inset-0 w-full h-full" />

            {/* Gradient overlay — matches real component */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/65 to-black/85" />

            {/* Content skeletons anchored to the bottom */}
            <div className="absolute inset-0 flex items-end">
                <div className="section-container w-full pb-8 md:pb-10">
                    <div className="max-w-2xl flex flex-col gap-4">
                        {/* Root category label */}
                        <Skeleton className="h-3 w-20 bg-white/20" />
                        {/* Category heading */}
                        <Skeleton className="h-10 md:h-14 lg:h-16 w-64 md:w-80 bg-white/20" />
                        {/* Product count */}
                        <Skeleton className="h-5 w-36 bg-white/20" />
                    </div>
                </div>
            </div>
        </div>
    );
}
