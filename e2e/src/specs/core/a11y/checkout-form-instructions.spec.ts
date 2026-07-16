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

/**
 * Checkout form-instruction regression (WCAG 3.3.2 Labels or Instructions).
 *
 * Pins that the phone-format instruction on Contact Info is BOTH visible (a
 * FormDescription rendered alongside the input) AND programmatically linked to
 * the input via aria-describedby, so screen readers announce it when focus lands.
 *
 * Placeholder text alone does not satisfy WCAG 3.3.2 because it disappears on
 * type and is unreliable for AT users.
 */

Feature('Checkout Form Instructions').tag('@core').tag('@a11y').tag('@checkout').tag('@form-instructions');

const { checkoutPage, apiCartSetupFlow, I } = inject();
import { expect } from 'chai';
import { TEST_PRODUCT_CATEGORIES } from '../../../test-data/checkout.data';
import { installLoginPrefsStubHooks } from '../../../utils/login-prefs-stub';

installLoginPrefsStubHooks();

Scenario('Phone field exposes a persistent format instruction linked via aria-describedby', async () => {
    await apiCartSetupFlow.executeAndNavigateToCheckout(TEST_PRODUCT_CATEGORIES.MENS_JACKETS);
    checkoutPage.validatePageLoaded();

    // Locate the phone input by its stable attributes (name + autocomplete) so this test
    // does not depend on translated visible strings.
    const wiring = await (I.usePlaywrightTo('inspect phone field aria wiring', async ({ page }) => {
        return page.evaluate(() => {
            const input = document.querySelector<HTMLInputElement>('input[name="phone"][autocomplete="tel-national"]');
            if (!input) return { found: false } as const;
            const describedBy = input.getAttribute('aria-describedby');
            const ids = describedBy ? describedBy.split(/\s+/).filter(Boolean) : [];
            const referencedTexts = ids
                .map((id) => document.getElementById(id))
                .filter((el): el is HTMLElement => Boolean(el))
                .map((el) => el.textContent?.trim() ?? '');
            const descriptionEl = input
                .closest('[data-slot="form-item"]')
                ?.querySelector('[data-slot="form-description"]');
            return {
                found: true,
                describedBy,
                ids,
                referencedTexts,
                descriptionText: descriptionEl?.textContent?.trim() ?? '',
                descriptionId: descriptionEl?.id ?? '',
            } as const;
        });
    }) as unknown as Promise<{
        found: boolean;
        describedBy?: string | null;
        ids?: string[];
        referencedTexts?: string[];
        descriptionText?: string;
        descriptionId?: string;
    }>);

    expect(wiring.found, 'phone input should be present on the Checkout page').to.equal(true);
    expect(
        wiring.descriptionText,
        'a persistent FormDescription with format instructions should be rendered next to the phone field (WCAG 3.3.2)'
    ).to.match(/./);
    expect(
        wiring.describedBy,
        'phone input must set aria-describedby so screen readers announce the format instruction (WCAG 3.3.2)'
    )
        .to.be.a('string')
        .and.not.equal('');
    expect(
        wiring.ids ?? [],
        `aria-describedby="${wiring.describedBy}" must include the FormDescription id "${wiring.descriptionId}" so the description is programmatically linked to the field`
    ).to.include(wiring.descriptionId ?? '');
})
    .config({ retries: 0 })
    .tag('@wcag-3.3.2')
    .tag('@guest-checkout');
