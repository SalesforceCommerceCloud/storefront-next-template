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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoreLocatorStateProvider, useStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import { createSelectionCoordinator } from '@/extensions/store-locator/stores/selection-coordinator';
import { ConfigWrapper } from '@/test-utils/context-provider';
import { useConfirmedPickupStore } from './use-confirmed-pickup-store';

const { changeStore } = vi.hoisted(() => ({ changeStore: vi.fn() }));
vi.mock('@/extensions/bopis/hooks/use-change-pickup-store', () => ({
    useChangePickupStore: () => ({ changeStore }),
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({
    useSite: () => ({ site: { id: 'site' } }),
}));

const canonical = { id: 'B', inventoryId: 'canonical-inventory' };

function Caller({ caller, storeId }: { caller: 'cart' | 'checkout'; storeId: string }) {
    const open = useConfirmedPickupStore(caller, { id: storeId });
    return (
        <button onClick={open}>
            {caller}-{storeId}
        </button>
    );
}

describe('logical pickup confirmation ownership', () => {
    it.each(['confirm', 'cancel', 'new chooser', 'shopper scope', 'same store'])('%s across remount', (reason) => {
        changeStore.mockClear();
        let api!: ReturnType<typeof useStoreLocatorApi>;
        function Controls() {
            api = useStoreLocatorApi();
            return null;
        }
        function Harness({ revision = 0, identity = 'guest' }) {
            return (
                <ConfigWrapper>
                    <StoreLocatorStateProvider identity={identity}>
                        <Controls />
                        <Caller key={revision} caller="cart" storeId="A" />
                        <Caller caller="cart" storeId="other" />
                        <Caller caller="checkout" storeId="A" />
                        <Caller caller="cart" storeId="A" />
                    </StoreLocatorStateProvider>
                </ConfigWrapper>
            );
        }
        const view = render(<Harness />);
        fireEvent.click(screen.getAllByText('cart-A')[0]);
        const coordinator = createSelectionCoordinator(api);
        const operation = coordinator.begin(reason === 'same store' ? 'A' : 'B', api.getState().generation);
        if (!operation) throw new Error('Expected selection');
        view.rerender(<Harness revision={1} />);
        if (reason === 'shopper scope') view.rerender(<Harness revision={1} identity="registered" />);
        act(() => {
            if (reason === 'cancel') api.getState().close();
            if (reason === 'new chooser') api.getState().openChooser({ owner: operation.owner ?? undefined });
            coordinator.complete(operation.id, {
                success: true,
                selectedStoreInfo: reason === 'same store' ? { ...canonical, id: 'A' } : canonical,
            });
        });
        expect(changeStore).toHaveBeenCalledTimes(reason === 'confirm' ? 1 : 0);
        if (reason === 'confirm') expect(changeStore).toHaveBeenCalledWith(canonical);
        // Duplicate observers and a later remount cannot replay the atomically consumed notification.
        view.rerender(<Harness revision={2} identity={reason === 'shopper scope' ? 'registered' : 'guest'} />);
        expect(changeStore).toHaveBeenCalledTimes(reason === 'confirm' ? 1 : 0);
        expect(api.getState().confirmedSelection).toBeNull();
    });
});
