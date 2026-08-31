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
import { Suspense, lazy, type ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
    useShippingDelivery,
    type ShippingDeliveryPresentation,
} from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import { useOptionalProductView } from '@/providers/product-view';
import type { EstimatedDeliveryDisplayStyle } from '@/extensions/shipping-delivery/components/estimated-delivery';
import { useDeliveryDestination } from '@/extensions/shipping-delivery/lib/api/use-delivery-destination';
import { useAuth } from '@/providers/auth';
import { resourceRoutes } from '@/route-paths';
import type { ShippingDestination } from '@/lib/shipping-estimate/types';
import DeliveryEstimateCalculatorSkeleton from './delivery-estimate-calculator-skeleton';

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
    const [isTargetVisible, setIsTargetVisible] = useState(false);
    const [disclosedProductId, setDisclosedProductId] = useState<string | null>(null);
    const [focusPostalCodeProductId, setFocusPostalCodeProductId] = useState<string | null>(null);
    const productId = productView?.currentVariant?.productId ?? ctx?.productId;
    // ProductInfo is reused by Quick Add modals within the PDP tree. Those nested views
    // must not participate in the enclosing PDP's delivery-estimate presentation.
    const isNestedProductView = Boolean(productView?.product && productView.product.id !== ctx?.productId);
    const isDeliveryEstimateRequested = Boolean(
        !isNestedProductView && ctx && productId && ctx.requestedDeliveryEstimateProductId === productId
    );
    const isDeliveryEstimateDisclosed = isDeliveryEstimateRequested || disclosedProductId === productId;
    const shouldWaitForPresentationHost = Boolean(
        !ctx?.presentationHostsReady && ctx?.hasDeclaredPresentationHost?.(ctx.productId)
    );

    useEffect(() => {
        if (!isDeliveryEstimateRequested || !productId) return;
        setDisclosedProductId(productId);
        setFocusPostalCodeProductId(productId);
        ctx?.clearDeliveryEstimateRequest?.(productId);
    }, [ctx, isDeliveryEstimateRequested, productId]);
    const handlePostalCodeFocusHandled = useCallback(() => setFocusPostalCodeProductId(null), []);

    useEffect(() => {
        if (!ctx || isNestedProductView || isTargetVisible) return;

        const target = targetRef.current;
        if (!target || typeof IntersectionObserver === 'undefined') {
            setIsTargetVisible(true);
            return;
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsTargetVisible(true);
                observer.disconnect();
            }
        });
        observer.observe(target);

        return () => observer.disconnect();
    }, [ctx, isNestedProductView, isTargetVisible]);

    if (!ctx || !productId || isNestedProductView) return null;

    return (
        <div ref={targetRef}>
            {!shouldWaitForPresentationHost && (
                <ResolvedDeliveryEstimate
                    productId={productId}
                    displayStyle={displayStyle}
                    shouldRenderCalculator={isTargetVisible || isDeliveryEstimateDisclosed}
                    shouldLoadProfile={
                        auth?.userType === 'registered' && (isDeliveryEstimateDisclosed || !ctx.presentationHost)
                    }
                    isDeliveryEstimateDisclosed={isDeliveryEstimateDisclosed}
                    focusPostalCodeOnMount={focusPostalCodeProductId === productId}
                    onPostalCodeFocusHandled={handlePostalCodeFocusHandled}
                />
            )}
        </div>
    );
}

/** Disclosure-coordination props threaded through every calculator wrapper below. */
type DeliveryEstimateDisclosureProps = {
    isDeliveryEstimateDisclosed: boolean;
    focusPostalCodeOnMount: boolean;
    onPostalCodeFocusHandled: () => void;
};

