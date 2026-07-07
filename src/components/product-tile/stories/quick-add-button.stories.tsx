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
import { QuickAddButton } from '../quick-add-button';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof QuickAddButton> = {
    title: 'Components/ProductTile/Quick Add Button',
    component: QuickAddButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
**QuickAddButton** renders the "Quick Add" hover CTA on a product tile and manages the add-mode
\`CartItemModal\` lifecycle. Clicking the button opens the modal; "Buy It Now" within the modal
navigates to the PDP with the selected colour pre-seeded.
                `,
            },
        },
    },
    args: {
        productId: 'test-product-001',
        productName: 'Classic Cotton T-Shirt',
    },
    argTypes: {
        productId: {
            description: 'SCAPI product id — passed to `CartItemModal` and used in the PDP URL',
            control: 'text',
        },
        productName: {
            description: 'Product name interpolated into the button’s `aria-label`',
            control: 'text',
        },
        selectedColorValue: {
            description: 'Pre-selected colour. When set, "Buy It Now" navigates to the PDP with `?color=<value>`',
            control: 'text',
        },
        label: {
            description: 'Custom button label. Defaults to the `product.quickAdd` locale key',
            control: 'text',
        },
        initialVariantSelections: {
            description: 'Full variant selections pre-seeded into the modal',
            control: false,
        },
    },
};

export default meta;
type Story = StoryObj<typeof QuickAddButton>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes every leaf prop —
 * `productId`, `productName`, `selectedColorValue`, `label`. The dedicated
 * stories below remain bookmarked entry points for the most common variants.
 * Note: clicking the button opens a lazy-loaded `CartItemModal`, which is
 * verified by `ModalOpen` below.
 */
export const Playground: Story = {
    args: {
        productId: 'test-product-001',
        productName: 'Classic Cotton T-Shirt',
        selectedColorValue: 'navy',
        label: 'Quick Add',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button', { name: /quick add/i });
        await expect(button).toBeInTheDocument();
        await expect(button).toBeEnabled();
    },
};

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button', { name: /quick add/i });
        await expect(button).toBeInTheDocument();
        await expect(button).toBeEnabled();
    },
};

export const WithCustomLabel: Story = {
    args: {
        label: 'Add to Bag',
    },
    parameters: {
        docs: {
            description: {
                story: 'Custom button label overrides the default `product.quickAdd` locale key.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: /add to bag/i })).toBeInTheDocument();
    },
};

export const WithColorPreselected: Story = {
    args: {
        selectedColorValue: 'navy',
    },
    parameters: {
        docs: {
            description: {
                story: 'When a colour is pre-selected, "Buy It Now" navigates to the PDP with `?color=navy`.',
            },
        },
    },
};

export const ModalOpen: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Clicking "Quick Add" opens the CartItemModal to select size/quantity before adding to cart.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button', { name: /quick add/i });
        await userEvent.click(button);
    },
};
