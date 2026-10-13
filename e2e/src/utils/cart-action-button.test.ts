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

import { describe, expect, it, vi } from 'vitest';
import { getCartActionButton } from './cart-action-button';

type LocatorMock = {
    count: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
};

function createPageWithTestIds(testIds: string[]) {
    const locators = new Map<string, LocatorMock>();
    const locator = vi.fn((selector: string) => {
        let locatorMock = locators.get(selector);
        if (!locatorMock) {
            const testId = selector.match(/"([^"]+)"/)?.[1] ?? '';
            locatorMock = {
                count: vi.fn().mockResolvedValue(testIds.includes(testId) ? 1 : 0),
                first: vi.fn(),
            };
            locatorMock.first.mockReturnValue(locatorMock);
            locators.set(selector, locatorMock);
        }
        return locatorMock;
    });

    return { page: { locator }, locator };
}

describe('getCartActionButton', () => {
    it('selects the initial Add to Cart button before an inline cart has an item', async () => {
        const { page, locator } = createPageWithTestIds(['inline-add-to-cart', 'add-to-cart']);

        const button = await getCartActionButton(page as never);

        expect(button).toBe(locator('[data-testid="add-to-cart"]'));
    });

    it('selects the stepper increment after an item is already in cart', async () => {
        const { page, locator } = createPageWithTestIds(['inline-add-to-cart', 'inline-add-to-cart-increment']);

        const button = await getCartActionButton(page as never);

        expect(button).toBe(locator('[data-testid="inline-add-to-cart-increment"]'));
    });

    it.each(['set', 'bundle'])('selects the parent %s action instead of a child add action', async () => {
        const { page, locator } = createPageWithTestIds(['parent-add-to-cart', 'add-to-cart']);

        const button = await getCartActionButton(page as never);

        expect(button).toBe(locator('[data-testid="parent-add-to-cart"]'));
    });
});
