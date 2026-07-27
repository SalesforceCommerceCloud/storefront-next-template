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
import { Link } from '@/components/link';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import type { DecoratedVariationAttributeValue } from '@/lib/product/product-utils';
import { toImageUrl } from '@/lib/images/dynamic-image';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const MAX_VISIBLE_INDICATOR_COUNT = 99;

interface ProductTileSwatchesProps {
    /** Colour swatch values decorated with href and optional swatch image */
    colorValues: DecoratedVariationAttributeValue[];
    /** Currently selected colour attribute value */
    selectedAttributeValue: string | null;
    /** Called on mouse-enter to update the tile's preview image */
    onSwatchHover: (value: string) => void;
    /** Called on click to fire analytics / parent callbacks */
    onSwatchClick: () => void;
    /** Product name used for accessible labels */
    productName: string;
    /** Total number of colour values before slicing (for the "+X" overflow indicator) */
    totalColorCount: number;
    /** Maximum number of swatches to show before the overflow indicator */
    maxSwatches: number;
    /** Product URL for the overflow indicator link */
    productHref: string;
}

/**
 * Swatch row for ProductTile.
 *
 * Renders circular colour swatches as `<Link>` elements so that clicking
 * navigates to the PDP with the selected colour pre-set. Each swatch shows
 * a swatch image when one is available with the colour name as a CSS
 * background-color fallback.
 */
export function ProductTileSwatches({
    colorValues,
    selectedAttributeValue,
    onSwatchHover,
    onSwatchClick,
    productName,
    totalColorCount,
    maxSwatches,
    productHref,
}: ProductTileSwatchesProps) {
    const config = useConfig();
    const { t } = useTranslation('product');
    const overflowCount = totalColorCount - maxSwatches;

    return (
        <div
            role="group"
            aria-label={t('swatches.availableColors')}
            className="flex items-center gap-1 mb-2 relative z-20 flex-wrap">
            {colorValues.map(({ value, name: valueName, href, swatch }) => {
                const isSelected = selectedAttributeValue === value;

                return (
                    <Link
                        key={value}
                        to={href}
                        onMouseEnter={() => onSwatchHover(value)}
                        onClick={onSwatchClick}
                        aria-label={t('swatches.viewProductInColor', { productName, colorName: valueName })}
                        aria-current={isSelected ? 'true' : undefined}
                        className={cn(
                            'w-4 h-4 rounded-full transition-all cursor-pointer relative shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring',
                            isSelected
                                ? 'ring-[2px] ring-muted-hover ring-offset-[1px] ring-offset-foreground'
                                : 'hover:ring-[3px] hover:ring-muted-hover'
                        )}
                        style={{ backgroundColor: valueName?.toLowerCase() }}>
                        {swatch && (
                            <img
                                src={toImageUrl({ image: swatch, config })}
                                alt=""
                                loading="lazy"
                                className="absolute inset-0 w-full h-full rounded-full object-cover opacity-0 transition-opacity duration-150"
                                onLoad={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.opacity = '1';
                                }}
                            />
                        )}
                    </Link>
                );
            })}

            {overflowCount > 0 && (
                <Link
                    to={productHref}
                    onClick={onSwatchClick}
                    className="w-4 h-4 rounded-full bg-primary-foreground border border-border-subtle flex items-center justify-center shrink-0 cursor-pointer hover:ring-[3px] hover:ring-muted-hover focus-visible:ring-[3px] focus-visible:ring-ring transition-all"
                    title={t('swatches.moreColorsTitle', {
                        count: Math.min(overflowCount, MAX_VISIBLE_INDICATOR_COUNT),
                    })}
                    aria-label={t('swatches.viewAllColors', { count: totalColorCount, productName })}>
                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none" className="shrink-0">
                        <path
                            d="M6.41667 2.97917V3.4375C6.41667 3.56407 6.31406 3.66667 6.1875 3.66667H3.66667V6.1875C3.66667 6.31406 3.56407 6.41667 3.4375 6.41667H2.97917C2.8526 6.41667 2.75 6.31406 2.75 6.1875V3.66667H0.229167C0.102601 3.66667 0 3.56407 0 3.4375V2.97917C0 2.8526 0.102601 2.75 0.229167 2.75H2.75V0.229167C2.75 0.102601 2.8526 0 2.97917 0H3.4375C3.56407 0 3.66667 0.102601 3.66667 0.229167V2.75H6.1875C6.31406 2.75 6.41667 2.8526 6.41667 2.97917Z"
                            fill="#3F3F46"
                        />
                    </svg>
                </Link>
            )}
        </div>
    );
}
