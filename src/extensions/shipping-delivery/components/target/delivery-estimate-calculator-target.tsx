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
import { Suspense, lazy, type ReactElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { useShippingDelivery } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import { useOptionalProductView } from '@/providers/product-view';
import type { EstimatedDeliveryDisplayStyle } from '@/extensions/shipping-delivery/components/estimated-delivery';
import { useDeliveryDestination } from '@/extensions/shipping-delivery/lib/api/use-delivery-destination';
import { useAuth } from '@/providers/auth';
import { resourceRoutes } from '@/route-paths';
import type { ShippingDestination } from '@/lib/shipping-estimate/types';

const EstimatedDelivery = lazy(() => import('@/extensions/shipping-delivery/components/estimated-delivery'));

interface DeliveryEstimateCalculatorTargetProps {
    displayStyle: EstimatedDeliveryDisplayStyle;
}

/** Shared calculator host; target wrappers choose its display style through target-config. */
export default function DeliveryEstimateCalculatorTarget({
    displayStyle,
}: DeliveryEstimateCalculatorTargetProps): ReactElement | null {
    const ctx = useShippingDelivery();
    const productView = useOptionalProductView();
    const auth = useAuth();
    const targetRef = useRef<HTMLDivElement>(null);
    const [shouldRenderCalculator, setShouldRenderCalculator] = useState(false);

    useEffect(() => {
        if (!ctx || shouldRenderCalculator) return;

        const target = targetRef.current;
        if (!target || typeof IntersectionObserver === 'undefined') {
            setShouldRenderCalculator(true);
            return;
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setShouldRenderCalculator(true);
                observer.disconnect();
            }
        });
        observer.observe(target);

        return () => observer.disconnect();
    }, [ctx, shouldRenderCalculator]);

    if (!ctx) return null;

    return (
        <div ref={targetRef}>
            <ResolvedDeliveryEstimate
                productId={productView?.currentVariant?.productId ?? ctx.productId}
                displayStyle={displayStyle}
                shouldRenderCalculator={shouldRenderCalculator}
                shouldLoadProfile={auth?.userType === 'registered'}
            />
        </div>
    );
}

function ResolvedDeliveryEstimate({
    productId,
    displayStyle,
    shouldRenderCalculator,
    shouldLoadProfile,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
    shouldLoadProfile: boolean;
}): ReactElement {
    const cookieDestination = useDeliveryDestination();
    const calculatorProps = { productId, displayStyle, shouldRenderCalculator };

    if (shouldLoadProfile && !cookieDestination) {
        return <RegisteredDeliveryEstimate {...calculatorProps} />;
    }

    return <DeliveryEstimate {...calculatorProps} initialDestination={cookieDestination} />;
}

type DeliveryDestinationResponse = { success: true; destination: ShippingDestination | null } | { success: false };

function RegisteredDeliveryEstimate({
    productId,
    displayStyle,
    shouldRenderCalculator,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
}): ReactElement {
    const fetcher = useFetcher<DeliveryDestinationResponse>();

    useEffect(() => {
        if (shouldRenderCalculator && fetcher.state === 'idle' && fetcher.data === undefined) {
            void fetcher.load(resourceRoutes.shippingDestination);
        }
    }, [fetcher, shouldRenderCalculator]);

    return (
        <DeliveryEstimate
            productId={productId}
            displayStyle={displayStyle}
            shouldRenderCalculator={shouldRenderCalculator}
            isInitialDestinationLoading={shouldRenderCalculator && fetcher.data === undefined}
            initialDestination={fetcher.data?.success ? fetcher.data.destination : null}
        />
    );
}

function DeliveryEstimate({
    productId,
    displayStyle,
    shouldRenderCalculator,
    isInitialDestinationLoading = false,
    initialDestination,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
    isInitialDestinationLoading?: boolean;
    initialDestination: ShippingDestination | null;
}): ReactElement {
    const { t } = useTranslation('extShippingDelivery');
    const fallback = (
        <DeliveryEstimateFallback
            title={t('cardTitle')}
            calculating={t('calculating')}
            postalCodePrompt={t('postalCodeInstructionsNoExample', {
                term: t('postalTerms.postalCode'),
            })}
            isCalculating={isInitialDestinationLoading || Boolean(initialDestination?.postalCode)}
        />
    );

    return shouldRenderCalculator && !isInitialDestinationLoading ? (
        <Suspense fallback={fallback}>
            <EstimatedDelivery
                productId={productId}
                initialDestination={initialDestination}
                displayStyle={displayStyle}
            />
        </Suspense>
    ) : (
        fallback
    );
}

function DeliveryEstimateFallback({
    title,
    calculating,
    postalCodePrompt,
    isCalculating,
}: {
    title: string;
    calculating: string;
    postalCodePrompt: string;
    isCalculating: boolean;
}): ReactElement {
    return (
        <section
            className="mt-4 min-h-28 rounded-ui border border-muted-foreground/20 bg-card p-3"
            aria-busy={isCalculating || undefined}
            aria-labelledby="delivery-estimate-calculator-target-heading">
            <h2 id="delivery-estimate-calculator-target-heading" className="text-sm font-medium text-foreground">
                {title}
            </h2>
            {isCalculating ? (
                <p role="status" aria-live="polite" className="mt-0.5 text-xs text-muted-foreground">
                    {calculating}
                </p>
            ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">{postalCodePrompt}</p>
            )}
        </section>
    );
}
