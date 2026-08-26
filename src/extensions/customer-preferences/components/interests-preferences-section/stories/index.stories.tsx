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
/** @sfdc-extension-file SFDC_EXT_CUSTOMER_PREFERENCES */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { action } from 'storybook/actions';
import { allModes } from '../../../../../../.storybook/modes';
import { InterestsPreferencesSection, InterestsPreferencesSectionSkeleton } from '../index';
import type { CustomerPreferencesData } from '@/extensions/customer-preferences/lib/api/customer-preferences.server';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const element = target.closest('button, a, input, select, [role="button"]');

            if (element) {
                const label =
                    element.textContent?.trim() || element.getAttribute('aria-label') || element.tagName.toLowerCase();
                logClick({ type: 'click', element: element.tagName.toLowerCase(), label });
            }
        };

        root.addEventListener('click', handleClick);

        return () => {
            root.removeEventListener('click', handleClick);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const initialData: CustomerPreferencesData = {
    availableInterests: [
        { id: 'minimalist', name: 'Minimalist', category: 'design_styles' },
        { id: 'geometric', name: 'Geometric', category: 'design_styles' },
        { id: 'living_room', name: 'Living Room', category: 'room_types' },
        { id: 'wood', name: 'Wood', category: 'materials' },
        { id: 'modern', name: 'Modern', category: 'aesthetics' },
    ],
    interestCategories: [
        {
            id: 'design_styles',
            name: 'Design Styles',
            options: [
                { id: 'minimalist', name: 'Minimalist', category: 'design_styles' },
                { id: 'geometric', name: 'Geometric', category: 'design_styles' },
            ],
        },
        {
            id: 'room_types',
            name: 'Room Types',
            options: [{ id: 'living_room', name: 'Living Room', category: 'room_types' }],
        },
        {
            id: 'materials',
            name: 'Materials',
            options: [{ id: 'wood', name: 'Wood', category: 'materials' }],
        },
        {
            id: 'aesthetics',
            name: 'Aesthetics',
            options: [{ id: 'modern', name: 'Modern', category: 'aesthetics' }],
        },
    ],
    customerInterests: { selectedInterestIds: ['minimalist', 'wood'] },
    availablePreferences: [
        {
            id: 'product_categories',
            name: 'Product Categories',
            type: 'multi-select',
            options: [
                { value: 'minimalist', label: 'Minimalist' },
                { value: 'modern', label: 'Modern' },
            ],
        },
        {
            id: 'shopping_preferences',
            name: 'Shopping Preferences',
            type: 'button-group',
            options: [
                { value: 'womens', label: "Women's" },
                { value: 'mens', label: "Men's" },
                { value: 'unisex', label: 'Unisex' },
            ],
        },
        {
            id: 'measures',
            name: 'Measures',
            type: 'text-group',
            fields: [
                { id: 'room_width', label: 'Room Width (inches)', placeholder: 'e.g., 120', width: 'half' },
                { id: 'room_length', label: 'Room Length (inches)', placeholder: 'e.g., 180', width: 'half' },
            ],
        },
        {
            id: 'size_preference',
            name: 'Preferred Product Size',
            type: 'select',
            options: [
                { value: 'no_preference', label: 'No preference' },
                { value: 'small', label: 'Small (S)' },
                { value: 'medium', label: 'Medium (M)' },
            ],
        },
    ],
    customerPreferences: {
        preferences: {
            product_categories: [],
            shopping_preferences: '',
            measures: { room_width: '', room_length: '' },
            size_preference: 'no_preference',
        },
    },
};

const meta: Meta<typeof InterestsPreferencesSection> = {
    title: 'Extensions/Customer Preferences/Interests & Preferences',
    component: InterestsPreferencesSection,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Combined Interests & Preferences section rendered on the account details page. Reads its initial state from the route loader and submits updates via a `useFetcher`. This story passes `initialData` directly — no provider wiring required.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    decorators: [
        (Story) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof InterestsPreferencesSection>;

export const Default: Story = {
    args: { initialData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('heading', { level: 2, name: 'Interests & Preferences' })).toBeInTheDocument();
        await expect(
            canvas.getByText('Add your design interests and manage your shopping preferences')
        ).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    },
};

export const EditMode: Story = {
    args: { initialData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editButton = canvas.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        await expect(canvas.getByRole('button', { name: /save/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    },
};

export const CancelEdit: Story = {
    args: { initialData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editButton = canvas.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        const cancelButton = canvas.getByRole('button', { name: /cancel/i });
        await userEvent.click(cancelButton);

        await expect(canvas.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    },
};

export const SelectShoppingPreference: Story = {
    args: { initialData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editButton = canvas.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        const womensButton = canvas.getByRole('button', { name: /women's/i });
        await userEvent.click(womensButton);
        await expect(womensButton).toHaveClass('bg-foreground');
    },
};

export const OpenInterestsDialog: Story = {
    args: { initialData },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editButton = canvas.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        const addMoreButton = await canvas.findByTestId('interests-add-more-button', {}, { timeout: 5000 });
        await userEvent.click(addMoreButton);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', {}, { timeout: 5000 });
        await expect(dialog).toBeInTheDocument();
    },
};

export const Skeleton: Story = {
    render: () => <InterestsPreferencesSectionSkeleton />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const skeletons = canvasElement.querySelectorAll('.animate-pulse');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};
