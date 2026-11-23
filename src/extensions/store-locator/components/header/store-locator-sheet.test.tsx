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
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

const { t } = getTranslation();
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocatorApi: () => ({ getState: () => ({}), setState: vi.fn() }),
}));

// Mock the heavy StoreLocator to a simple placeholder
vi.mock('@/extensions/store-locator/components/store-locator', () => ({
    default: () => <div data-testid="mock-store-locator">Mock StoreLocator</div>,
}));

import StoreLocatorSheet from '@/extensions/store-locator/components/header/store-locator-sheet';

// Test wrapper that manages controlled state
function TestWrapper({ initialOpen = true }: { initialOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(initialOpen);

    return (
        <StoreLocatorSheet open={isOpen} onOpenChange={setIsOpen}>
            <button>Open Sheet</button>
        </StoreLocatorSheet>
    );
}

describe('StoreLocatorSheet', () => {
    test('renders title, description, and content when open', () => {
        render(<TestWrapper initialOpen={true} />);

        expect(screen.getByText(t('extStoreLocator:storeLocator.title'))).toBeInTheDocument();
        expect(screen.getByText(t('extStoreLocator:storeLocator.description'))).toBeInTheDocument();
        expect(screen.getByTestId('mock-store-locator')).toBeInTheDocument();
        // Close control is available while open
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    test('closes via Close button and re-opens via optional trigger', async () => {
        render(<TestWrapper initialOpen={true} />);

        expect(screen.getByText(t('extStoreLocator:storeLocator.title'))).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /close/i }));

        await waitFor(() => {
            expect(screen.queryByText(t('extStoreLocator:storeLocator.title'))).not.toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole('button', { name: 'Open Sheet' }));

        expect(await screen.findByText(t('extStoreLocator:storeLocator.title'))).toBeInTheDocument();
    });

    test('starts closed when initialOpen is false', () => {
        render(<TestWrapper initialOpen={false} />);

        expect(screen.queryByText(t('extStoreLocator:storeLocator.title'))).not.toBeInTheDocument();
        expect(screen.queryByTestId('mock-store-locator')).not.toBeInTheDocument();
    });
});
