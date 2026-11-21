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
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { resourceRoutes } from '@/route-paths';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { useToast } from '@/components/toast';
import type { action as cartPickupStoreUpdateAction } from '@/extensions/bopis/routes/action.cart-pickup-store-update';

/**
 * Hook for changing the pickup store for all pickup items in the basket.
 *
 * This hook provides:
 * - `changeStore`: Function to change the pickup store
 *
 * The hook automatically handles responses and shows toast notifications.
 *
 * @returns Object containing change store function
 *
 * @example
 * ```tsx
 * const { changeStore } = useChangePickupStore();
 *
 * // Change store when user selects a new store
 * await changeStore(newStore);
 * ```
 */
export function useChangePickupStore() {
    const { t } = useTranslation('extBopis');
    const fetcher = useFetcher<typeof cartPickupStoreUpdateAction>();
    const { addToast } = useToast();

    // Process response and show toast when data is available in 'loading' state
    // React Router automatically revalidates after successful action submissions,
    // so we don't need to manually trigger revalidation
    useEffect(() => {
        if (fetcher.state === 'loading' && fetcher.data) {
            const result = fetcher.data;

            if (result.success) {
                addToast(t('cart.pickupStoreInfo.storeChanged'), 'success');
            } else if (result.success === false || result.error) {
                const errorMessage = result.error?.message || t('cart.pickupStoreInfo.changeStoreError');
                addToast(errorMessage, 'error');
            }
        }
    }, [fetcher.data, fetcher.state, addToast, t]);

    // Change the pickup store
    const changeStore = useCallback(
        async (store: SelectedStoreInfo) => {
            if (!store.id || !store.inventoryId) {
                addToast(t('cart.pickupStoreInfo.missingStoreIdOrInventoryIdError'), 'error');
                return;
            }

            const formData = new FormData();
            formData.append('storeId', store.id);
            formData.append('inventoryId', store.inventoryId);
            if (store.name) {
                formData.append('storeName', store.name);
            }

            await fetcher.submit(formData, {
                method: 'PATCH',
                action: resourceRoutes.cartPickupStoreUpdate,
            });
        },
        [fetcher, addToast, t]
    );

    return {
        changeStore,
    };
}
