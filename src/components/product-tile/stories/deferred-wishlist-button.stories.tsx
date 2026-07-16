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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { DeferredWishlistButton } from '../deferred-wishlist-button';
import { mockProductSearchItem } from '../../__mocks__/product-search-hit-data';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

const meta: Meta<typeof DeferredWishlistButton> = {
    title: 'Components/ProductTile/DeferredWishlistButton',
    component: DeferredWishlistButton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
**DeferredWishlistButton** renders a placeholder \`HeartIcon\` until the user’s
pointer enters it. On first hover it lazy-loads the real \`WishlistButton\`
(with its heavy \`useWishlist\` / \`useRequireAuth\` hooks). The placeholder
shares \`size\`, \`className\`, and \`tabIndex\` with the deferred button so
layout doesn’t shift when the real button mounts.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <div className="relative w-64 h-64">
                    <Story />
                </div>
            </ConfigProvider>
        ),
    ],
    argTypes: {
        product: {
            description: 'SCAPI `ProductSearchHit` — used by the lazy-loaded `WishlistButton`',
            control: false,
        },
        variant: {
            description: 'Optional variant override (e.g., specific colour) — passed through to `WishlistButton`',
            control: false,
        },
        size: {
            description: 'Icon size — drives both the placeholder and the lazy-loaded button',
            control: 'select',
            options: ['sm', 'md', 'lg'],
        },
        className: {
            description: 'Additional CSS classes — applied to both placeholder and real button',
            control: 'text',
        },
        tabIndex: {
            description: 'Tab index for keyboard focus management',
            control: 'number',
        },
    },
};

export default meta;
type Story = StoryObj<typeof DeferredWishlistButton>;

/**
 * Rich-but-realistic baseline. The Controls panel exposes every prop the
 * placeholder reads — `size`, `className`, `tabIndex`. The dedicated stories
 * below remain bookmarked entry points for size variants and minimal-props.
 */
export const Playground: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'md',
        className: '',
        tabIndex: 0,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Placeholder renders a HeartIcon button before pointer-enter triggers lazy load
        const heart = canvasElement.querySelector('button');
        await expect(heart).not.toBeNull();
    },
};

export const Default: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'md',
    },
};

export const SmallSize: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'sm',
    },
};

export const LargeSize: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'lg',
    },
};

export const WithClassName: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'md',
        className: 'custom-class',
    },
};

export const WithTabIndex: Story = {
    args: {
        product: mockProductSearchItem,
        size: 'md',
        tabIndex: -1,
    },
};

export const MinimalProps: Story = {
    args: {
        product: { productId: 'minimal-product' },
    },
};
