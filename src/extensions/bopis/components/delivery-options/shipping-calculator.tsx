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
import { type ReactElement, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShippingEstimateResult } from '@/extensions/shipping-delivery/routes/resource.shipping-estimate';

// US Postal Code validation (5 digits or 5+4 format)
const US_POSTAL_CODE_REGEX = /^\d{5}(-\d{4})?$/;

interface ShippingCalculatorProps {
    onCalculate: (zipCode: string, deliveryDays: number) => void;
    productId: string;
}

export default function ShippingCalculator({ onCalculate, productId }: ShippingCalculatorProps): ReactElement | null {
    const { t } = useTranslation('extBopis');
    const [inputValue, setInputValue] = useState('');
    const [showInvalidZipError, setShowInvalidZipError] = useState(false);

    const fetcher = useFetcher<ShippingEstimateResult>();
    const isLoading = fetcher.state === 'loading';

    // Derive display state from fetcher.data — only show when the response's zipcode
    // matches the current input. Editing the input automatically hides stale results.
    const matched = fetcher.data && fetcher.data.zipcode === inputValue ? fetcher.data : null;
    const estimate = matched?.success ? matched.estimate : null;
    const errorMsg = matched && !matched.success ? matched.error : null;

    const resultRef = useRef<HTMLDivElement>(null);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (matched?.success) {
            onCalculate(matched.zipcode, matched.estimate.days);
        }
    }, [matched, onCalculate]);

    // Move focus to the result so keyboard/AT users land on the outcome of "Calculate"
    // instead of staying on the button while the page content below shifts (WCAG 2.4.3).
    useEffect(() => {
        if (estimate) {
            resultRef.current?.focus();
        } else if (errorMsg) {
            errorRef.current?.focus();
        }
    }, [estimate, errorMsg]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 5);
        setInputValue(val);
        setShowInvalidZipError(false);
    };

    const isValidZip = US_POSTAL_CODE_REGEX.test(inputValue);

    const handleCalculate = () => {
        if (!isValidZip) {
            setShowInvalidZipError(true);
            return;
        }

        void fetcher.load(
            `/resource/shipping-estimate?productId=${encodeURIComponent(productId)}&zipcode=${encodeURIComponent(inputValue)}`
        );
    };

    return (
        <div className="p-4 rounded-ui border border-muted-foreground/20 bg-card">
            <div className="space-y-3">
                <div>
                    <label htmlFor="delivery-zip-input" className="text-sm font-medium text-foreground">
                        {t('deliveryOptions.pickupOrDelivery.calculatorTitle')}
                    </label>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <input
                            id="delivery-zip-input"
                            inputMode="numeric"
                            maxLength={5}
                            placeholder={t('deliveryOptions.pickupOrDelivery.zipPlaceholder')}
                            aria-label={t('deliveryOptions.pickupOrDelivery.zipAriaLabel')}
                            aria-invalid={showInvalidZipError}
                            aria-describedby={
                                estimate
                                    ? 'delivery-result'
                                    : showInvalidZipError
                                      ? 'validation-error'
                                      : 'delivery-message'
                            }
                            className={cn(
                                'w-full px-3 py-2 text-sm border rounded-ui transition-colors focus:outline-none focus:ring-2 bg-background',
                                showInvalidZipError
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
                        onClick={handleCalculate}
                        aria-label={t('deliveryOptions.pickupOrDelivery.calculateAriaLabel')}>
                        {isLoading
                            ? t('deliveryOptions.pickupOrDelivery.calculating')
                            : t('deliveryOptions.pickupOrDelivery.calculateButton')}
                    </button>
                </div>

                {showInvalidZipError && (
                    <p id="validation-error" className="text-xs text-status-critical-strong" role="alert">
                        {t('deliveryOptions.pickupOrDelivery.invalidZipCode')}
                    </p>
                )}

                {!estimate && !isLoading && !errorMsg && !showInvalidZipError && (
                    <p id="delivery-message" className="text-xs text-muted-foreground">
                        {t('deliveryOptions.pickupOrDelivery.calculatorInstructionMessage')}
                    </p>
                )}

                {errorMsg && (
                    <div
                        ref={errorRef}
                        tabIndex={-1}
                        className="bg-destructive/10 border border-destructive/20 rounded-ui p-3 outline-none focus-visible:ring-ring focus-visible:ring-[3px]">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm text-destructive">
                                    {t('deliveryOptions.pickupOrDelivery.errorFetchingEstimates')}
                                </p>
                                <button
                                    type="button"
                                    onClick={handleCalculate}
                                    className="text-sm text-destructive underline hover:no-underline mt-1">
                                    {t('deliveryOptions.pickupOrDelivery.retry')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {estimate && (
                    <div
                        ref={resultRef}
                        id="delivery-result"
                        role="status"
                        aria-live="polite"
                        tabIndex={-1}
                        className="bg-success/10 border border-success/20 rounded-ui p-3 outline-none focus-visible:ring-ring focus-visible:ring-[3px]">
                        <div className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                            <div className="flex-1 space-y-1">
                                <p className="text-sm text-success">
                                    {t('deliveryOptions.pickupOrDelivery.estimatedDeliveryInDays', {
                                        days: estimate.days,
                                    })}
                                </p>
                                <p className="text-sm text-success flex items-center gap-1">
                                    <span>
                                        {t('deliveryOptions.pickupOrDelivery.shippingCost')}{' '}
                                        <span className="font-semibold">
                                            {estimate.cost > 0
                                                ? `$${estimate.cost.toFixed(2)}`
                                                : t('deliveryOptions.pickupOrDelivery.free')}
                                        </span>
                                    </span>
                                    {estimate.cost === 0 && <Check className="w-4 h-4" />}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
