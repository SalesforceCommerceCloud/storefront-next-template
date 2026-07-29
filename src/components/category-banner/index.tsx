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
import { useTranslation } from 'react-i18next';
import type { ShopperProducts, ShopperSearch } from '@/scapi';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { toImageUrl } from '@/lib/images/dynamic-image';

type CategoryRouteData = {
    category: ShopperProducts.schemas['Category'];
    searchResultCritical: ShopperSearch.schemas['ProductSearchResult'];
};

/**
 * Fallback banner for Product Listing Pages when no hero component is configured
 * in the plpTopFullWidth Page Designer region. Displays category name, product
 * count, and an optional background image sourced from the category's SCAPI data.
 *
 * Image resolution: c_slotBannerImage → category.image → bg-muted.
 */
export default function CategoryBanner() {
    const loaderData = useRouteLoaderData<CategoryRouteData>('routes/_app.category.$categoryId');
    const { t } = useTranslation('category');
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

    const categoryImageUrl =
        (typeof category?.c_slotBannerImage === 'string' && category.c_slotBannerImage) ||
        (typeof category?.image === 'string' && category.image) ||
        undefined;
    const imageSrc = toImageUrl({ src: categoryImageUrl, config }) ?? categoryImageUrl;

    const [imageFailed, setImageFailed] = useState(false);
    useEffect(() => setImageFailed(false), [categoryImageUrl]);
    const handleImageError = useCallback(() => setImageFailed(true), []);

    const hasImage = !!imageSrc && !imageFailed;

    return (
        <div className="relative w-full overflow-hidden h-[250px] md:h-[300px] lg:h-[350px]">
            <div className="absolute inset-0">
                {hasImage ? (
                    <img
                        src={imageSrc}
                        alt={categoryName || ''}
                        aria-hidden="true"
                        fetchPriority="high"
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                    />
                ) : (
                    <div className="absolute inset-0 bg-muted" />
                )}
                {/*
                 * Scrim for WCAG 1.4.3: all text (eyebrow, category name, product count) is white and sits in the
                 * lower half over an arbitrary merchant photo. The eyebrow is small text (12px/14px) and needs 4.5:1
                 * contrast. The gradient stays lighter at the very top to keep the image visible but provides black/65
                 * alpha by the eyebrow position (composited ~#595959 over worst-case white = 4.6:1 with text-white/80)
                 * and darker still for the large heading and count below. The image is unchanged. */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/65 to-black/85" />
            </div>

            <div className="relative h-full flex items-end">
                <div className="section-container w-full pb-8 md:pb-10">
                    <div className="max-w-2xl">
                        {rootCategoryName && (
                            <div className="inline-block mb-4" aria-hidden="true">
                                <span className="text-xs md:text-sm text-white/80 uppercase tracking-widest font-medium">
                                    {rootCategoryName}
                                </span>
                            </div>
                        )}
                        {categoryName && (
                            <p
                                aria-hidden="true"
                                className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-light text-primary-foreground mb-4 tracking-tight leading-tight">
                                {categoryName}
                            </p>
                        )}
                        <div className="text-2xl text-white/90 font-light max-w-xl" aria-live="polite">
                            {isCountPending
                                ? t('banner.counting')
                                : total !== undefined && t('banner.productsAvailable', { count: total })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
