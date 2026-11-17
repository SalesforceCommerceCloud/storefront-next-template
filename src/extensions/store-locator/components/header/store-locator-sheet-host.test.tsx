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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const closeStoreLocator = vi.fn();
let isOpen = false;

vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: (selector: (state: { isOpen: boolean; close: typeof closeStoreLocator }) => unknown) =>
        selector({ isOpen, close: closeStoreLocator }),
}));

vi.mock('@/extensions/store-locator/components/header/store-locator-sheet', () => ({
    default: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
        <div data-testid="store-locator-sheet-host" data-open={open}>
            <button onClick={() => onOpenChange(false)}>Close</button>
        </div>
    ),
}));

import StoreLocatorSheetHost from './store-locator-sheet-host';

describe('StoreLocatorSheetHost', () => {
    beforeEach(() => {
        isOpen = false;
        closeStoreLocator.mockClear();
    });

    test('mounts the single shared sheet only while the locator is open', async () => {
        const { rerender } = render(<StoreLocatorSheetHost />);
        expect(screen.queryByTestId('store-locator-sheet-host')).not.toBeInTheDocument();

        isOpen = true;
        rerender(<StoreLocatorSheetHost />);
        expect(await screen.findByTestId('store-locator-sheet-host')).toHaveAttribute('data-open', 'true');
    });

    test('closes the shared state when the sheet requests dismissal', async () => {
        isOpen = true;
        render(<StoreLocatorSheetHost />);

        await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
        expect(closeStoreLocator).toHaveBeenCalledOnce();
    });
});
