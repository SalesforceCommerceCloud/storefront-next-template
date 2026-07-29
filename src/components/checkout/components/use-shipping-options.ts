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

import { type FormEvent, useEffect, useMemo, useRef, useCallback, type MutableRefObject } from 'react';
import { useBasket } from '@/providers/basket';
import { getDefaultShippingMethod } from '@/lib/customer/profile-utils';
import { useCustomerProfile } from '@/hooks/checkout/use-customer-profile';
import type { ShopperBasketsV2 } from '@/scapi';
import type { CheckoutActionData } from '../types';
function useLatestRef<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}

interface ShippingPromotion {
    calloutMsg?: string;
    promotionId?: string;
    promotionName?: string;
}

export interface ShippingMethod {
    id: string;
    name: string;
    description?: string;
    price: number;
    shippingPromotions?: ShippingPromotion[];
    deliveryWindow?: ShopperBasketsV2.schemas['DeliveryWindow'];
}

interface UseShippingOptionsParams {
    onSubmit: (formData: FormData) => void;
    /**
     * Called for auto-submissions that should recalculate prices without advancing the step.
     * When provided and justEnteredAddress is true, the auto-submit uses this instead of onSubmit
     * so the shopper stays on the shipping options step to review and confirm.
     */
    onAutoSubmit?: (formData: FormData) => void;
    isLoading: boolean;
    actionData?: CheckoutActionData;
    shippingMethods?: ShopperBasketsV2.schemas['ShippingMethodResult'];
    isEditing: boolean;
    /**
     * True when the shopper just submitted a new shipping address. In this case the auto-submit
     * uses onAutoSubmit so the step stays open for the shopper to review the options.
     */
    justEnteredAddress?: boolean;
}

type SelectedMethod = NonNullable<
    NonNullable<ShopperBasketsV2.schemas['Basket']['shipments']>[number]
>['shippingMethod'];

