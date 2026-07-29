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
/** @sfdc-extension-file SFDC_EXT_PRODUCT_CONTENT */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import ProductAdapterSection from '..';
import CollapsibleSection from '@/components/collapsible-section';

const meta: Meta<typeof ProductAdapterSection> = {
    title: 'Extensions/Product Content/Product Adapter Section',
    component: ProductAdapterSection,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof ProductAdapterSection>;

/** Materials section — bulleted-list content. */
export const Materials: Story = {
    render: (args) => (
        <CollapsibleSection label="Materials" defaultOpen>
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            html: '<ul><li>High-density composite resin</li><li>UV-resistant matte coating</li></ul>',
            contentType: 'bulleted-list',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Materials')).toBeInTheDocument();
        await expect(canvas.getByText('High-density composite resin')).toBeInTheDocument();
    },
};

/** Usage Instructions section — bulleted-list content. */
export const UsageInstructions: Story = {
    render: (args) => (
        <CollapsibleSection label="Usage Instructions" defaultOpen>
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            html: '<ul><li>Place on any flat, stable surface</li><li>Position near natural light for best effect</li></ul>',
            contentType: 'bulleted-list',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Usage Instructions')).toBeInTheDocument();
        await expect(canvas.getByText(/Place on any flat, stable surface/i)).toBeInTheDocument();
    },
};

/** Care Instructions section — bulleted-list content. */
export const CareInstructions: Story = {
    render: (args) => (
        <CollapsibleSection label="Care Instructions" defaultOpen>
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            html: '<ul><li>Hand wash cold</li><li>Hang dry</li></ul>',
            contentType: 'bulleted-list',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Care Instructions')).toBeInTheDocument();
        await expect(canvas.getByText('Hand wash cold')).toBeInTheDocument();
    },
};

/** Specifications section — two-column table content. */
export const Specifications: Story = {
    render: (args) => (
        <CollapsibleSection label="Specifications" defaultOpen>
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            html: '<table style="border: none;"><tr style="border: none;"><td>Material:</td><td>Premium composite</td></tr></table>',
            contentType: 'table-2-column',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Specifications')).toBeInTheDocument();
        await expect(canvas.getByText('Premium composite')).toBeInTheDocument();
    },
};

/** Fallback state — content is null, "Content coming soon." renders. */
export const ContentComingSoon: Story = {
    render: (args) => (
        <CollapsibleSection label="Materials" defaultOpen>
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: null,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Materials')).toBeInTheDocument();
        await expect(canvas.getByText('Content coming soon.')).toBeInTheDocument();
    },
};

/** Collapsed by default — shell label visible, body hidden until expanded. */
export const CollapsedByDefault: Story = {
    render: (args) => (
        <CollapsibleSection label="Materials">
            <ProductAdapterSection {...args} />
        </CollapsibleSection>
    ),
    args: {
        content: {
            html: '<ul><li>High-density composite resin</li></ul>',
            contentType: 'bulleted-list',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Materials')).toBeInTheDocument();
        const details = canvasElement.querySelector('details');
        await expect(details).not.toHaveAttribute('open');
    },
};
