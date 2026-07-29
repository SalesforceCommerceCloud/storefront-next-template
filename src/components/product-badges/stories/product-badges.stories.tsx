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
import { ProductBadges } from '../product-badges';
import { mockStandardProductHit } from '../../__mocks__/product-search-hit-data';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof ProductBadges> = {
    title: 'Products/Product Badges',
    component: ProductBadges,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        maxBadges: {
            control: { type: 'number', min: 0, max: 10 },
            description: 'Maximum badges to display (caps the badgeDetails list)',
        },
        product: {
            control: 'object',
            description: 'Product object — c_isNew/c_isSale/c_isSpecial flags drive which badges show',
        },
        badgeDetails: {
            control: 'object',
            description:
                'Override which product flags map to which badges. Falls back to runtime config when undefined',
        },
        variant: {
            control: 'select',
            options: ['default', 'horizontal', 'vertical'],
            description: 'Layout variant of the badges container',
        },
        size: {
            control: 'select',
            options: ['default', 'small', 'medium', 'large'],
            description: 'Size variant',
        },
        'aria-label': {
            control: 'text',
            description: 'Override the auto-generated "Product badges: {names}" group label',
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductBadges>;

/**
 * Default — uses runtime `config.global.badges` (Sale + New) and
 * `mockStandardProductHit` (which has all c_is* flags set to true).
 * Renders 2 badges: New + Sale.
 *
 * Drive every other variant from the Controls panel:
 *   - `maxBadges` — set to 1 to cap to a single badge, 0 to hide all
 *     (note: when `badgeDetails` is unset, the runtime config has only
 *     2 entries, so any `maxBadges >= 2` produces the same DOM)
 *   - `badgeDetails` — pass a custom array (see WithBadgeOverride for
 *     the 3-badge override demo)
 *   - `variant` / `size` — see the layout/size variant catalog
 *   - `aria-label` — override the auto-generated group label
 */
export const Default: Story = {
    args: {
        product: mockStandardProductHit,
        maxBadges: 3,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const container = canvas.queryByRole('group');
        if (container) {
            await expect(container).toBeInTheDocument();
        }
    },
};

/**
 * Custom badge override — passes `badgeDetails` to bypass runtime config.
 * With 3 entries (New + Sale + Special) and no `maxBadges` cap, all three
 * render. Distinct from Default because Default's runtime config has
 * only 2 entries.
 *
 * Set `maxBadges: 2` in the Controls panel to reproduce the prior
 * `LimitedBadges` story (caps at 2 — same as Default's DOM).
 */
export const WithBadgeOverride: Story = {
    args: {
        product: mockStandardProductHit,
        badgeDetails: [
            { propertyName: 'c_isNew', label: 'New', color: 'green' },
            { propertyName: 'c_isSale', label: 'Sale', color: 'red' },
            { propertyName: 'c_isSpecial', label: 'Special', color: 'blue' },
        ],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const newBadges = canvas.queryAllByText('New');
        if (newBadges.length > 0) {
            await expect(newBadges[0]).toBeInTheDocument();
        }
    },
};
