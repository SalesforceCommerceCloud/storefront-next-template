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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const { t } = getTranslation();

// Mock the lazy-loaded store locator sheet
vi.mock('@/extensions/store-locator/components/header/store-locator-sheet', () => ({
    default: ({
        children,
        open,
        onOpenChange,
    }: {
        children: any;
        open: boolean;
        onOpenChange: (open: boolean) => void;
    }) => (
        <div data-testid="mock-store-locator-sheet" data-open={open}>
            {children}
            <button onClick={() => onOpenChange(false)}>Mock Close</button>
        </div>
    ),
}));

import StoreLocatorBadge from './store-locator-badge';

describe('StoreLocatorBadge', () => {
    test('renders initial trigger button', () => {
        render(
            <AllProvidersWrapper>
                <StoreLocatorBadge />
            </AllProvidersWrapper>
        );

        expect(
            screen.getByRole('button', { name: t('extStoreLocator:storeLocator.trigger.ariaLabel') })
        ).toBeInTheDocument();

        expect(
            screen.queryByRole('button', { name: t('extStoreLocator:storeLocator.trigger.openAriaLabel') })
        ).not.toBeInTheDocument();
    });

    test('shows open button and sheet after clicking trigger', async () => {
        render(
            <AllProvidersWrapper>
                <StoreLocatorBadge />
            </AllProvidersWrapper>
        );

        await userEvent.click(
            screen.getByRole('button', { name: t('extStoreLocator:storeLocator.trigger.ariaLabel') })
        );

        const openBtn = await screen.findByRole('button', {
            name: t('extStoreLocator:storeLocator.trigger.openAriaLabel'),
        });

        expect(openBtn).toBeInTheDocument();
        const sheet = screen.getByTestId('mock-store-locator-sheet');
        expect(sheet).toBeInTheDocument();
        expect(sheet).toHaveAttribute('data-open', 'true');
    });
});
