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
import { createCategoryUrl, getSiteSeoRoutes, isSafePathSegment, type SeoUrlContext } from '@/route-paths';
import type { SeoRoutesConfig } from '@salesforce/storefront-next-runtime/config';

type SlugSource = {
    slug?: string;
};

/** Request slug data only for storefronts that use deterministic SEO routes. */
export function getSeoSlugExpansion(seoRoutes?: SeoRoutesConfig): [] | ['slug'] {
    return seoRoutes && Object.keys(seoRoutes).length > 0 ? ['slug'] : [];
}

/** Reject slug segments that would normalize the path or fail URI encoding. */
export function isSafeSlugSegment(segment: string): boolean {
    return isSafePathSegment(segment);
}

/** Split the complete category slug path returned by Shopper Products into route segments. */
export function getCategorySlugSegments(category: SlugSource): readonly string[] | undefined {
    const slug = category.slug?.normalize('NFC');
    if (!slug?.trim()) return undefined;

    const segments = slug.split('/');
    return segments.every(isSafeSlugSegment) ? segments : undefined;
}

/** Build a category URL only when the active grammar has the authoritative data it requires. */
export function createCategoryUrlFromScapiCategory(
    category: SlugSource & { id?: string },
    context?: SeoUrlContext
): string | undefined {
    const slugSegments = getCategorySlugSegments(category);
    const categoryConfig = getSiteSeoRoutes(context)?.category;
    if (categoryConfig?.mode === 'slug-path' && !slugSegments) return undefined;
    if (categoryConfig && categoryConfig.mode !== 'slug-path' && !category.id) return undefined;

    return createCategoryUrl({ categoryId: category.id, slugSegments: slugSegments ?? [] }, context);
}
