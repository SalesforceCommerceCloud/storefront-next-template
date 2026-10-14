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
import { useBasketUpdater } from '@/providers/basket';
import { useToast } from '@/components/toast';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';
import { resourceRoutes } from '@/route-paths';
import { useFetcherEffect } from '@/hooks/use-fetcher-effect';
import type { ReorderActionResponse } from '@/routes/types/action-responses';
import type { ReorderQuantityMode } from '@/routes/action.cart-reorder';

export function useReorder(orderNo: string, quantityMode: ReorderQuantityMode = 'exact') {
    const fetcher = useFetcher<ReorderActionResponse>();
    const updateBasket = useBasketUpdater();
    const { addToast } = useToast();
    const { t } = useTranslation('account');

    useFetcherEffect(fetcher, {
        getError: (data) => {
            if (!data?.success && data?.error) return data.error.message;
            return undefined;
        },
        onSuccess: (result) => {
            if (result?.basket) {
                updateBasket(result.basket);
                setMiniCartOpen(true);
                const skippedCount = result?.skippedItems?.length ?? 0;
                if (skippedCount > 0) {
                    addToast(t('orders.reorderPartialSkip', { count: skippedCount }), 'info');
                }
                const adjustedCount = result?.adjustedItems?.length ?? 0;
                if (adjustedCount > 0) {
                    addToast(t('orders.reorderAdjusted', { count: adjustedCount }), 'info');
                }
            } else {
                // Every line was unavailable — basket unchanged
                addToast(t('orders.reorderAllSkipped'), 'info');
            }
        },
        onError: () => {
            addToast(t('orders.reorderFailed'), 'error');
        },
    });

    const reorder = useCallback(() => {
        const formData = new FormData();
        formData.set('orderNo', orderNo);
        formData.set('quantityMode', quantityMode);
        void fetcher.submit(formData, { method: 'POST', action: resourceRoutes.cartReorder });
    }, [fetcher, orderNo, quantityMode]);

    return {
        reorder,
        isLoading: fetcher.state !== 'idle',
    };
}
