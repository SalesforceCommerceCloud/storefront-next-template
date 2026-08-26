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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { GroupedSwatchGroup } from '../grouped-swatch-group';

const meta: Meta<typeof GroupedSwatchGroup> = {
    title: 'Products/Grouped Swatch Group',
    component: GroupedSwatchGroup,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof GroupedSwatchGroup>;

// Values encode "Label, Family": the label shows on the swatch, the family drives the filter tabs.
const fabricValues = [
    { name: 'Slate, Linen', value: 'slate-linen', orderable: true },
    { name: 'Oat, Linen', value: 'oat-linen', orderable: true },
    { name: 'Navy, Velvet', value: 'navy-velvet', orderable: true, description: '+US$200' },
    { name: 'Emerald, Velvet', value: 'emerald-velvet', orderable: true, description: '+US$200' },
    { name: 'Cognac, Leather', value: 'cognac-leather', orderable: true, description: '+US$450' },
];

/** Categorized selector with family tabs (All / Linen / Velvet / Leather) above the swatches. */
export const Default: Story = {
    args: {
        label: 'Fabric',
        displayName: 'Slate',
        value: 'slate-linen',
        values: fabricValues,
        allLabel: 'All',
        handleChange: () => {},
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Fabric:')).toBeInTheDocument();
        // All families visible initially — assert on swatch-only labels ('Slate' also appears in the
        // header via displayName, so it isn't a reliable filter signal).
        await expect(canvas.getByText('Oat')).toBeInTheDocument();
        await expect(canvas.getByText('Navy')).toBeInTheDocument();

        // Filtering to a family hides the other families' swatches.
        await userEvent.click(canvas.getByRole('button', { name: 'Velvet' }));
        await expect(canvas.getByText('Navy')).toBeInTheDocument();
        await expect(canvas.queryByText('Oat')).not.toBeInTheDocument();
    },
};

/** No comma-encoded families — renders a flat swatch grid with no filter tabs. */
export const NoFamilies: Story = {
    args: {
        label: 'Leg Style',
        value: 'tapered',
        values: [
            { name: 'Tapered', value: 'tapered', orderable: true },
            { name: 'Block', value: 'block', orderable: true },
            { name: 'Hairpin', value: 'hairpin', orderable: false },
        ],
        handleChange: () => {},
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Tapered')).toBeInTheDocument();
        // No families ⇒ no filter-tab group.
        await expect(canvasElement.querySelector('[data-slot="swatch-family-filters"]')).toBeNull();
    },
};