export interface UseShippingOptionsReturn {
    availableShippingMethods: ShippingMethod[];
    selectedMethod: SelectedMethod;
    summaryMethod: ShippingMethod | undefined;
    defaultShippingMethodId: string | undefined;
    isGuest: boolean;
    hideChangeForGuest: boolean;
    isUpcomingStep: boolean;
    getDiscountedPrice: (basePrice: number) => number;
    handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function useShippingOptions({
    onSubmit,
    onAutoSubmit,
    isLoading,
    actionData: _actionData,
    shippingMethods,
    isEditing,
    justEnteredAddress,
}: UseShippingOptionsParams): UseShippingOptionsReturn {
    const cart = useBasket();
    const customerProfile = useCustomerProfile();

    const availableShippingMethods: ShippingMethod[] = useMemo(
        () =>
            shippingMethods?.applicableShippingMethods
                ?.filter((method): method is NonNullable<typeof method> & { id: string; name: string; price: number } =>
                    Boolean(method.id && method.name && typeof method.price === 'number' && !Number.isNaN(method.price))
                )
                .map((method) => ({
                    id: method.id,
                    name: method.name,
                    description: method.description,
                    price: method.price,
                    shippingPromotions: method.shippingPromotions,
                    deliveryWindow: method.deliveryWindow,
                })) || [],
        [shippingMethods?.applicableShippingMethods]
    );

    const shippingDiscount = useMemo(() => {
        const adjustment = cart?.shippingItems?.[0]?.priceAdjustments?.[0];
        if (!adjustment?.appliedDiscount) return undefined;
        return adjustment.appliedDiscount;
    }, [cart?.shippingItems]);

    const getDiscountedPrice = useCallback(
        (basePrice: number): number => {
            if (!shippingDiscount) return basePrice;
            switch (shippingDiscount.type) {
                case 'free':
                    return 0;
                case 'percentage':
                    return basePrice * (1 - (shippingDiscount.amount ?? 0));
                case 'amount':
                    return Math.max(0, basePrice - (shippingDiscount.amount ?? 0));
                case 'fixed_price':
                    return shippingDiscount.amount ?? basePrice;
                default:
                    return basePrice;
            }
        },
        [shippingDiscount]
    );

    const selectedMethod = cart?.shipments?.[0]?.shippingMethod;

    // Only show a summary when the basket's selected method is actually offerable for the current
    // address.
    const summaryMethod: ShippingMethod | undefined = useMemo(() => {
        if (!selectedMethod?.id) return undefined;
        return availableShippingMethods.find((m) => m.id === selectedMethod.id);
    }, [selectedMethod, availableShippingMethods]);

    const isGuest = !customerProfile?.customer?.customerId;
    const hideChangeForGuest = isGuest && !selectedMethod;
    const isUpcomingStep = !isEditing && !selectedMethod;

    const defaultShippingMethodId = getDefaultShippingMethod(
        availableShippingMethods,
        selectedMethod,
        shippingMethods?.defaultShippingMethodId
    );

    const hasPromotions = useMemo(
        () => availableShippingMethods.some((m) => m.shippingPromotions?.length),
        [availableShippingMethods]
    );

    const onSubmitRef = useLatestRef(onSubmit);
    const onAutoSubmitRef = useLatestRef(onAutoSubmit);
    const hasAutoSubmitted = useRef(false);

    useEffect(() => {
        // Auto-submit when no method is selected yet, or when a method is selected but
        // priceAdjustments haven't been calculated (e.g. first load or back-to-edit after
        // a navigation that clears basket price data). The second case only fires when
        // promotions are present - otherwise there's nothing to recalculate.
        const needsPriceRecalculation = selectedMethod?.id && hasPromotions && !shippingDiscount;

        // For returning customers who haven't just entered an address: auto-select the default
        // method and advance the step (silent, no UI needed).
        // For shoppers who just entered an address or when promotions need recalculating:
        // use the recalculation path (prices update, step stays open for review).
        const shouldAutoSubmit = customerProfile || needsPriceRecalculation || (!selectedMethod?.id && hasPromotions);

        if (
            isEditing &&
            shouldAutoSubmit &&
            availableShippingMethods.length > 0 &&
            !hasAutoSubmitted.current &&
            !isLoading &&
            (!selectedMethod?.id || needsPriceRecalculation)
        ) {
            hasAutoSubmitted.current = true;

            const isDefaultValid =
                defaultShippingMethodId &&
                availableShippingMethods.some((method) => method.id === defaultShippingMethodId);
            // Re-submit the already-selected method when recalculating; otherwise pick the default.
            const methodIdToSubmit = needsPriceRecalculation
                ? selectedMethod?.id
                : isDefaultValid
                  ? defaultShippingMethodId
                  : availableShippingMethods[0]?.id;

            if (methodIdToSubmit) {
                const formData = new FormData();
                formData.append('shippingMethodId', methodIdToSubmit);
                // Use the recalculation path (no step advance) in two cases:
                // - Shopper just entered a new address: needs to review options with correct prices.
                // - Prices are stale (method selected but priceAdjustments not yet computed): update
                //   prices without closing the form so the shopper can review and confirm.
                // For returning customers with no method selected yet: advance the step silently.
                const autoSubmit = justEnteredAddress || needsPriceRecalculation ? onAutoSubmitRef.current : undefined;
                if (autoSubmit) {
                    autoSubmit(formData);
                } else {
                    onSubmitRef.current(formData);
                }
            }
        }

        if (!isEditing) {
            hasAutoSubmitted.current = false;
        }
    }, [
        isEditing,
        selectedMethod?.id,
        defaultShippingMethodId,
        isLoading,
        customerProfile,
        availableShippingMethods,
        hasPromotions,
        shippingDiscount,
        justEnteredAddress,
        onSubmitRef,
        onAutoSubmitRef,
    ]);

    const handleSubmit = useCallback(
        (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            onSubmitRef.current(formData);
        },
        [onSubmitRef]
    );

    return {
        availableShippingMethods,
        selectedMethod,
        summaryMethod,
        defaultShippingMethodId,
        isGuest,
        hideChangeForGuest,
        isUpcomingStep,
        getDiscountedPrice,
        handleSubmit,
    };
}
