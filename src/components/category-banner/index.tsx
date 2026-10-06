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
import { useTranslation } from 'react-i18next';
import { useCategoryBannerData } from './use-category-banner-data';

/**
 * Fallback banner for Product Listing Pages when no hero component is configured
 * in the plpTopFullWidth Page Designer region. Displays category name, product
 * count, and an optional background image sourced from the category's SCAPI data.
 *
 * Image resolution: c_slotBannerImage → category.image → bg-muted.
 */
export default function CategoryBanner() {
    const { t } = useTranslation('category');
    const { rootCategoryName, categoryName, imageSrc, hasImage, handleImageError, total, isCountPending } =
        useCategoryBannerData();

    return (
        <div className="relative w-full overflow-hidden h-[250px] md:h-[300px] lg:h-[350px]">
            <div className="absolute inset-0">
                {hasImage ? (
                    <img
                        src={imageSrc}
                        alt=""
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
                            <div className="inline-block mb-4">
                                <span className="text-xs md:text-sm text-white/80 uppercase tracking-widest font-medium">
                                    {rootCategoryName}
                                </span>
                            </div>
                        )}
                        {categoryName && (
                            <p className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-light text-primary-foreground mb-4 tracking-tight leading-tight">
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
