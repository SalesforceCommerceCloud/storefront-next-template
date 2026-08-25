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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSelectedDeliveryOptionValid, validateDeliveryOptionCompatibility } from './product-actions';
import { createMockBasketWithPickupItems } from '@/extensions/bopis/tests/__mocks__/basket';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

vi.mock('@/lib/api-clients.server', () => ({
    createApiClients: vi.fn(),
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('@/extensions/bopis/lib/api/shipment.server', () => ({
    updateShipmentForPickup: vi.fn(),
}));

beforeEach(() => {
    vi.resetAllMocks();
});

describe('validateDeliveryOptionCompatibility', () => {
    it('returns valid when basket is undefined', () => {
        expect(validateDeliveryOptionCompatibility(undefined, 'store-123')).toEqual({ valid: true });
    });

    it('returns valid when basket has no product items', () => {
        const basket = createMockBasketWithPickupItems(undefined, {
            productItems: undefined,
        });
        expect(validateDeliveryOptionCompatibility(basket, 'store-123')).toEqual({ valid: true });
    });

    it('returns valid when adding delivery item (null storeId) to a basket with empty productItems', () => {
        const basket = createMockBasketWithPickupItems();
        expect(validateDeliveryOptionCompatibility(basket, null)).toEqual({ valid: true });
    });

    it('returns valid when adding pickup item from the same store as existing pickup items', () => {
        const basket = createMockBasketWithPickupItems([
            { productId: 'product-1', inventoryId: 'inventory-1', storeId: 'store-123' },
        ]);
        expect(validateDeliveryOptionCompatibility(basket, 'store-123')).toEqual({ valid: true });
    });

    it('returns invalid with translated error when adding pickup item from a different store', () => {
        const basket = createMockBasketWithPickupItems([
            { productId: 'product-1', inventoryId: 'inventory-1', storeId: 'store-123' },
        ]);
        const { t } = getTranslation();
        expect(validateDeliveryOptionCompatibility(basket, 'store-456')).toEqual({
            valid: false,
            errorMessage: t('extBopis:cart.addToCartValidation.changeStoreError'),
        });
    });

    it('ignores the store on an empty pickup shipment when choosing a new pickup store', () => {
        const basket = createMockBasketWithPickupItems(undefined, {
            shipments: [{ shipmentId: 'empty-pickup', c_fromStoreId: 'store-123' }],
            productItems: [{ itemId: 'delivery-item', productId: 'product-1', shipmentId: 'delivery-shipment' }],
        });

        expect(validateDeliveryOptionCompatibility(basket, 'store-456')).toEqual({ valid: true });
    });
});

describe('isSelectedDeliveryOptionValid', () => {
    it('returns true and does not call addToast when basket is undefined', () => {
        const addToast = vi.fn();
        expect(isSelectedDeliveryOptionValid(undefined, 'store-123', addToast)).toBe(true);
        expect(addToast).not.toHaveBeenCalled();
    });

    it('returns true and does not call addToast when adding pickup item from the same store', () => {
        const addToast = vi.fn();
        const basket = createMockBasketWithPickupItems([
            { productId: 'product-1', inventoryId: 'inventory-1', storeId: 'store-123' },
        ]);
        expect(isSelectedDeliveryOptionValid(basket, 'store-123', addToast)).toBe(true);
        expect(addToast).not.toHaveBeenCalled();
    });

    it('returns false and shows error toast when adding pickup item from a different store', () => {
        const addToast = vi.fn();
        const basket = createMockBasketWithPickupItems([
            { productId: 'product-1', inventoryId: 'inventory-1', storeId: 'store-123' },
        ]);
        const { t } = getTranslation();
        expect(isSelectedDeliveryOptionValid(basket, 'store-456', addToast)).toBe(false);
        expect(addToast).toHaveBeenCalledWith(t('extBopis:cart.addToCartValidation.changeStoreError'), 'error');
    });
});
