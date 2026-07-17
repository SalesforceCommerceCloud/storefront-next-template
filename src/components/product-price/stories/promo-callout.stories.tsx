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
import PromoCallout from '../promo-callout';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof PromoCallout> = {
    title: 'Products/Product Price/Promo Callout',
    component: PromoCallout,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        className: { description: 'Additional classes for the wrapper div', control: 'text' },
    },
    decorators: [
        (Story) => (
            <div className="p-4 border border-dashed">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof PromoCallout>;

const mockProductWithPromo = {
    productPromotions: [
        {
            calloutMsg: 'Buy one get one 50% off',
            promotionId: 'bogo-50',
        },
    ],
    price: 100,
} as any;

const mockProductWithHtmlPromo = {
    productPromotions: [
        {
            calloutMsg: '<strong>Flash Sale!</strong> 20% off',
            promotionId: 'flash-sale',
        },
    ],
    price: 100,
} as any;

/**
 * At-rest state — plain-text callout message renders inside a styled
 * `<span>`. Drive className from the Controls panel to verify wrapper
 * styling overrides.
 */
export const Default: Story = {
    args: {
        product: mockProductWithPromo,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Buy one get one 50% off')).toBeInTheDocument();
    },
};

/**
 * HTML callout — `calloutMsg` contains HTML markup which is rendered via
 * `dangerouslySetInnerHTML`. Distinct DOM (nested `<strong>` element)
 * vs Default's flat text node, kept dedicated.
 */
export const HtmlContent: Story = {
    args: {
        product: mockProductWithHtmlPromo,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Flash Sale!')).toBeInTheDocument();
        await expect(canvas.getByText('20% off')).toBeInTheDocument();
    },
};
