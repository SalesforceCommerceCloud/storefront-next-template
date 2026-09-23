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
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import InlineAddToCart, { type InlineAddToCartProps } from '@/components/inline-add-to-cart';
import { useInlineCartQuantity } from '@/hooks/use-inline-cart-quantity';

export interface ConnectedInlineAddToCartProps
    extends Pick<InlineAddToCartProps, 'onAdd' | 'disabled' | 'loading' | 'productName' | 'className'> {
    /** Selected SKU (a resolved variant's product id, or the standard product id). */
    productId: string | undefined;
    /** Selected pickup store. Omitted for ship-to-home. */
    storeId?: string | null;
    /** Available stock for the selected SKU and fulfillment option. */
    stockLevel?: number;
    /** Maximum quantity configured for this item, such as a bonus-product limit. */
    maxQuantity?: number;
}

/**
 * Connects the presentational PDP cart control to the basket-backed quantity
 * hook. It is lazy-loaded after the PDP's initial render so the basket is only
 * hydrated when the inline control is enabled.
 */
export default function ConnectedInlineAddToCart({
    productId,
    storeId,
    stockLevel,
    maxQuantity,
    onAdd,
    disabled,
    loading,
    productName,
    className,
}: ConnectedInlineAddToCartProps): ReactElement {
    const { t } = useTranslation('quantitySelector');
    const { quantityInCart, increment, decrement, isUpdating, incrementDisabled, isResolvingQuantity } =
        useInlineCartQuantity({
            productId,
            storeId,
            stockLevel,
            maxQuantity,
            enabled: true,
        });

    return (
        <InlineAddToCart
            quantityInCart={quantityInCart}
            onAdd={onAdd}
            onIncrement={increment}
            onDecrement={decrement}
            disabled={disabled}
            incrementDisabled={incrementDisabled}
            loading={loading || isUpdating}
            resolvingQuantity={isResolvingQuantity}
            productName={productName}
            stockMessage={incrementDisabled ? t('maxStockReached') : null}
            className={className}
        />
    );
}
