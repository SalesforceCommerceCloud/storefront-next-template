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
import {
    type ReactElement,
    useCallback,
    useEffect,
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
    useLayoutEffect,
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    useMemo,
    useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperProducts } from '@/scapi';
import { FulfillmentOptionPicker } from '@/components/fulfillment/fulfillment-option-picker';
import { useFulfillmentOptions } from '@/components/fulfillment/use-fulfillment-options';
import {
    createFulfillmentSelection,
    type FulfillmentOptionContributor,
    type FulfillmentOptionId,
    type SelectedFulfillmentOption,
} from '@/components/fulfillment/types';
import { isSiteOutOfStock } from '@/lib/product/inventory-utils';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
// @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
import { useOptionalProductView } from '@/providers/product-view';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_BOPIS
// @sfdc-extension-line SFDC_EXT_SHIPPING_DELIVERY
import { useShippingDelivery } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
// @sfdc-extension-line SFDC_EXT_BOPIS
import { useBopisFulfillmentOption } from '@/extensions/bopis/components/delivery-options/pickup-option-contributor';
export interface DeliveryOptionsProps {
    product: ShopperProducts.schemas['Product'];
    quantity: number;
    /** Overrides site-inventory availability while a variant selection is unresolved or still loading inventory. */
    deliveryAvailable?: boolean;
    /** Stable identity for this picker instance and its fulfillment controls. */
    instanceId?: string;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    pickupLocation?: { id: string; name?: string; inventoryId?: string };
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    /** Enables delivery-estimate presentation inside this picker when multiple fulfillment options exist. */
    enableDeliveryEstimatePresentation?: boolean;
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    className?: string;
    onSelectionChange?: (selection: SelectedFulfillmentOption | undefined) => void;
}

// @sfdc-extension-block-start SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
// oxlint-disable-next-line react/only-export-components -- exported for direct eligibility regression coverage
export function isDeliveryEstimatePresentationHost(options: Array<{ id: string }>): boolean {
    return (
        options.length === 2 && options.some(({ id }) => id === 'delivery') && options.some(({ id }) => id === 'pickup')
    );
}
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
// @sfdc-extension-block-end SFDC_EXT_BOPIS

