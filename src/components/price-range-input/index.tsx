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
import React, { type ReactElement, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { usePriceRangeValidation } from '@/hooks/use-price-range-validation';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { getCurrencySymbol } from '@/lib/currency';

interface PriceInputProps {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    hasError: boolean;
    currencySymbol: string;
}

function PriceInput({ id, label, placeholder, value, onChange, onKeyDown, hasError, currencySymbol }: PriceInputProps) {
    return (
        <div className="flex-1">
            <label htmlFor={id} className="sr-only">
                {label}
            </label>
            <div className="border-solid border-[var(--input)] border py-2 px-3 flex flex-row gap-2 items-center justify-start relative overflow-hidden rounded-ui shadow-xs">
                <span
                    className="shrink-0 flex items-center justify-center text-sm text-muted-foreground"
                    aria-hidden="true">
                    {currencySymbol}
                </span>
                <div className="text-muted-foreground text-left text-sm leading-normal font-normal relative overflow-hidden flex-1 truncate whitespace-nowrap">
                    <Input
                        id={id}
                        type="number"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        className={`border-0 p-0 h-auto text-sm bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground w-full ${
                            hasError ? 'text-destructive' : ''
                        }`}
                        min="0"
                    />
                </div>
            </div>
        </div>
    );
}

export interface PriceRangeInputProps {
    /** Current min price value */
    minPrice: string;
    /** Current max price value */
    maxPrice: string;
    /** Callback when values change */
    onChange: (minPrice: string, maxPrice: string) => void;
    /** Callback when filter should be applied */
    onApply?: () => void;
    /** Minimum allowed price */
    minAllowed?: number;
    /** Maximum allowed price */
    maxAllowed?: number;
    /** Whether to show validation errors */
    showValidationErrors?: boolean;
}

export default function PriceRangeInput({
    minPrice,
    maxPrice,
    onChange,
    onApply,
    minAllowed,
    maxAllowed,
    showValidationErrors = true,
}: PriceRangeInputProps): ReactElement {
    const uid = React.useId();
    const { t, i18n } = useTranslation('product');
    const { currency } = useSite();
    const locale = i18n.language;
    const currencySymbol = getCurrencySymbol(locale, currency);
    const validation = usePriceRangeValidation(minPrice, maxPrice, minAllowed, maxAllowed);
    const minHasError = showValidationErrors && validation.minHasError;
    const maxHasError = showValidationErrors && validation.maxHasError;

    const handleMinChange = (newMin: string) => {
        onChange(newMin, maxPrice);
    };

    const handleMaxChange = (newMax: string) => {
        onChange(minPrice, newMax);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && onApply && !minHasError && !maxHasError) {
            onApply();
        }
    };

    return (
        <div className="flex flex-row gap-3 items-center justify-start self-stretch shrink-0 relative">
            <PriceInput
                id={`${uid}-price-min`}
                label={t('priceMin')}
                placeholder={t('priceMin')}
                value={minPrice}
                onChange={handleMinChange}
                onKeyDown={handleKeyDown}
                hasError={minHasError}
                currencySymbol={currencySymbol}
            />

            <div className="text-foreground text-left text-sm leading-none font-normal relative">{t('priceTo')}</div>

            <PriceInput
                id={`${uid}-price-max`}
                label={t('priceMax')}
                placeholder={t('priceMax')}
                value={maxPrice}
                onChange={handleMaxChange}
                onKeyDown={handleKeyDown}
                hasError={maxHasError}
                currencySymbol={currencySymbol}
            />
        </div>
    );
}
