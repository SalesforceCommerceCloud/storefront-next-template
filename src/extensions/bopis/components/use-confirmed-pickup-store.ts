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
/** @sfdc-extension-file SFDC_EXT_BOPIS */
import { useCallback, useEffect } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { PickupContext, SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { useChangePickupStore } from '@/extensions/bopis/hooks/use-change-pickup-store';

/** Adapt a confirmed preference notification to its logical pickup target across caller remounts. */
export function useConfirmedPickupStore(
    caller: 'cart' | 'checkout',
    currentStore: SelectedStoreInfo | null | undefined,
    pickupContext?: PickupContext
) {
    // With native store selection the chooser changes the shopper's store, never one pickup group's store.
    const nativeStoreContextEnabled = isNativeStoreSelectionEnabled(useConfig().features.shopperContext);
    // Store groups and caller surfaces must not consume each other's confirmation. The provider
    // scopes this logical owner to the chooser session and shopper/site generation when claiming.
    const owner = JSON.stringify(['pickup', caller, currentStore?.id]);
    const openChooser = useStoreLocator((state) => state.openChooser);
    const notification = useStoreLocator((state) => state.confirmedSelection);
    const claim = useStoreLocator((state) => state.claimConfirmedSelection);
    const { changeStore } = useChangePickupStore();
    useEffect(() => {
        if (notification?.owner !== owner) return;
        const confirmed = claim(owner);
        if (confirmed && currentStore && confirmed.id !== currentStore.id) void changeStore(confirmed);
    }, [notification, owner, claim, currentStore, changeStore]);
    return useCallback(() => {
        if (nativeStoreContextEnabled) return;
        if (currentStore) openChooser({ selectedStoreInfo: currentStore, owner, pickupContext });
    }, [nativeStoreContextEnabled, currentStore, openChooser, owner, pickupContext]);
}
