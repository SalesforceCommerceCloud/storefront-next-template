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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterestsPreferencesSection } from '@/extensions/customer-preferences/components/interests-preferences-section';
import type { CustomerPreferencesData } from '@/extensions/customer-preferences/lib/api/customer-preferences.server';

const mockFetcher = {
    state: 'idle' as const,
    data: undefined,
    submit: vi.fn(),
    load: vi.fn(),
    Form: vi.fn(),
};
vi.mock('react-router', async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        useFetcher: vi.fn(() => mockFetcher),
    };
});

const mockAddToast = vi.fn();
vi.mock('@/components/toast', () => ({
    useToast: vi.fn(() => ({ addToast: mockAddToast })),
}));

const initialData: CustomerPreferencesData = {
    availableInterests: [
        { id: 'minimalist', name: 'Minimalist', category: 'design_styles' },
        { id: 'living_room', name: 'Living Room', category: 'room_types' },
    ],
    interestCategories: [
        {
            id: 'design_styles',
            name: 'Design Styles',
            options: [{ id: 'minimalist', name: 'Minimalist', category: 'design_styles' }],
        },
        {
            id: 'room_types',
            name: 'Room Types',
            options: [{ id: 'living_room', name: 'Living Room', category: 'room_types' }],
        },
    ],
    customerInterests: { selectedInterestIds: ['minimalist'] },
    availablePreferences: [],
    customerPreferences: { preferences: {} },
};

async function openInterestsDialog() {
    render(<InterestsPreferencesSection initialData={initialData} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    const addMoreButton = await screen.findByTestId('interests-add-more-button');
    await user.click(addMoreButton);

    return within(document.body).findByRole('dialog');
}

describe('InterestsPreferencesSection - interest category tabs', () => {
    test('exposes tablist/tab/tabpanel roles with the first category selected', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);

        expect(dialogScope.getByRole('tablist')).toBeInTheDocument();

        const designStylesTab = dialogScope.getByRole('tab', { name: 'Design Styles' });
        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        expect(designStylesTab).toHaveAttribute('aria-selected', 'true');
        expect(roomTypesTab).toHaveAttribute('aria-selected', 'false');

        const tabpanel = dialogScope.getByRole('tabpanel');
        expect(tabpanel).toHaveAttribute('aria-labelledby', designStylesTab.id);
        expect(within(tabpanel).getByText('Minimalist')).toBeInTheDocument();
    });

    test('switching tabs updates aria-selected and the tabpanel contents', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);
        const user = userEvent.setup();

        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        await user.click(roomTypesTab);

        expect(roomTypesTab).toHaveAttribute('aria-selected', 'true');
        expect(dialogScope.getByRole('tab', { name: 'Design Styles' })).toHaveAttribute('aria-selected', 'false');

        const tabpanel = dialogScope.getByRole('tabpanel');
        expect(tabpanel).toHaveAttribute('aria-labelledby', roomTypesTab.id);
        expect(within(tabpanel).getByText('Living Room')).toBeInTheDocument();
    });

    test('only the active tab is in the tab order (roving tabIndex)', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);

        expect(dialogScope.getByRole('tab', { name: 'Design Styles' })).toHaveAttribute('tabIndex', '0');
        expect(dialogScope.getByRole('tab', { name: 'Room Types' })).toHaveAttribute('tabIndex', '-1');
    });

    test('ArrowRight moves selection and focus to the next tab', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);
        const user = userEvent.setup();

        const designStylesTab = dialogScope.getByRole('tab', { name: 'Design Styles' });
        designStylesTab.focus();
        await user.keyboard('{ArrowRight}');

        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        expect(roomTypesTab).toHaveAttribute('aria-selected', 'true');
        expect(roomTypesTab).toHaveFocus();
    });

    test('ArrowLeft from the first tab wraps focus and selection to the last tab', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);
        const user = userEvent.setup();

        const designStylesTab = dialogScope.getByRole('tab', { name: 'Design Styles' });
        designStylesTab.focus();
        await user.keyboard('{ArrowLeft}');

        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        expect(roomTypesTab).toHaveAttribute('aria-selected', 'true');
        expect(roomTypesTab).toHaveFocus();
    });

    test('End moves focus and selection to the last tab', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);
        const user = userEvent.setup();

        const designStylesTab = dialogScope.getByRole('tab', { name: 'Design Styles' });
        designStylesTab.focus();
        await user.keyboard('{End}');

        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        expect(roomTypesTab).toHaveAttribute('aria-selected', 'true');
        expect(roomTypesTab).toHaveFocus();
    });

    test('Home moves focus and selection back to the first tab', async () => {
        const dialog = await openInterestsDialog();
        const dialogScope = within(dialog);
        const user = userEvent.setup();

        const roomTypesTab = dialogScope.getByRole('tab', { name: 'Room Types' });
        roomTypesTab.focus();
        await user.keyboard('{Home}');

        const designStylesTab = dialogScope.getByRole('tab', { name: 'Design Styles' });
        expect(designStylesTab).toHaveAttribute('aria-selected', 'true');
        expect(designStylesTab).toHaveFocus();
    });
});
