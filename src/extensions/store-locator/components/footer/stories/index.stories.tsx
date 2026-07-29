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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady, SITE_PREFIX } from '@storybook/test-utils';
import StoreLocatorFooter from '../index';

const meta: Meta<typeof StoreLocatorFooter> = {
    title: 'Extensions/Store Locator/Store Locator Footer',
    component: StoreLocatorFooter,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The StoreLocatorFooter component renders a single footer list item with a link to the store locator page.

## Features

- **Footer link**: List item containing a link to \`/store-locator\`
- **i18n**: Link text comes from \`extStoreLocator.footer.links.storeLocator\`
- **Accessibility**: Uses a semantic \`<li>\` and \`<Link>\` for navigation

## Usage

This component is typically used inside a footer \`<ul>\` in the site layout to provide quick access to the store locator from the footer.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ul className="flex flex-wrap gap-4 list-none p-4">
                <Story />
            </ul>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Default store locator footer link showing:
- List item with link to Store Locator page
- Translated link text (e.g. "Store Locator")
- Hover underline styling

This is the default state as used in the site footer.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /store locator/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/store-locator`);
    },
};

export const KeyboardNavigation: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Verifies the footer link is focusable and keyboard-accessible.
- Link can receive focus via Tab
- Enter/Space activate the link (browser default)
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /store locator/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();

        await userEvent.tab();
        await expect(link).toHaveFocus();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator footer link in a mobile context. Shows:
- Touch-friendly link target
- Same link and destination

The component maintains consistent behavior across screen sizes.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /store locator/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/store-locator`);
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Store locator footer link on desktop. Shows:
- Same link and destination
- Hover underline for affordance

The component provides a clear footer entry point to the store locator.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = await canvas.findByRole('link', { name: /store locator/i }, { timeout: 5000 });
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/store-locator`);
    },
};
