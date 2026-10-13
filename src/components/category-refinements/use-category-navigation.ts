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
import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import { useNavigate } from '@/hooks/use-navigate';
import { useSeoUrlContext } from '@/hooks/use-seo-url-context';
import { createCategoryNavigationUrl, getSiteSeoRoutes } from '@/route-paths';
import { getCategorySlugSegments } from '@/lib/seo/scapi-slugs';

type Category = ShopperProducts.schemas['Category'];

function indexCategorySlugSegments(category: Category | undefined): ReadonlyMap<string, readonly string[]> {
    const slugSegmentsByCategoryId = new Map<string, readonly string[]>();
    const pending = category ? [category] : [];

    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) continue;
        const slugSegments = getCategorySlugSegments(current);
        if (slugSegments) {
            slugSegmentsByCategoryId.set(current.id, slugSegments);
        }
        if (current.categories) {
            pending.push(...current.categories);
        }
    }

    return slugSegmentsByCategoryId;
}

function createRefinementDestination(categoryId: string, searchParams: URLSearchParams, pathname: string) {
    const params = new URLSearchParams(searchParams);
    const refines = params.getAll('refine');
    const categoryRefinement = `cgid=${categoryId}`;
    const nextRefines = refines.includes(categoryRefinement)
        ? refines.filter((refine) => refine !== categoryRefinement)
        : [...refines.filter((refine) => !refine.startsWith('cgid=')), categoryRefinement];

    params.delete('refine');
    nextRefines.forEach((refine) => params.append('refine', refine));
    params.set('offset', '0');

    return { pathname, search: `?${params.toString()}` };
}

/**
 * Resolve category selection to an executable navigation callback.
 *
 * The callback uses the configured SEO route when available and otherwise
 * preserves the legacy `cgid` refinement behavior. `undefined` means the
 * configured destination cannot be resolved and the control should be disabled.
 *
 * Keep hierarchy lookup and slug resolution category-specific. If another
 * resource needs the same availability and fallback workflow, extract that
 * shared routing behavior while leaving the category-specific work here.
 */
export function useCategoryNavigation(category?: Category) {
    const navigate = useNavigate();
    const location = useLocation();
    const seoUrlContext = useSeoUrlContext();
    const categoryConfig = getSiteSeoRoutes(seoUrlContext)?.category;
    const slugSegmentsByCategoryId = useMemo(() => indexCategorySlugSegments(category), [category]);

    return useCallback(
        (categoryId: string, searchParams: URLSearchParams): (() => void) | undefined => {
            if (!categoryConfig || !category) {
                const destination = createRefinementDestination(categoryId, searchParams, location.pathname);
                return () => void navigate(destination);
            }

            const destination = createCategoryNavigationUrl(
                { categoryId, slugSegments: slugSegmentsByCategoryId.get(categoryId), searchParams },
                seoUrlContext
            );
            if (!destination) return undefined;
            return () => void navigate(destination);
        },
        [category, categoryConfig, location.pathname, navigate, seoUrlContext, slugSegmentsByCategoryId]
    );
}
