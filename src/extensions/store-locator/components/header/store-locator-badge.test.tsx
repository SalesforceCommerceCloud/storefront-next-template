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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

const openStoreLocator = vi.fn();
const openSelectedStoreLocator = vi.fn();
const storeLocatorState = {
    selectedStoreInfo: null as { id: string; name: string; postalCode?: string; distance?: number } | null,
    isOpen: false,
    open: openStoreLocator,
    openSelectedStore: openSelectedStoreLocator,
    config: { radiusUnit: 'mi' as const },
};

vi.mock('@/extensions/store-locator/providers/store-locator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/extensions/store-locator/providers/store-locator')>();
    return {
        ...actual,
        useStoreLocator: (selector: (state: typeof storeLocatorState) => unknown) => selector(storeLocatorState),
    };
});

import StoreLocatorBadge from './store-locator-badge';

describe('Fashion StoreLocatorBadge', () => {
    beforeEach(() => {
        storeLocatorState.selectedStoreInfo = null;
        storeLocatorState.isOpen = false;
        openStoreLocator.mockClear();
        openSelectedStoreLocator.mockClear();
    });

    test('includes the truncated visible store label in the accessible name', () => {
        storeLocatorState.selectedStoreInfo = {
            id: 'store-1',
            name: 'Burlington Retail Store With A Very Long Name',
            postalCode: '01803',
            distance: 0,
        };

        render(
            <AllProvidersWrapper>
                <StoreLocatorBadge />
            </AllProvidersWrapper>
        );

        const trigger = screen.getByRole('button', {
            name: 'Change your store: Burlington Retail Store... · 0.00 mi, 01803',
        });
        expect(trigger).toHaveTextContent('Burlington Retail Store... · 0.00 mi');
        expect(trigger).not.toHaveTextContent('Burlington Retail Store With A Very Long Name');
        expect(trigger).toHaveTextContent('01803');
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    test('reports the sheet as expanded while it is open', () => {
        storeLocatorState.isOpen = true;

        render(
            <AllProvidersWrapper>
                <StoreLocatorBadge />
            </AllProvidersWrapper>
        );

        expect(screen.getByRole('button', { name: 'Choose your store' })).toHaveAttribute('aria-expanded', 'true');
    });
});
