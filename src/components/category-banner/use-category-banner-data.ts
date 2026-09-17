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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigation, useRouteLoaderData } from 'react-router';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { toImageUrl } from '@/lib/images/dynamic-image';

type CategoryRouteData = {
    category: ShopperProducts.schemas['Category'];
    searchResultCritical: ShopperSearch.schemas['ProductSearchResult'];
};

/**
 * Extracts category banner data from route loader data, navigation state, and category metadata.
 * Used by both canonical and vertical-specific category banner components.
 */
export function useCategoryBannerData() {
    const loaderData = useRouteLoaderData<CategoryRouteData>('routes/_app.category.$categoryId');
    const navigation = useNavigation();
    const location = useLocation();
    const config = useConfig();

    const category = loaderData?.category;
    const total = loaderData?.searchResultCritical?.total;

    const isCountPending = useMemo(() => {
        if (navigation.state === 'idle' || !navigation.location) return false;
        if (navigation.location.pathname !== location.pathname) return false;
        const current = new URLSearchParams(location.search);
        const next = new URLSearchParams(navigation.location.search);
        return ['refine', 'sort', 'offset'].some(
            (param) => current.getAll(param).join(',') !== next.getAll(param).join(',')
        );
    }, [navigation.state, navigation.location, location.pathname, location.search]);

    const rootCategoryName = category?.parentCategoryTree?.find((p) => p.id !== 'root')?.name;
    const categoryName = category?.name;
    const pageDescription =
        typeof category?.pageDescription === 'string' && category.pageDescription
            ? category.pageDescription
            : undefined;

    // Prefer the merchant's custom banner only when it is already an absolute URL. Live SCAPI returns
    // `c_slotBannerImage` verbatim as a relative catalog path (`/on/demandware.static/...`), which
    // does not resolve to a valid storefront URL — fall back to the standard, version-stamped
    // `category.image` in that case rather than rendering a broken banner.
    const slotBannerImage = typeof category?.c_slotBannerImage === 'string' ? category.c_slotBannerImage : '';
    const isAbsoluteUrl = /^(?:https?:)?\/\//.test(slotBannerImage) || slotBannerImage.startsWith('data:');
    const categoryImageUrl =
        (isAbsoluteUrl ? slotBannerImage : undefined) ||
        (typeof category?.image === 'string' && category.image) ||
        undefined;
    const imageSrc = toImageUrl({ src: categoryImageUrl, config }) ?? categoryImageUrl;

    const [imageFailed, setImageFailed] = useState(false);
    useEffect(() => setImageFailed(false), [categoryImageUrl]);
    const handleImageError = useCallback(() => setImageFailed(true), []);

    const hasImage = !!imageSrc && !imageFailed;

    return {
        category,
        total,
        isCountPending,
        rootCategoryName,
        categoryName,
        pageDescription,
        imageSrc,
        hasImage,
        handleImageError,
    };
}
