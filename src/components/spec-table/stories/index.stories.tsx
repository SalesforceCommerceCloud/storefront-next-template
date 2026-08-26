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
import SpecTable from '..';
import CollapsibleSection from '@/components/collapsible-section';

const meta: Meta<typeof SpecTable> = {
    title: 'Products/Spec Table',
    component: SpecTable,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof SpecTable>;

/** Dimensions with a metric/imperial switch — toggling flips only the value column. */
export const Switchable: Story = {
    render: (args) => (
        <CollapsibleSection label="Dimensions" defaultOpen>
            <SpecTable {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            contentType: 'spec-table',
            rows: [
                { label: 'Width', values: { imperial: '84 in', metric: '213 cm' } },
                { label: 'Depth', values: { imperial: '38 in', metric: '97 cm' } },
                { label: 'Height', values: { imperial: '34 in', metric: '86 cm' } },
                { label: 'Weight', values: { imperial: '96 lbs', metric: '44 kg' } },
            ],
            views: [
                { id: 'imperial', label: 'Imperial' },
                { id: 'metric', label: 'Metric' },
            ],
            defaultViewId: 'imperial',
            viewSwitchLabel: 'Units',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('84 in')).toBeInTheDocument();
        await userEvent.click(canvas.getByRole('radio', { name: 'Metric' }));
        await expect(canvas.getByText('213 cm')).toBeInTheDocument();
        await expect(canvas.queryByText('84 in')).not.toBeInTheDocument();
    },
};

/** No alternate views — renders a plain 2-column table with no switch. */
export const SingleView: Story = {
    render: (args) => (
        <CollapsibleSection label="Materials" defaultOpen>
            <SpecTable {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            contentType: 'spec-table',
            rows: [
                { label: 'Frame', values: { default: 'Kiln-dried hardwood' } },
                { label: 'Upholstery', values: { default: 'Performance linen' } },
            ],
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Kiln-dried hardwood')).toBeInTheDocument();
        await expect(canvasElement.querySelector('[data-slot="spec-table-unit-toggle"]')).not.toBeInTheDocument();
    },
};
