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
import { type ReactElement, useCallback, useEffect, useMemo, useRef } from 'react';
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
// @sfdc-extension-line SFDC_EXT_BOPIS
import { useBopisFulfillmentOption } from '@/extensions/bopis/components/delivery-options/pickup-option-contributor';
export interface DeliveryOptionsProps {
    product: ShopperProducts.schemas['Product'];
    quantity: number;
    /** Overrides site-inventory availability while a variant selection is unresolved or still loading inventory. */
    deliveryAvailable?: boolean;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    pickupLocation?: { id: string; name?: string; inventoryId?: string };
    className?: string;
    onSelectionChange?: (selection: SelectedFulfillmentOption) => void;
}

export default function DeliveryOptions({
    product,
    quantity,
    deliveryAvailable,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    pickupLocation,
    className,
    onSelectionChange,
}: DeliveryOptionsProps): ReactElement | null {
    const { t } = useTranslation('product');
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
    const deliveryContributor = useMemo<FulfillmentOptionContributor>(
        () => ({
            option: {
                id: 'delivery',
                order: 10,
                label: t('fulfillment.delivery', { defaultValue: 'Delivery' }),
                description: t('fulfillment.deliveryDescription', {
                    defaultValue: 'Enter postal code to see delivery estimate',
                }),
                availability: { available: deliveryAvailable ?? !isSiteOutOfStock(product, quantity) },
            },
        }),
        [deliveryAvailable, product, quantity, t]
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
        (nextSelection: SelectedFulfillmentOption, nextSelectionKey: string) => {
            if (!onSelectionChange || publishedSelectionKey.current === nextSelectionKey) return;
            publishedSelectionKey.current = nextSelectionKey;
            onSelectionChange(nextSelection);
        },
        [onSelectionChange]
    );

    useEffect(() => {
        if (!selection || !selectionKey) return;
        publishSelection(selection, selectionKey);
    }, [publishSelection, selection, selectionKey]);

    const handleChange = useCallback(
        (optionId: FulfillmentOptionId) => {
            const contributor = contributors.find(({ option }) => option.id === optionId);
            if (!contributor?.option.availability.available) return;

            const nextSelection = getSelection(optionId);
            if (!select(optionId)) return;
            publishSelection(nextSelection, `${product.id}:${JSON.stringify(nextSelection)}`);
        },
        [contributors, getSelection, product.id, publishSelection, select]
    );

    // A lone Delivery option is selected automatically and has no control to render.
    if (options.length < 2) return null;

    return (
        <div className={className}>
            <FulfillmentOptionPicker
                instanceId={product.id}
                value={value}
                options={options}
                onChange={handleChange}
                dataTestId="delivery-option-select"
                ariaLabel={t('fulfillment.method', { defaultValue: 'Fulfillment method' })}
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                renderDetails={(option) => {
                    if (option.id === value && option.id === 'pickup') return pickupDetail;
                    return null;
                }}
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            />
        </div>
    );
}
