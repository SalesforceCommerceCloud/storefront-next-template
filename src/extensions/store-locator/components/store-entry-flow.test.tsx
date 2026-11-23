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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { act, useState } from 'react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorSheetHost from '@/extensions/store-locator/components/header/store-locator-sheet-host';
import StoreLocatorBadge from '@/extensions/store-locator/components/header/store-locator-badge';
import { useStoreEntryAdd } from '@/extensions/store-locator/hooks/use-store-entry-add';
import { resourceRoutes } from '@/route-paths';
import CheckoutStoreSelection from '@/extensions/store-locator/components/checkout/checkout-store-selection';
import CheckoutStoreSelectionHost from '@/extensions/store-locator/components/checkout/checkout-store-selection-host';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';
import type { FulfillmentMode } from '@/extensions/store-locator/lib/store-entry';

import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';

// Replacement boutique choosers intentionally omit store entry; keep these assertions for implementing surfaces.
const describeStoreEntry = describe.skipIf(!storeEntryCapabilities.fulfillmentFirst);

const resumedAdd = vi.fn();
const selectionAction = vi.fn();
const search = vi.fn();
const intent = {
    productId: 'variant-red-small',
    quantity: 3,
    optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
};
const selected = {
    id: 'A',
    name: 'A long grocery store name with neighbourhood and town',
    inventoryId: 'inventory-a',
    fulfillmentMode: 'pickup',
};

