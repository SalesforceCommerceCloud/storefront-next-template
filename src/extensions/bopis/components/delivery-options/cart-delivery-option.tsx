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
import { type ReactElement, useCallback, useEffect, useRef } from 'react';
import { resourceRoutes } from '@/route-paths';
import { useItemFetcher } from '@/hooks/use-item-fetcher';
import PickupOrDeliveryDropdown from './pickup-or-delivery-dropdown';
import { usePickupAvailability } from '@/extensions/bopis/hooks/use-pickup-availability';
import { DELIVERY_OPTIONS } from '@/extensions/bopis/constants';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useBasket } from '@/providers/basket';
import { useToast } from '@/components/toast';
import { useTranslation } from 'react-i18next';
import type { EnrichedProductItem } from '@/lib/product/product-utils';

interface CartDeliveryOptionProps {
    product: EnrichedProductItem;
    isDeliveryOutOfStock: boolean;
}

/**
 * Renders the delivery option dropdown for cart items
 *
 * Handles:
 * - Determining current fulfillment based on shipment
 * - Checking Pickup inventory and consuming Delivery availability from the cart adapter
 * - Handling delivery option changes with form submission
 * - Opening store locator when pickup is selected without a store
 * - Showing toast notifications for errors
 *
 * @param props
 * @returns JSX element with PickupOrDeliveryDropdown component
 */
export default function CartDeliveryOption({ product, isDeliveryOutOfStock }: CartDeliveryOptionProps): ReactElement {
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const openStoreLocator = useStoreLocator((s) => s.open);
    const setSelectedStoreInfoRaw = useStoreLocator((s) => s.setSelectedStoreInfo);
    const basketContext = useBasket();
    const fetcher = useItemFetcher({ itemId: product.itemId, componentName: 'cart-delivery-option' });
    const { addToast } = useToast();
    const { t: tExtBopis } = useTranslation('extBopis');
    const isStoreLocatorOpen = useStoreLocator((s) => s.isOpen);
    // Set when THIS line item opens the store locator to choose a pickup store; consumed when the sheet closes
    // so a store selection auto-applies pickup to this item (rather than requiring a second dropdown pick).
    const pendingPickupRef = useRef(false);

    // Calculate current fulfillment based on shipment
    const currentShipment = basketContext?.shipments?.find((s) => s.shipmentId === product?.shipmentId);
    const currentFulfillment = currentShipment?.c_fromStoreId ? DELIVERY_OPTIONS.PICKUP : DELIVERY_OPTIONS.DELIVERY;
    const currentStoreId =
        typeof currentShipment?.c_fromStoreId === 'string' ? currentShipment.c_fromStoreId : undefined;
    const pickupStore =
        currentStoreId && currentFulfillment === DELIVERY_OPTIONS.PICKUP
            ? { id: currentStoreId, inventoryId: product.inventoryId }
            : selectedStoreInfo;
    // ProductItem has productId, and Partial<Product> may have id, so use whichever is available for pickup inventory.
    const productId: string =
        (product as { id?: string; productId?: string }).id || (product as { productId?: string }).productId || '';
    const productWithId = { ...product, id: productId };
    const isPickupOutOfStock = usePickupAvailability({
        product: productWithId,
        quantity: product?.quantity || 1,
        pickupStore,
    });

    /**
     * Opens the store locator when pickup is selected without a store.
     * - When a user switches from delivery to pickup, they must select a pickup store
     */
    const handleOpenStoreLocator = useCallback(() => {
        if (!product.storeId) {
            setSelectedStoreInfoRaw(null);
        }
        // Remember this item is waiting for a pickup store, and scope the store search to it so the picker can
        // augment/sort stores by whether they stock it. Consumers that ignore pickupContext are unaffected.
        pendingPickupRef.current = true;
        openStoreLocator(productId ? { productId, quantity: product.quantity ?? 1 } : undefined);
    }, [product.storeId, product.quantity, productId, setSelectedStoreInfoRaw, openStoreLocator]);

    // Handle show error toast on delivery-option switch (pickup - cart & vice versa) failure
    const lastHandledErrorRef = useRef<unknown>(null);
    useEffect(() => {
        if (fetcher.state !== 'idle' || !fetcher.data) return;
        const result = fetcher.data;
        if (result.success !== false && !result.error) return;
        if (lastHandledErrorRef.current === result) return;
        lastHandledErrorRef.current = result;

        const productName =
            (product as { name?: string }).name || (product as { productName?: string }).productName || '';
        const quantity = product?.quantity ?? 1;
        const errorMessage = productName
            ? tExtBopis('cart.deliveryOptionProductUnavailable', {
                  productName,
                  quantity,
                  interpolation: { escapeValue: false },
              })
            : tExtBopis('cart.deliveryOptionChangeError', {
                  error: result.error?.message || 'Unknown error',
                  interpolation: { escapeValue: false },
              });
        addToast(errorMessage, 'error');
    }, [fetcher.data, fetcher.state, addToast, tExtBopis, product]);

    // When this item opened the store locator and the shopper picks a boutique, apply pickup automatically once
    // the sheet closes — so selecting a store completes the switch instead of leaving the item on Delivery. Only
    // the item that opened the locator holds `pendingPickupRef`, so a shared selection applies to just that item.
    useEffect(() => {
        if (isStoreLocatorOpen || !pendingPickupRef.current) return;
        pendingPickupRef.current = false; // consume the pending intent when the sheet closes
        const storeId = selectedStoreInfo?.id;
        const inventoryId = selectedStoreInfo?.inventoryId;
        if (!storeId || !inventoryId) return; // closed without choosing a boutique
        // Already collecting this item at the chosen boutique — nothing to submit.
        if (currentFulfillment === DELIVERY_OPTIONS.PICKUP && currentStoreId === storeId) return;
        const formData = new FormData();
        formData.append('itemId', product.itemId || '');
        formData.append('quantity', String(product.quantity ?? 1));
        formData.append('deliveryOption', DELIVERY_OPTIONS.PICKUP);
        formData.append('storeId', storeId);
        formData.append('inventoryId', inventoryId);
        void fetcher.submit(formData, { method: 'PATCH', action: resourceRoutes.cartItemUpdate });
    }, [
        isStoreLocatorOpen,
        selectedStoreInfo,
        currentFulfillment,
        currentStoreId,
        product.itemId,
        product.quantity,
        fetcher,
    ]);

    const handleSubmitDeliveryOption = (option: string) => {
        if (option === DELIVERY_OPTIONS.PICKUP) {
            // Boutique stock is per-item, so a store selected for another item may not carry this one. Always
            // open the picker — it shows per-boutique availability, blocks out-of-stock choices, and lets the
            // shopper (re)choose the boutique for THIS item. Selecting a boutique auto-applies pickup (effect above).
            handleOpenStoreLocator();
            return;
        }

        if (isDeliveryOutOfStock) {
            addToast(tExtBopis('deliveryOptions.pickupOrDelivery.outOfStockAtStore'), 'error');
            return;
        }
        const formData = new FormData();
        formData.append('itemId', product.itemId || '');
        formData.append('quantity', String(product.quantity ?? 1));
        formData.append('deliveryOption', DELIVERY_OPTIONS.DELIVERY);
        void fetcher.submit(formData, {
            method: 'PATCH',
            action: resourceRoutes.cartItemUpdate,
        });
    };

    return (
        <PickupOrDeliveryDropdown
            value={currentFulfillment}
            onChange={handleSubmitDeliveryOption}
            isPickupDisabled={isPickupOutOfStock}
            isDeliveryDisabled={isDeliveryOutOfStock}
        />
    );
}
