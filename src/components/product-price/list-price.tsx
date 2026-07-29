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

import { Typography } from '@/components/typography';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface ListPriceProps {
    labelForA11y?: string;
    price: number;
    as?: 'span' | 'div' | 'p' | 'h5';
    isRange?: boolean;
    currency: string;
    className?: string;
}

/**
 * Component that displays list price of a product with a11y
 * @param currency - currency
 * @param price - price of the product
 * @param as - an HTML tag or component to be rendered as
 * @param isRange - show price as range or not
 * @param labelForA11y - label to be used for a11y
 * @param className - additional CSS classes
 * @returns {JSX.Element}
 */
export default function ListPrice({
    labelForA11y,
    price,
    isRange = false,
    as = 'span',
    currency,
    className,
}: ListPriceProps) {
    const { t, i18n } = useTranslation('product');

    // Format currency using i18next's current language
    const listPriceText = formatCurrency(price, i18n.language, currency);

    const ariaLabel = isRange
        ? t('price.listPriceFrom', { price: listPriceText })
        : t('price.listPrice', { price: listPriceText });

    return (
        <>
            <Typography
                as={as}
                variant="small"
                className={cn('line-through text-muted-foreground', className)}
                aria-hidden="true">
                {listPriceText}
            </Typography>
            <span className="sr-only" aria-live="polite" aria-atomic={true}>
                {labelForA11y} {ariaLabel}
            </span>
        </>
    );
}