export default function DeliveryOptions({
    product,
    quantity,
    deliveryAvailable,
    instanceId = product.id,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    pickupLocation,
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    enableDeliveryEstimatePresentation = false,
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    className,
    onSelectionChange,
}: DeliveryOptionsProps): ReactElement | null {
    const { t } = useTranslation('product');
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    const shippingDelivery = useShippingDelivery();
    const registerPresentationHost = shippingDelivery?.registerPresentationHost;
    const updatePresentationHostTitleElement = shippingDelivery?.updatePresentationHostTitleElement;
    const updatePresentationHostElement = shippingDelivery?.updatePresentationHostElement;
    const requestDeliveryEstimate = shippingDelivery?.requestDeliveryEstimate;
    const declarePresentationHost = shippingDelivery?.declarePresentationHost;
    const productView = useOptionalProductView();
    const presentationRegistrationId = useRef({});
    const deliveryTitleElementRef = useRef<HTMLSpanElement | null>(null);
    const deliveryDetailsElementRef = useRef<HTMLDivElement | null>(null);
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const {
        contributor: pickupContributor,
        detail: pickupDetail,
        synchronizeSelection: synchronizePickupSelection,
    } = useBopisFulfillmentOption({
        product,
        quantity,
        basketPickupStore: pickupLocation,
    });
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const defaultDeliveryDescription = t('fulfillment.deliveryDescription', {
        defaultValue: 'Enter a postal code to get a delivery estimate',
    });
    // The last enabled fulfillment extension wins the Delivery description, including overriding it to undefined.
    // A mutable holder keeps this strip-safe: a removed block drops its reassignment and the prior value stands.
    const deliveryDescriptionOverride = { value: defaultDeliveryDescription as string | undefined };
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const deliveryAddressDescription = t('fulfillment.deliveryAddressDescription', {
        defaultValue: 'Deliver to shipping address',
    });
    deliveryDescriptionOverride.value = deliveryAddressDescription;
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    const nonCoordinatedDeliveryDescription = shippingDelivery
        ? defaultDeliveryDescription
        : deliveryAddressDescription;
    const isEligiblePresentationHost =
        enableDeliveryEstimatePresentation &&
        isDeliveryEstimatePresentationHost([{ id: 'delivery' }, pickupContributor.option]);
    const ownsPresentation = shippingDelivery?.presentationHost?.registrationId === presentationRegistrationId.current;
    const presentation = ownsPresentation ? shippingDelivery?.presentation : null;
    // The estimate has settled to a shopper-facing string (a date range or a merchant fallback) that the
    // Delivery row shows in place of its default label/description.
    const resolvedPresentation =
        presentation?.kind === 'resolved' || presentation?.kind === 'fallback' ? presentation : null;
    const coordinatesPresentation = Boolean(
        shippingDelivery && isEligiblePresentationHost && (!shippingDelivery.presentationHost || ownsPresentation)
    );
    const estimateProductId = productView?.currentVariant?.productId ?? product.id;
    const shouldShowDeliveryEstimatePrompt =
        coordinatesPresentation && !resolvedPresentation && !shippingDelivery?.hasPublishedResolvedPresentation;
    const deliveryDescription: string | undefined = resolvedPresentation
        ? resolvedPresentation.text
        : coordinatesPresentation
          ? undefined
          : nonCoordinatedDeliveryDescription;
    deliveryDescriptionOverride.value = deliveryDescription;
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const deliveryContributor = useMemo<FulfillmentOptionContributor>(
        () => ({
            option: {
                id: 'delivery',
                order: 10,
                label: t('fulfillment.delivery', { defaultValue: 'Delivery' }),
                description: deliveryDescriptionOverride.value,
                availability: { available: deliveryAvailable ?? !isSiteOutOfStock(product, quantity) },
            },
        }),
        [deliveryAvailable, deliveryDescriptionOverride.value, product, quantity, t]
    );
    const contributors = useMemo(
        () =>
            [
                deliveryContributor,
                // @sfdc-extension-line SFDC_EXT_BOPIS
                pickupContributor,
            ] as FulfillmentOptionContributor[],
        [
            deliveryContributor,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            pickupContributor,
        ]
    );
    const { value, select, options } = useFulfillmentOptions({ contributors });
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    const presentationProductId = shippingDelivery?.productId;
    if (isEligiblePresentationHost && presentationProductId) {
        declarePresentationHost?.(presentationProductId);
    }
    useLayoutEffect(() => {
        if (!registerPresentationHost || !isEligiblePresentationHost || !presentationProductId) return;

        return registerPresentationHost({
            registrationId: presentationRegistrationId.current,
            productId: presentationProductId,
            instanceId,
            selectedOptionId: value,
            titleElement: deliveryTitleElementRef.current,
            detailsElement: deliveryDetailsElementRef.current,
            deliveryControlId: `fulfillment-option-${instanceId}-delivery`,
            pickupControlId: `fulfillment-option-${instanceId}-pickup`,
        });
    }, [instanceId, isEligiblePresentationHost, presentationProductId, registerPresentationHost, value]);
    const setDeliveryTitleElement = useCallback(
        (element: HTMLSpanElement | null) => {
            deliveryTitleElementRef.current = element;
            updatePresentationHostTitleElement?.(presentationRegistrationId.current, element);
        },
        [updatePresentationHostTitleElement]
    );
    const setDeliveryDetailsElement = useCallback(
        (element: HTMLDivElement | null) => {
            deliveryDetailsElementRef.current = element;
            updatePresentationHostElement?.(presentationRegistrationId.current, element);
        },
        [updatePresentationHostElement]
    );
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    useEffect(() => {
        synchronizePickupSelection(value);
    }, [synchronizePickupSelection, value]);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const getSelection = useCallback(
        (optionId: FulfillmentOptionId) => {
            const contributor = contributors.find(({ option }) => option.id === optionId);
            return contributor?.createSelection?.(optionId) ?? createFulfillmentSelection(optionId);
        },
        [contributors]
    );
    const selection = useMemo(() => (value ? getSelection(value) : undefined), [getSelection, value]);
    const selectionKey = selection ? `${product.id}:${JSON.stringify(selection)}` : undefined;
    const publishedSelectionKey = useRef<string | undefined>(undefined);
    const previousOnSelectionChange = useRef(onSelectionChange);

    useEffect(() => {
        if (!previousOnSelectionChange.current && onSelectionChange) {
            publishedSelectionKey.current = undefined;
        }
        previousOnSelectionChange.current = onSelectionChange;
    }, [onSelectionChange]);

    const publishSelection = useCallback(
        (nextSelection: SelectedFulfillmentOption | undefined, nextSelectionKey: string | undefined) => {
            if (!onSelectionChange || publishedSelectionKey.current === nextSelectionKey) return;
            publishedSelectionKey.current = nextSelectionKey;
            onSelectionChange(nextSelection);
        },
        [onSelectionChange]
    );

    useEffect(() => {
        publishSelection(selection, selectionKey);
    }, [publishSelection, selection, selectionKey]);

    const handleChange = useCallback(
        (optionId: FulfillmentOptionId) => {
            const contributor = contributors.find(({ option }) => option.id === optionId);
            if (!contributor?.option.availability.available) return;

            const nextSelection = getSelection(optionId);
            if (!select(optionId)) return;
            publishSelection(nextSelection, `${product.id}:${JSON.stringify(nextSelection)}`);
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
            // The Delivery radio is the single disclosure control for its standalone calculator.
            if (optionId === 'delivery' && shouldShowDeliveryEstimatePrompt) {
                requestDeliveryEstimate?.(estimateProductId);
            }
            // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        },
        [
            contributors,
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
            estimateProductId,
            // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            getSelection,
            product.id,
            publishSelection,
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
            requestDeliveryEstimate,
            // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            select,
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
            shouldShowDeliveryEstimatePrompt,
            // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        ]
    );

    // A lone Delivery option is selected automatically and has no control to render.
    if (options.length < 2) return null;

    return (
        <div className={className}>
            <FulfillmentOptionPicker
                instanceId={instanceId}
                value={value}
                options={options}
                onChange={handleChange}
                dataTestId="delivery-option-select"
                ariaLabel={t('fulfillment.method', { defaultValue: 'Fulfillment method' })}
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
                renderTitle={(option) =>
                    ownsPresentation && option.id === 'delivery' ? (
                        <>
                            <span ref={setDeliveryTitleElement} />
                            {resolvedPresentation ? null : option.label}
                        </>
                    ) : undefined
                }
                getOptionAriaLabel={(option) =>
                    resolvedPresentation && option.id === 'delivery'
                        ? `${option.label}, ${resolvedPresentation.title}`
                        : option.label
                }
                getOptionAriaDescription={(option) =>
                    shouldShowDeliveryEstimatePrompt && option.id === 'delivery'
                        ? defaultDeliveryDescription
                        : undefined
                }
                // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
                renderDetails={(option) => {
                    if (option.id === value && option.id === 'pickup') return pickupDetail;
                    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
                    if (coordinatesPresentation && option.id === 'delivery') {
                        return (
                            <div ref={setDeliveryDetailsElement}>
                                {presentation?.kind === 'loading' ? (
                                    <p role="status" className="mt-0.5 text-xs text-muted-foreground">
                                        {presentation.text}
                                    </p>
                                ) : shouldShowDeliveryEstimatePrompt && option.availability.available ? (
                                    <p className="mt-0.5 text-xs font-normal leading-4 tracking-[0.12px] text-muted-foreground">
                                        {defaultDeliveryDescription}
                                    </p>
                                ) : null}
                            </div>
                        );
                    }
                    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
                    return null;
                }}
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            />
        </div>
    );
}
