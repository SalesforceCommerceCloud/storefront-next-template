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
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import PickupPreferences from '.';

// Mock useToast (save success announcement is not under test here).
vi.mock('@/components/toast', () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

/**
 * Each pickup-preference row pairs a visible <Label> with a <Switch>. The switch must be
 * programmatically linked to that visible label via htmlFor/id, not a redundant aria-label
 * that duplicates the visible text. This locks W-23325529 (form field has a visible label)
 * and W-23325756 (form field is linked to its label in code) on the Store Preferences page,
 * which is auth-gated and so cannot be reached by the page-level axe scan.
 */
describe('PickupPreferences label association (a11y)', () => {
    const labels = ['Auto-select preferred store', 'Pickup notifications', 'Store events & promotions'];

    test.each(labels)('switch for "%s" is reachable by its visible label', (labelText) => {
        render(<PickupPreferences />);

        // getByRole switch + accessible name resolves ONLY if the visible <Label htmlFor>
        // is programmatically bound to the <Switch id>. A bare aria-label would also satisfy
        // the name, so we additionally assert the visible label element is the source below.
        const control = screen.getByRole('switch', { name: labelText });
        expect(control).toBeInTheDocument();
        expect(control).toHaveAttribute('id');

        const visibleLabel = screen.getByText(labelText);
        expect(visibleLabel).toHaveAttribute('for', control.getAttribute('id'));
    });

    test('switches carry no redundant aria-label duplicating the visible label', () => {
        render(<PickupPreferences />);

        for (const labelText of labels) {
            const control = screen.getByRole('switch', { name: labelText });
            // The accessible name must come from the linked <Label>, not a duplicate aria-label.
            expect(control).not.toHaveAttribute('aria-label');
        }
    });
});
