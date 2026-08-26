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
// @sfdc-extension-file SFDC_EXT_BOPIS
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EnrichedProductItem } from '@/lib/product/product-utils';
import { isSiteOutOfStock } from '@/lib/product/inventory-utils';
import CartDeliveryOption from './cart-delivery-option';

vi.mock('@/lib/product/inventory-utils', () => ({
    isSiteOutOfStock: vi.fn(),
}));

vi.mock('@/extensions/bopis/components/delivery-options/cart-delivery-option', () => ({
    default: ({ isDeliveryOutOfStock }: { isDeliveryOutOfStock: boolean }) => (
        <output data-testid="bopis-cart-delivery-option">{String(isDeliveryOutOfStock)}</output>
    ),
}));

const product: EnrichedProductItem = {
    itemId: 'item-1',
    productId: 'product-1',
    quantity: 2,
    shipmentId: 'shipment-1',
};

describe('CartDeliveryOption', () => {
    it('calculates Delivery availability and passes it to the BOPIS adapter', () => {
        vi.mocked(isSiteOutOfStock).mockReturnValue(true);

        render(<CartDeliveryOption product={product} />);

        expect(isSiteOutOfStock).toHaveBeenCalledWith({ ...product, id: 'product-1' }, 2);
        expect(screen.getByTestId('bopis-cart-delivery-option')).toHaveTextContent('true');
    });
});
