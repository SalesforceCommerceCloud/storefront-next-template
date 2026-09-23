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

import type { Page } from '@playwright/test';

/**
 * Returns the PDP cart action for the product's current state.
 *
 * Product sets and bundles expose a parent action in addition to child actions.
 * Once an inline cart control has added an item, its increment control replaces
 * the standard Add to Cart button.
 */
export async function getCartActionButton(page: Pick<Page, 'locator'>) {
    const parentCartActionButton = page.locator('[data-testid="parent-add-to-cart"]').first();
    if ((await parentCartActionButton.count()) > 0) {
        return parentCartActionButton;
    }

    const inlineCartStepperIncrement = page.locator('[data-testid="inline-add-to-cart-increment"]').first();
    if ((await inlineCartStepperIncrement.count()) > 0) {
        return inlineCartStepperIncrement;
    }

    return page.locator('[data-testid="add-to-cart"]').first();
}
