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
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig } from '@/test-utils/config';
import {
    StoreLocatorStateProvider,
    useStoreLocatorApi,
    type StoreLocatorStoreApi,
    type SelectedStoreResolution,
} from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import CheckoutStoreSelectionHost from '@/extensions/store-locator/components/checkout/checkout-store-selection-host';
import CheckoutStoreSelection from '@/extensions/store-locator/components/checkout/checkout-store-selection';

const selected = {
    id: 'store-1',
    inventoryId: 'inventory-1',
    name: 'Market Street · A very long neighbourhood and town name',
    fulfillmentMode: 'pickup',
} satisfies SelectedStoreInfo;
function setup({
    selection = selected,
    enabled = true,
    resolution,
}: {
    selection?: SelectedStoreInfo | null;
    enabled?: boolean;
    resolution?: Promise<SelectedStoreResolution>;
} = {}) {
    let api: StoreLocatorStoreApi;
    function Capture() {
        api = useStoreLocatorApi();
        return <CheckoutStoreSelection />;
    }
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: { enabled, fulfillmentModes: ['pickup', 'delivery'] as ('pickup' | 'delivery')[] },
        },
    };
    render(
        <AllProvidersWrapper config={config}>
            <StoreLocatorStateProvider selectedStoreInfo={selection} selectedStoreResolution={resolution}>
                <Capture />
            </StoreLocatorStateProvider>
        </AllProvidersWrapper>
    );
    return { getApi: () => api, user: userEvent.setup() };
}

describe('checkout committed shopping selection', () => {
    it('leaves existing checkout unchanged when entry config is omitted', () => {
        render(
            <AllProvidersWrapper>
                <CheckoutStoreSelection />
                <CheckoutStoreSelectionHost />
            </AllProvidersWrapper>
        );
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
    it('renders nothing when entry is disabled', () => {
        setup({ enabled: false });
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
    it.each(['pickup', 'delivery'] as const)('renders the full committed name and %s mode', async (fulfillmentMode) => {
        setup({ selection: { ...selected, fulfillmentMode } });
        expect(await screen.findByText(selected.name)).toBeVisible();
        expect(screen.getByRole('region', { name: 'Shopping store' })).toHaveTextContent(
            fulfillmentMode === 'pickup' ? 'Collection' : 'Delivery'
        );
        expect(screen.getByRole('button', { name: /Change shopping store/ })).toHaveAttribute(
            'aria-haspopup',
            'dialog'
        );
    });
    it.each([
        null,
        { ...selected, fulfillmentMode: undefined },
        { ...selected, inventoryId: undefined },
    ])('requests a complete selection for incomplete context', async (selection) => {
        setup({ selection });
        expect(await screen.findByRole('button', { name: 'Choose store' })).toBeVisible();
        expect(screen.queryByText(selected.name)).not.toBeInTheDocument();
    });
    it('does not show an uncommitted candidate, and prevents duplicate opening while a write is pending', async () => {
        const { getApi, user } = setup();
        act(() =>
            getApi().setState({
                chooserStoreInfo: { ...selected, name: 'Uncommitted candidate' },
                selectionPending: true,
            })
        );
        const button = await screen.findByRole('button', { name: /Change shopping store/ });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        await user.click(button);
        expect(getApi().getState().isOpen).toBe(false);
        expect(screen.queryByText('Uncommitted candidate')).not.toBeInTheDocument();
        act(() => getApi().setState({ selectionPending: false }));
        await user.click(button);
        expect(getApi().getState().isOpen).toBe(true);
        expect(getApi().getState().returnFocusTarget).toBe(button);
    });
    it('streams the initial committed context without flashing an actionable empty selection', async () => {
        let resolve!: (value: SelectedStoreResolution) => void;
        const resolution = new Promise<SelectedStoreResolution>((done) => {
            resolve = done;
        });
        setup({ selection: null, resolution });
        expect(screen.getByText('Loading store selection…')).toHaveAttribute('role', 'status');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        await act(async () => {
            resolve({ selectedStoreInfo: selected, error: null });
            await resolution;
        });
        expect(await screen.findByRole('button', { name: /Change shopping store/ })).toBeVisible();
    });
});
