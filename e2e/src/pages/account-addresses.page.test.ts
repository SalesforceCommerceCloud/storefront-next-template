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

const refreshPage = vi.fn();
const waitForElement = vi.fn();
const grabNumberOfVisibleElements = vi.fn();

vi.stubGlobal('inject', () => ({
    I: {
        refreshPage,
        waitForElement,
        grabNumberOfVisibleElements,
    },
}));

vi.stubGlobal('locate', (selector: string) => {
    const locator = {
        as: () => locator,
        at: () => locator,
        find: () => locator,
        first: () => locator,
        withText: () => locator,
        toString: () => selector,
    };
    return locator;
});

describe('AccountAddressesPage', () => {
    test('refreshes until a newly created address is returned by the customer read', async () => {
        waitForElement.mockRejectedValueOnce(new Error('Address has not propagated')).mockResolvedValueOnce(undefined);

        const accountAddressesPage = (await import('./account-addresses.page')).default;

        await expect(accountAddressesPage.pollUntilAddressWithName('John Doe', 3)).resolves.toBe(true);

        expect(refreshPage).toHaveBeenCalledTimes(1);
        expect(waitForElement).toHaveBeenCalledTimes(2);
    });
});
