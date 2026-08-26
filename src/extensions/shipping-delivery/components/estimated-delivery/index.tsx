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
import { type ReactElement, useState, useCallback, useEffect, lazy, Suspense, useMemo, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { InfoModalData } from '@/components/info-modal/types';
import { formatCurrency } from '@/lib/currency';
import { formatDeliveryWindow } from '@/lib/date-utils';
import { getCountryCodeFromLocale, getPostalCodeFormat } from '@/lib/shipping-estimate/postal-code-formats';
import { useShippingEstimate } from '@/lib/shipping-estimate/use-shipping-estimate';
import type { ShippingDestination, ShippingEstimate } from '@/lib/shipping-estimate/types';
import ZipCodeEstimator from './zip-code-estimator';

const InfoModal = lazy(() => import('@/components/info-modal'));

export type EstimatedDeliveryDisplayStyle = 'summary' | 'detailed';

export interface EstimatedDeliveryProps {
    productId: string;
    initialDestination?: ShippingDestination | null;
    /** "summary" omits the primary shipping price; "detailed" includes it when SCAPI provided one. */
    displayStyle?: EstimatedDeliveryDisplayStyle;
    /** Whether to display the estimate for the currently selected fulfillment method. */
    visible?: boolean;
}

export default function EstimatedDelivery({
    productId,
    initialDestination,
    displayStyle = 'detailed',
    visible = true,
}: EstimatedDeliveryProps): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    const { language, currency } = useSite();
    const destinationCountry = initialDestination?.countryCode ?? getCountryCodeFromLocale(language);
    const format = useMemo(() => getPostalCodeFormat(destinationCountry), [destinationCountry]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [postalCode, setPostalCode] = useState(() => format.normalize(initialDestination?.postalCode ?? ''));
    const [validationError, setValidationError] = useState(false);
    const modalTriggerRef = useRef<HTMLButtonElement>(null);
    const estimateResultRef = useRef<HTMLParagraphElement>(null);
    const hasCalculatedRef = useRef(false);
    const { isLoading, estimate, hasError, fallbackDeliveryDescription, matchedZipcode, autoFetchInFlight, load } =
        useShippingEstimate<ShippingEstimate>({
            productId,
            initialDestination,
            enabled: true,
            matchAgainst: postalCode,
        });
    const hasMerchantFallback = hasError && Boolean(fallbackDeliveryDescription);

    useEffect(() => {
        if (estimate && matchedZipcode) {
            setIsEditingDestination(false);
            if (hasCalculatedRef.current) {
                estimateResultRef.current?.focus();
                hasCalculatedRef.current = false;
            }
        }
    }, [estimate, matchedZipcode]);

    useEffect(() => {
        if (hasError) {
            setIsEditingDestination(!fallbackDeliveryDescription);
        }
    }, [hasError, fallbackDeliveryDescription]);

    useEffect(() => {
        if (isEditingDestination) {
            document.getElementById('estimated-delivery-zip-input')?.focus();
        }
    }, [isEditingDestination]);

    useEffect(() => {
        if (!visible) setIsModalOpen(false);
    }, [visible]);

    const handleInputChange = useCallback((value: string) => {
        setPostalCode(value);
        setValidationError(false);
    }, []);

    const handleCalculate = useCallback(() => {
        if (!format.regex.test(postalCode)) {
            setValidationError(true);
            return;
        }

        setValidationError(false);
        if (hasMerchantFallback) {
            setIsEditingDestination(false);
        }
        hasCalculatedRef.current = true;
        load(postalCode, destinationCountry);
    }, [destinationCountry, format, hasMerchantFallback, load, postalCode]);

    const handleChangeDestination = useCallback(() => {
        setIsEditingDestination(true);
    }, []);

    const handleCloseAutoFocus = useCallback(
        (event: Event) => {
            if (!visible) {
                event.preventDefault();
                document.getElementById(`fulfillment-option-${productId}-pickup`)?.focus();
                return;
            }
            modalTriggerRef.current?.focus();
        },
        [productId, visible]
    );

    const handleOpenAutoFocus = useCallback((event: Event) => {
        event.preventDefault();
        document.getElementById('estimated-delivery-modal-title')?.focus();
    }, []);

    const primaryOption = estimate?.shippingOptions[0];
    const hasMultipleOptions = (estimate?.shippingOptions.length ?? 0) > 1;
    const deliveryWindow = formatDeliveryWindow(primaryOption?.deliveryWindow, language);
    const modalData: InfoModalData | undefined = estimate
        ? {
              type: 'estimated-delivery',
              title: t('cardTitle'),
              shippingOptions: estimate.shippingOptions,
          }
        : undefined;
    const shouldShowEstimator =
        isEditingDestination ||
        (hasError && !hasMerchantFallback) ||
        (!initialDestination && !estimate && !autoFetchInFlight && !hasMerchantFallback);

    return (
        <section className="mt-4" aria-labelledby="estimated-delivery-heading">
            {autoFetchInFlight && !estimate && !isEditingDestination ? (
                <DeliveryCard>
                    <h2 id="estimated-delivery-heading" className="text-sm font-medium text-foreground">
                        {t('cardTitle')}
                    </h2>
                    <p role="status" aria-live="polite" className="mt-0.5 text-xs text-muted-foreground">
                        {t('calculating')}
                    </p>
                </DeliveryCard>
            ) : shouldShowEstimator ? (
                <DeliveryCard>
                    <h2 id="estimated-delivery-heading" className="text-sm font-medium text-foreground">
                        {t('cardTitle')}
                    </h2>
                    <ZipCodeEstimator
                        inputValue={postalCode}
                        isLoading={isLoading}
                        hasLookupFailure={hasError}
                        fallbackDeliveryDescription={fallbackDeliveryDescription}
                        hasValidationError={validationError}
                        format={format}
                        onInputChange={handleInputChange}
                        onCalculate={handleCalculate}
                    />
                </DeliveryCard>
            ) : hasMerchantFallback ? (
                <DeliveryCard>
                    <h2 id="estimated-delivery-heading" className="text-sm font-medium text-foreground">
                        {t('cardTitle')}
                    </h2>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        <Trans
                            i18nKey="deliverTo"
                            ns="extShippingDelivery"
                            values={{ postalCode }}
                            components={{
                                postalCode: (
                                    <button
                                        type="button"
                                        aria-label={t('changeDestinationAriaLabel', { postalCode })}
                                        onClick={handleChangeDestination}
                                        className="cursor-pointer rounded-sm underline hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                ),
                            }}
                        />
                    </div>
                    <p role="status" className="mt-0.5 text-xs text-muted-foreground">
                        {fallbackDeliveryDescription}
                    </p>
                </DeliveryCard>
            ) : estimate && matchedZipcode && primaryOption ? (
                <>
                    <DeliveryCard>
                        <h2 id="estimated-delivery-heading" className="text-sm font-medium text-foreground">
                            {t('cardTitle')}
                        </h2>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                            <Trans
                                i18nKey="deliverTo"
                                ns="extShippingDelivery"
                                values={{ postalCode: matchedZipcode }}
                                components={{
                                    postalCode: (
                                        <button
                                            type="button"
                                            aria-label={t('changeDestinationAriaLabel', { postalCode: matchedZipcode })}
                                            onClick={handleChangeDestination}
                                            className="cursor-pointer rounded-sm underline hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        />
                                    ),
                                }}
                            />
                        </div>
                        {deliveryWindow && (
                            <p
                                ref={estimateResultRef}
                                role="status"
                                aria-live="polite"
                                tabIndex={-1}
                                className="mt-0.5 text-xs text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                {t('arrivalMessage', { deliveryWindow })}
                            </p>
                        )}
                        {displayStyle === 'detailed' && primaryOption.price !== undefined && (
                            <p className="text-xs text-muted-foreground">
                                {t('shippingCost')}{' '}
                                <span className="font-semibold">
                                    {primaryOption.price === 0
                                        ? t('free')
                                        : formatCurrency(
                                              primaryOption.price,
                                              language,
                                              primaryOption.currency ?? currency
                                          )}
                                </span>
                            </p>
                        )}
                        {hasMultipleOptions && (
                            <button
                                ref={modalTriggerRef}
                                type="button"
                                onClick={() => setIsModalOpen(true)}
                                className="mt-2 cursor-pointer text-xs font-normal text-primary hover:underline">
                                {displayStyle === 'summary' ? t('seeAllDeliveryOptions') : t('moreDeliveryOptions')}
                            </button>
                        )}
                    </DeliveryCard>
                    {hasMultipleOptions && modalData && (visible || isModalOpen) && (
                        <Suspense
                            fallback={
                                isModalOpen ? (
                                    <span role="status" aria-live="polite" className="sr-only">
                                        {t('openingDeliveryOptions')}
                                    </span>
                                ) : null
                            }>
                            <InfoModal
                                open={visible && isModalOpen}
                                onOpenChange={setIsModalOpen}
                                onOpenAutoFocus={handleOpenAutoFocus}
                                onCloseAutoFocus={handleCloseAutoFocus}
                                data={modalData}
                            />
                        </Suspense>
                    )}
                </>
            ) : null}
        </section>
    );
}

function DeliveryCard({ children }: { children: React.ReactNode }): ReactElement {
    return (
        <div className="rounded-ui border border-muted-foreground/20 bg-card p-3">
            <div className="flex items-start gap-3">
                <CalendarDays aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}
