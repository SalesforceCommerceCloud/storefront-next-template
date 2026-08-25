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
import { type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperProducts } from '@/scapi';
import { createFulfillmentSelection, type FulfillmentOptionContributor } from '@/components/fulfillment/types';
import { DELIVERY_OPTIONS, type DeliveryOption } from '@/extensions/bopis/constants';
import { usePickupAvailability } from '@/extensions/bopis/hooks/use-pickup-availability';
import { getStoreName } from '@/extensions/bopis/lib/store-utils';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { usePickup } from '@/extensions/bopis/context/pickup-context';

interface UseBopisFulfillmentOptionProps {
    product: ShopperProducts.schemas['Product'];
    quantity: number;
    basketPickupStore?: SelectedStoreInfo;
}

export function useBopisFulfillmentOption({ product, quantity, basketPickupStore }: UseBopisFulfillmentOptionProps): {
    contributor: FulfillmentOptionContributor;
    detail: ReactNode;
    synchronizeSelection: (option: DeliveryOption | undefined) => void;
} {
    const { t } = useTranslation('extBopis');
    const selectedStore = useStoreLocator((state) => state.selectedStoreInfo);
    const openStoreLocator = useStoreLocator((state) => state.open);
    const pickupStore = basketPickupStore || selectedStore;
    const pickupContext = usePickup();
    const isPickupOutOfStock = usePickupAvailability({
        product,
        quantity,
        pickupStore,
    });
    const contributor = useMemo<FulfillmentOptionContributor>(
        () => ({
            option: {
                id: 'pickup',
                order: 20,
                label: isPickupOutOfStock
                    ? t('deliveryOptions.pickupOrDelivery.unavailablePickUpIn')
                    : t('deliveryOptions.pickupOrDelivery.pickUpInStore'),
                description: pickupStore
                    ? getStoreName(pickupStore)
                    : t('deliveryOptions.pickupOrDelivery.selectStore'),
                availability: { available: !isPickupOutOfStock },
            },
            onSelect: () => {
                if (!pickupStore) {
                    openStoreLocator();
                    return false;
                }
            },
            createSelection: (optionId) =>
                optionId === 'pickup' && pickupStore?.id && pickupStore.inventoryId
                    ? createFulfillmentSelection(optionId, {
                          storeId: pickupStore.id,
                          inventoryId: pickupStore.inventoryId,
                      })
                    : createFulfillmentSelection(optionId),
        }),
        [isPickupOutOfStock, openStoreLocator, pickupStore, t]
    );

    const detail = useMemo(
        () =>
            pickupStore ? (
                <button
                    type="button"
                    onClick={openStoreLocator}
                    className="mt-0.5 text-left text-xs text-muted-foreground hover:underline">
                    {t('storeInventoryFilter.changeStore')}
                </button>
            ) : null,
        [openStoreLocator, pickupStore, t]
    );

    const synchronizeSelection = useCallback(
        (option: DeliveryOption | undefined) => {
            if (basketPickupStore || !option || !pickupContext || !product.id) {
                return;
            }
            if (option === DELIVERY_OPTIONS.PICKUP) {
                if (pickupStore?.id && pickupStore.inventoryId) {
                    pickupContext.addItem(product.id, pickupStore.inventoryId, pickupStore.id);
                }
            } else {
                pickupContext.removeItem(product.id);
            }
        },
        [basketPickupStore, pickupContext, pickupStore?.id, pickupStore?.inventoryId, product.id]
    );

    return { contributor, detail, synchronizeSelection };
}