function Product() {
    const add = useStoreEntryAdd();
    const [quantity, setQuantity] = useState(3);
    return (
        <>
            <StoreLocatorBadge />
            <StoreLocatorSheetHost />
            <button onClick={() => add.intercept({ ...intent, quantity }, resumedAdd)}>Add product</button>
            <button onClick={() => setQuantity(9)}>Change quantity</button>
        </>
    );
}
function setup(modes: FulfillmentMode[] = ['pickup', 'delivery'], checkout = false) {
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: { enabled: true, policy: 'soft' as const, fulfillmentModes: modes, countries: ['GB', 'FR'] },
        },
    };
    const router = createMemoryRouter(
        [
            {
                path: '/product/:id',
                element: (
                    <AllProvidersWrapper config={config}>
                        {checkout ? (
                            <StoreLocatorProvider
                                selectedStoreInfo={{
                                    ...selected,
                                    id: 'original',
                                    name: 'Current store',
                                    fulfillmentMode: 'pickup',
                                }}
                                entryEnabled>
                                <CheckoutStoreSelection />
                                <CheckoutStoreSelectionHost />
                            </StoreLocatorProvider>
                        ) : (
                            <Product />
                        )}
                    </AllProvidersWrapper>
                ),
            },
            { path: resourceRoutes.stores, loader: search },
            { path: resourceRoutes.setSelectedStore, action: selectionAction },
        ],
        { initialEntries: ['/product/variant-red-small?color=red&size=small'] }
    );
    render(<RouterProvider router={router} />);
    return userEvent.setup();
}
async function searchByPostcode(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Country' }), 'GB');
    await user.type(screen.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    return screen.findByRole('radio', { name: /A long grocery store name/ });
}
beforeEach(() => {
    vi.resetAllMocks();
    search.mockImplementation(({ request }: { request: Request }) => {
        const mode = new URL(request.url).searchParams.get('fulfillmentMode');
        return {
            success: true,
            fulfillmentMode: mode,
            stores: {
                data: [
                    {
                        ...selected,
                        address1: '1 High Street',
                        city: 'London',
                        postalCode: 'SW1A 1AA',
                        storeHours: 'Monday 09:00–18:00',
                        distance: 1.23,
                    },
                ],
                total: 1,
                limit: 200,
            },
            eligibility: {
                A: {
                    eligible: true,
                    status: 'Service available',
                    services: ['Collection'],
                },
            },
        };
    });
    selectionAction.mockImplementation(async ({ request }: { request: Request }) => {
        const body = await request.formData();
        const candidate = { fulfillmentMode: body.get('fulfillmentMode') as FulfillmentMode };
        return {
            success: true,
            selectedStoreInfo: { ...selected, fulfillmentMode: candidate.fulfillmentMode },
            shoppingContext: null,
        };
    });
});

describeStoreEntry('store entry on a product deep link (explicit service/action doubles)', () => {
    it('permits soft browsing, chooses mode before search, and resumes the captured SKU/options/quantity once', async () => {
        const user = setup();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        const addButton = screen.getByRole('button', { name: 'Add product' });
        await user.click(addButton);
        expect(await screen.findByRole('radio', { name: /Pickup|Collection/ })).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        await user.click(screen.getByRole('radio', { name: /Pickup|Collection/ }));
        const choice = await searchByPostcode(user);
        expect(resumedAdd).not.toHaveBeenCalled();
        await user.click(choice);
        await waitFor(() => expect(resumedAdd).toHaveBeenCalledExactlyOnceWith(intent, selected));
        expect(selectionAction).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Collection', { selector: '[data-slot=store-locator-fulfillment]' })).toBeVisible();
        expect(await screen.findByText(/Selected A long grocery/)).toHaveAttribute('role', 'status');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(addButton).toHaveFocus());
    });
    it('announces a pending search before showing its completed results', async () => {
        let finish!: (value: unknown) => void;
        const response = new Promise((resolve) => {
            finish = resolve;
        });
        search.mockReturnValueOnce(response);
        const user = setup(['pickup']);
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await user.selectOptions(await screen.findByRole('combobox', { name: 'Country' }), 'GB');
        await user.type(screen.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
        await user.click(screen.getByRole('button', { name: 'Find' }));
        expect(await screen.findByText('Searching for stores…')).toBeVisible();
        expect(screen.queryByText('Sorry, there are no locations in this area.')).not.toBeInTheDocument();
        await act(async () => {
            finish({
                success: true,
                fulfillmentMode: 'pickup',
                stores: { data: [selected], total: 1, limit: 200 },
                eligibility: { A: { eligible: true } },
            });
            await response;
        });
        expect(await screen.findByRole('radio', { name: /A long grocery store name/ })).toBeVisible();
        expect(screen.queryByText('Searching for stores…')).not.toBeInTheDocument();
        expect(resumedAdd).not.toHaveBeenCalled();
    });

    it('skips a single configured mode and leaves manual entry focused when geolocation is unavailable', async () => {
        const user = setup(['pickup']);
        vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        expect(await screen.findByRole('textbox', { name: 'Postcode' })).toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: /Pickup|Collection/ })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Use My Location' }));
        expect(screen.getByRole('textbox', { name: 'Postcode' })).toHaveFocus();
        expect(screen.getByText(/Your location is unavailable/)).toHaveAttribute('class');
        vi.unstubAllGlobals();
    });
    it('selects ordinary delivery and resumes the pending add once without collecting a delivery address', async () => {
        const user = setup();
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await user.click(await screen.findByRole('radio', { name: 'Delivery' }));
        await user.click(await searchByPostcode(user));
        await waitFor(() =>
            expect(resumedAdd).toHaveBeenCalledExactlyOnceWith(intent, { ...selected, fulfillmentMode: 'delivery' })
        );
        expect(selectionAction).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
    it('cancels without submitting a selection or an add and restores focus to the originating button', async () => {
        const user = setup();
        const origin = screen.getByRole('button', { name: 'Add product' });
        await user.click(origin);
        await screen.findByRole('dialog');
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(resumedAdd).not.toHaveBeenCalled();
        expect(selectionAction).not.toHaveBeenCalled();
        expect(origin).toHaveFocus();
    });
    it('retains results and retries after selection failure without publishing the candidate', async () => {
        selectionAction.mockImplementationOnce(() => {
            return {
                success: false,
                code: 'STORE_SELECTION_FAILED',
            };
        });
        const user = setup(['pickup']);
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await screen.findByRole('textbox');
        await user.click(await searchByPostcode(user));
        expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(screen.getByRole('radio', { name: /A long grocery/ })).toBeEnabled();
        expect(resumedAdd).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(resumedAdd).toHaveBeenCalledTimes(1));
        expect(selectionAction).toHaveBeenCalledTimes(2);
    });
    it('recovers retry controls when middleware rejects selection before the action can echo its attempt', async () => {
        selectionAction.mockResolvedValueOnce({ success: false, code: 'STORE_CONTEXT_UNAVAILABLE' });
        const user = setup(['pickup']);
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await screen.findByRole('textbox');
        await user.click(await searchByPostcode(user));
        expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled();
        expect(resumedAdd).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(resumedAdd).toHaveBeenCalledTimes(1));
    });
    it('resumes once after read-only reconciliation of unknown native effects', async () => {
        selectionAction.mockResolvedValueOnce({
            success: false,
            effects: { storeSelection: 'unknown', nativeContext: 'unknown' },
        });
        selectionAction.mockImplementationOnce(async ({ request }: { request: Request }) => {
            const body = await request.formData();
            expect(body.get('intent')).toBe('reconcile');
            expect(body.has('storeId')).toBe(false);
            expect(body.has('fulfillmentMode')).toBe(false);
            return {
                success: true,
                selectedStoreInfo: selected,
                effects: { storeSelection: 'reconciled', nativeContext: 'reconciled' },
            };
        });
        const user = setup(['pickup']);
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await screen.findByRole('textbox');
        await user.click(await searchByPostcode(user));
        const retry = await screen.findByRole('button', { name: 'Try again' });
        const candidate = screen.getByRole('radio', { name: /A long grocery/ });
        expect(candidate).toHaveAttribute('aria-disabled', 'true');
        await user.click(candidate);
        expect(selectionAction).toHaveBeenCalledTimes(1);
        expect(resumedAdd).not.toHaveBeenCalled();
        await user.click(retry);
        await waitFor(() => expect(resumedAdd).toHaveBeenCalledExactlyOnceWith(intent, selected));
        expect(selectionAction).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('does not resume a cancelled intent after an in-flight selection completes', async () => {
        let complete: (() => void) | undefined;
        selectionAction.mockImplementationOnce(async () => {
            await new Promise<void>((resolve) => {
                complete = resolve;
            });
            return {
                success: true,
                selectedStoreInfo: selected,
                shoppingContext: null,
            };
        });
        const user = setup(['pickup']);
        await user.click(screen.getByRole('button', { name: 'Add product' }));
        await screen.findByRole('textbox');
        await user.click(await searchByPostcode(user));
        await waitFor(() => expect(complete).toBeDefined());
        await user.keyboard('{Escape}');
        complete?.();
        await screen.findByText(/Selected A long grocery/);
        expect(resumedAdd).not.toHaveBeenCalled();
        expect(selectionAction).toHaveBeenCalledTimes(1);
    });
});

describeStoreEntry('checkout shopping context (explicit selection/search action doubles)', () => {
    it('opens one shared chooser and cancels back to the Change button without a write', async () => {
        const user = setup(['pickup'], true);
        const change = await screen.findByRole('button', { name: 'Change shopping store: Current store · Collection' });
        await user.click(change);
        expect(await screen.findAllByRole('dialog')).toHaveLength(1);
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(change).toHaveFocus();
        expect(screen.getByText('Current store')).toBeVisible();
        expect(selectionAction).not.toHaveBeenCalled();
        expect(resumedAdd).not.toHaveBeenCalled();
    });
    it('retains committed context and usable search without replaying a basket-guard refusal', async () => {
        selectionAction.mockResolvedValue({
            success: false,
            code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
            error: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
        });
        const user = setup(['pickup'], true);
        const change = await screen.findByRole('button', { name: /Change shopping store/ });
        await user.click(change);
        await user.click(await searchByPostcode(user));
        expect(await screen.findByText(/Your current store and basket are unchanged/)).toBeVisible();
        expect(screen.getByRole('radio', { name: /A long grocery/ })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Find' })).toBeEnabled();
        const previousSearches = search.mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Find' }));
        await waitFor(() => expect(search).toHaveBeenCalledTimes(previousSearches + 1));
        expect(selectionAction).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Current store')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(change).toHaveFocus());
        expect(screen.getByText('Current store')).toBeVisible();
        expect(resumedAdd).not.toHaveBeenCalled();
    });
    it('publishes only the successful committed context and does not create an add intent', async () => {
        const user = setup(['pickup'], true);
        const change = await screen.findByRole('button', { name: /Change shopping store/ });
        await user.click(change);
        await user.click(await searchByPostcode(user));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Change shopping store: A long grocery/ })).toHaveFocus();
        expect(screen.queryByText('Current store')).not.toBeInTheDocument();
        expect(selectionAction).toHaveBeenCalledTimes(1);
        expect(resumedAdd).not.toHaveBeenCalled();
    });
});
