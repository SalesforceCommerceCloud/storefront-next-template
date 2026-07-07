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
import type { ShopperProducts } from '@/scapi';
import type { Dialog } from '@/components/ui/dialog';

export interface CartItemModalProps extends Omit<React.ComponentProps<typeof Dialog>, 'onOpenChange'> {
    /**
     * Full product data. Required for edit mode. In add mode, supply `productId` instead
     * and the modal will fetch the product internally.
     */
    product?: ShopperProducts.schemas['Product'];
    /**
     * Product ID used in add mode when `product` is not provided.
     * The modal fetches the full product internally and shows a spinner while loading.
     */
    productId?: string;
    /** Initial variant selections */
    initialVariantSelections?: Record<string, string>;
    /**
     * Initial quantity. Defaults to 1 in add mode.
     */
    initialQuantity?: number;
    /**
     * Cart item ID for update operations. When provided the modal operates in edit mode
     * (Update button, quantity picker). When omitted the modal operates in add mode
     * (Add to Cart + Buy It Now buttons).
     */
    itemId?: string;
    /**
     * Called when the shopper clicks "Buy It Now" in add mode.
     * Typically navigates to the PDP with the currently selected variant pre-seeded.
     */
    onBuyNow?: () => void;
    /** Callback when dialog open state changes */
    onOpenChange?: (open: boolean) => void;
}