function ResolvedDeliveryEstimate({
    productId,
    displayStyle,
    shouldRenderCalculator,
    shouldLoadProfile,
    isDeliveryEstimateDisclosed,
    focusPostalCodeOnMount,
    onPostalCodeFocusHandled,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
    shouldLoadProfile: boolean;
} & DeliveryEstimateDisclosureProps): ReactElement {
    const cookieDestination = useDeliveryDestination();
    const calculatorProps = {
        productId,
        displayStyle,
        shouldRenderCalculator,
        isDeliveryEstimateDisclosed,
        focusPostalCodeOnMount,
        onPostalCodeFocusHandled,
    };

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
    isDeliveryEstimateDisclosed,
    focusPostalCodeOnMount,
    onPostalCodeFocusHandled,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
} & DeliveryEstimateDisclosureProps): ReactElement | null {
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
            isDeliveryEstimateDisclosed={isDeliveryEstimateDisclosed}
            focusPostalCodeOnMount={focusPostalCodeOnMount}
            onPostalCodeFocusHandled={onPostalCodeFocusHandled}
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
    isDeliveryEstimateDisclosed,
    focusPostalCodeOnMount,
    onPostalCodeFocusHandled,
}: {
    productId: string;
    displayStyle: EstimatedDeliveryDisplayStyle;
    shouldRenderCalculator: boolean;
    isInitialDestinationLoading?: boolean;
    initialDestination: ShippingDestination | null;
} & DeliveryEstimateDisclosureProps): ReactElement | null {
    const shippingDelivery = useShippingDelivery();
    const sourceId = useRef({});
    const registerPresentationSource = shippingDelivery?.registerPresentationSource;
    const publishPresentation = shippingDelivery?.publishPresentation;
    const presentationProductId = shippingDelivery?.productId ?? productId;
    const shouldSuppressCookieFallback = Boolean(
        initialDestination?.postalCode && shippingDelivery?.hasDeclaredPresentationHost?.(presentationProductId)
    );
    const [calculatorPresentation, setCalculatorPresentation] = useState<{
        productId: string;
        presentation: ShippingDeliveryPresentation | null;
    }>();
    const currentCalculatorPresentation =
        calculatorPresentation?.productId === productId ? calculatorPresentation.presentation : undefined;
    const handleCalculatorPresentation = useCallback(
        (presentation: ShippingDeliveryPresentation | null) => setCalculatorPresentation({ productId, presentation }),
        [productId]
    );

    useLayoutEffect(() => {
        return registerPresentationSource?.({
            sourceId: sourceId.current,
            productId: presentationProductId,
            estimateProductId: productId,
        });
    }, [presentationProductId, productId, registerPresentationSource]);
    useLayoutEffect(() => {
        if (!publishPresentation) return;
        const currentSourceId = sourceId.current;
        let presentation: ShippingDeliveryPresentation | null;
        if (currentCalculatorPresentation !== undefined) {
            presentation = currentCalculatorPresentation;
        } else if (isDeliveryEstimateDisclosed) {
            presentation = { kind: 'editing', sourceId: currentSourceId, productId: presentationProductId };
        } else {
            presentation = null;
        }
        publishPresentation(presentation, currentSourceId);
        return () => publishPresentation(null, currentSourceId);
    }, [currentCalculatorPresentation, isDeliveryEstimateDisclosed, presentationProductId, publishPresentation]);
    const fallback = <DeliveryEstimateCalculatorSkeleton />;
    const shouldShowRequestedCalculator =
        !shippingDelivery?.presentationHost || Boolean(initialDestination) || isDeliveryEstimateDisclosed;

    if (shouldSuppressCookieFallback && !shouldRenderCalculator) return null;
    if (!isInitialDestinationLoading && !shouldShowRequestedCalculator) return null;

    return shouldRenderCalculator && !isInitialDestinationLoading ? (
        <Suspense fallback={shouldSuppressCookieFallback ? null : fallback}>
            <EstimatedDelivery
                productId={productId}
                initialDestination={initialDestination}
                displayStyle={displayStyle}
                enableFulfillmentPresentation
                fulfillmentPresentationSourceId={sourceId.current}
                onFulfillmentPresentationChange={handleCalculatorPresentation}
                focusPostalCodeOnMount={focusPostalCodeOnMount}
                onPostalCodeFocusHandled={onPostalCodeFocusHandled}
            />
        </Suspense>
    ) : (
        fallback
    );
}
