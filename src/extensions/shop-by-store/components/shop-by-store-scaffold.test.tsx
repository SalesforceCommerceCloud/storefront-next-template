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
import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShopByStoreScaffold from './shop-by-store-scaffold';
import { ShopByStoreSelectorPanel } from './shop-by-store-sheet';
import { SHOP_BY_STORE_FIXTURES } from './shop-by-store-fixtures';

describe('ShopByStoreSelectorPanel', () => {
    test('associates each fixture store description with its radio control', () => {
        render(<ShopByStoreSelectorPanel state="results" />);

        const store = screen.getByRole('radio', { name: /central market/i });
        const address = screen.getByText('100 Market Street, City Center');
        const distance = screen.getByText('0.6 mi away');

        expect(store).toHaveAttribute('aria-describedby', `${address.id} ${distance.id}`);
    });

    test('reports the selected fixture store without making a request', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        try {
            render(<ShopByStoreSelectorPanel state="results" onSelect={onSelect} />);

            await user.click(screen.getByRole('radio', { name: /riverside store/i }));

            expect(onSelect).toHaveBeenCalledWith(SHOP_BY_STORE_FIXTURES[1]);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test('identifies retryable selection errors', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();

        render(<ShopByStoreSelectorPanel state="selection-error" onRetry={onRetry} />);

        expect(screen.getByRole('alert')).toHaveTextContent('We could not choose that store');
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});

describe('ShopByStoreScaffold', () => {
    test('selects a fixture store from the sheet and updates only local UI state', async () => {
        const user = userEvent.setup();
        render(<ShopByStoreScaffold />);

        await user.click(screen.getByRole('button', { name: 'Choose a store' }));

        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('radio', { name: /central market/i }));

        expect(screen.getByRole('button', { name: /current store: central market/i })).toBeInTheDocument();
        expect(screen.queryByText('Browse with a store selected for this preview.')).not.toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
