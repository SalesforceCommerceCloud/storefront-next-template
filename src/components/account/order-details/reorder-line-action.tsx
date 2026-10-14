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
import { useCallback } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Typography } from '@/components/typography';
import ConnectedInlineAddToCart from '@/components/inline-add-to-cart/connected';
import { isInStock, getEffectiveStockLevel } from '@/lib/product/inventory-utils';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';
import { useFetcherEffect } from '@/hooks/use-fetcher-effect';
import { useBasketUpdater } from '@/providers/basket';
import { resourceRoutes } from '@/route-paths';
import type { BasketActionResponse } from '@/routes/types/action-responses';
import type { ShopperOrders, ShopperProducts } from '@/scapi';

type OrderItem = ShopperOrders.schemas['ProductItem'];

interface ReorderLineActionProps {
    item: OrderItem;
    productData?: ShopperProducts.schemas['Product'];
}

export function ReorderLineAction({ item, productData }: ReorderLineActionProps) {
    const { t } = useTranslation('account');
    const fetcher = useFetcher<BasketActionResponse>();
    const updateBasket = useBasketUpdater();

    useFetcherEffect(fetcher, {
        onSuccess: (result) => {
            if (result?.basket) {
                updateBasket(result.basket);
            }
            setMiniCartOpen(true);
        },
    });

    const handleAdd = useCallback(() => {
        const formData = new FormData();
        formData.set('productItem', JSON.stringify({ productId: item.productId, quantity: item.quantity ?? 1 }));
        void fetcher.submit(formData, { method: 'POST', action: resourceRoutes.cartItemAdd });
    }, [fetcher, item.productId, item.quantity]);

    if (!item.productId) return null;

    const quantity = item.quantity ?? 1;

    // Only show "Out of stock" when we have explicit inventory data confirming it.
    // productsById from the order loader does not include availability by default,
    // so absence of inventory !== out of stock.
    const hasInventoryData = !!productData?.inventory;
    const inStock = !hasInventoryData || isInStock({ product: productData, quantity, isPickup: false, variant: null });

    if (hasInventoryData && !inStock) {
        return (
            <Typography variant="p" className="text-xs text-destructive">
                {t('orders.outOfStock')}
            </Typography>
        );
    }

    const stockLevel =
        hasInventoryData && productData
            ? getEffectiveStockLevel({ product: productData, isPickup: false, variant: null })
            : undefined;

    return (
        <ConnectedInlineAddToCart
            productId={item.productId}
            stockLevel={stockLevel}
            productName={item.productName ?? undefined}
            onAdd={handleAdd}
            loading={fetcher.state !== 'idle'}
        />
    );
}

export default ReorderLineAction;
