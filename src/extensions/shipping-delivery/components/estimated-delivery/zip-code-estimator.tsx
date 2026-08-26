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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PostalCodeFormat } from '@/lib/shipping-estimate/postal-code-formats';

interface ZipCodeEstimatorProps {
    inputValue: string;
    isLoading: boolean;
    hasLookupFailure?: boolean;
    fallbackDeliveryDescription?: string | null;
    hasValidationError: boolean;
    format: PostalCodeFormat;
    onInputChange: (value: string) => void;
    onCalculate: () => void;
}

export default function ZipCodeEstimator({
    inputValue,
    isLoading,
    hasLookupFailure = false,
    fallbackDeliveryDescription,
    hasValidationError,
    format,
    onInputChange,
    onCalculate,
}: ZipCodeEstimatorProps): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    const termLabel = t(`postalTerms.${format.termKey}`);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onInputChange(format.normalize(e.target.value));
    };

    const placeholder = format.example
        ? t('postalCodePlaceholderExample', { term: termLabel, example: format.example })
        : t('postalCodePlaceholder', { term: termLabel });

    const instructions = format.example
        ? t('postalCodeInstructions', { term: termLabel, example: format.example })
        : t('postalCodeInstructionsNoExample', { term: termLabel });

    const invalidMessage = format.example
        ? t('postalCodeInvalid', { term: termLabel, example: format.example })
        : t('postalCodeInvalidNoExample', { term: termLabel });

    return (
        <div className="mt-3 space-y-3">
            <div className="flex gap-2">
                <div className="flex-1">
                    <label htmlFor="estimated-delivery-zip-input" className="sr-only">
                        {termLabel}
                    </label>
                    <input
                        id="estimated-delivery-zip-input"
                        inputMode={format.inputMode}
                        maxLength={format.maxLength}
                        placeholder={placeholder}
                        aria-invalid={hasValidationError}
                        autoComplete="postal-code"
                        aria-describedby={
                            hasValidationError ? 'estimated-delivery-error' : 'estimated-delivery-message'
                        }
                        className={cn(
                            'w-full px-3 py-2 text-sm border rounded-ui transition-colors focus:outline-none focus:ring-2 bg-background',
                            hasValidationError
                                ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                                : 'border-muted-foreground/20 focus:border-ring focus:ring-ring'
                        )}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                    />
                </div>
                <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap rounded-ui bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                    disabled={isLoading}
                    onClick={onCalculate}
                    aria-label={t('calculateAriaLabel')}>
                    {isLoading ? t('calculating') : t('calculateButton')}
                </button>
            </div>

            {!isLoading && !hasValidationError && (
                <p
                    id="estimated-delivery-message"
                    role={hasLookupFailure ? 'status' : undefined}
                    className="text-xs text-muted-foreground">
                    {hasLookupFailure ? (fallbackDeliveryDescription ?? t('deliveryDatesUnavailable')) : instructions}
                </p>
            )}

            {hasValidationError && (
                <div role="alert" className="bg-destructive/10 border border-destructive/20 rounded-ui p-3">
                    <div className="flex items-start gap-2">
                        <div className="flex-1">
                            <p id="estimated-delivery-error" className="text-sm text-destructive">
                                {invalidMessage}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
