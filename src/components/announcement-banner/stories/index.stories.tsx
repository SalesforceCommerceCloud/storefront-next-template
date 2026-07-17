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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import AnnouncementBanner from '../index';

const meta: Meta<typeof AnnouncementBanner> = {
    title: 'Content/Marketing/Announcement Banner',
    component: AnnouncementBanner,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Top-of-page banner used for promotions, system messages, and announcements. Supports token-based color schemes, three height densities, three text alignments, and an optional CTA link.',
            },
        },
    },
    argTypes: {
        message: {
            control: 'text',
            description: 'Banner message text. The banner does not render when empty.',
        },
        linkUrl: {
            control: 'text',
            description: 'Optional CTA URL. Rendered as an inline underlined link.',
        },
        linkText: {
            control: 'text',
            description: 'Optional CTA label. The link is rendered only when both linkUrl and linkText are set.',
        },
        colorScheme: {
            control: { type: 'select' },
            options: ['primary', 'secondary', 'destructive'],
            description: 'Token-based color treatment. Uses theme tokens for guaranteed contrast.',
            table: { defaultValue: { summary: 'primary' } },
        },
        height: {
            control: { type: 'select' },
            options: ['sm', 'md', 'lg'],
            description: 'Vertical density of the banner (controls padding and text size).',
            table: { defaultValue: { summary: 'md' } },
        },
        alignment: {
            control: { type: 'inline-radio' },
            options: ['left', 'center', 'right'],
            description: 'Horizontal alignment of the message.',
            table: { defaultValue: { summary: 'center' } },
        },
        className: {
            control: 'text',
            description: 'Additional class names appended to the root element.',
        },
    },
    args: {
        message: 'FREE WORLDWIDE SHIPPING from $90',
        colorScheme: 'primary',
        height: 'md',
        alignment: 'center',
    },
};

export default meta;
type Story = StoryObj<typeof AnnouncementBanner>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Use the Controls panel to experiment with every prop on the component.',
            },
        },
    },
};

export const Default: Story = {
    args: {
        message: 'Free shipping on all orders over $50!',
    },
    parameters: {
        docs: {
            description: { story: 'Plain banner with no CTA.' },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveTextContent('Free shipping on all orders over $50!');
    },
};

export const WithCTA: Story = {
    args: {
        message: 'Summer Sale — Up to 40% off',
        linkUrl: '/sale',
        linkText: 'Shop Now',
    },
    parameters: {
        docs: {
            description: { story: 'Banner with an inline CTA link.' },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByRole('link', { name: 'Shop Now' });
        await expect(link).toBeInTheDocument();
        await expect(link.getAttribute('href')).toContain('/sale');
    },
};

export const ColorSchemePrimary: Story = {
    args: {
        message: 'Primary color scheme',
        colorScheme: 'primary',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('bg-primary', 'text-primary-foreground');
    },
};

export const ColorSchemeSecondary: Story = {
    args: {
        message: 'Subdued informational message',
        colorScheme: 'secondary',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('bg-secondary', 'text-secondary-foreground');
    },
};

export const ColorSchemeDestructive: Story = {
    args: {
        message: 'Service disruption — please try again later',
        colorScheme: 'destructive',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('bg-destructive');
    },
};

export const HeightSmall: Story = {
    args: {
        message: 'Compact banner',
        height: 'sm',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('py-1.5', 'text-xs');
    },
};

export const HeightMedium: Story = {
    args: {
        message: 'Medium-density banner',
        height: 'md',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('py-3', 'text-sm');
    },
};

export const HeightLarge: Story = {
    args: {
        message: 'Tall, attention-grabbing banner',
        height: 'lg',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('status')).toHaveClass('py-5', 'text-base');
    },
};

export const AlignmentLeft: Story = {
    args: {
        message: 'Left-aligned message',
        alignment: 'left',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const banner = canvas.getByRole('status');
        await expect(banner).toHaveClass('justify-start');
        await expect(canvas.getByText('Left-aligned message')).toHaveClass('text-left');
    },
};

export const AlignmentCenter: Story = {
    args: {
        message: 'Center-aligned message',
        alignment: 'center',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const banner = canvas.getByRole('status');
        await expect(banner).toHaveClass('justify-center');
        await expect(canvas.getByText('Center-aligned message')).toHaveClass('text-center');
    },
};

export const AlignmentRight: Story = {
    args: {
        message: 'Right-aligned message',
        alignment: 'right',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const banner = canvas.getByRole('status');
        await expect(banner).toHaveClass('justify-end');
        await expect(canvas.getByText('Right-aligned message')).toHaveClass('text-right');
    },
};

export const LongText: Story = {
    args: {
        message:
            'Use code SUMMER2026 at checkout for an extra 15% off all clearance items. Valid through June 30th. Exclusions may apply.',
        linkUrl: '/clearance',
        linkText: 'Shop Clearance',
    },
    parameters: {
        docs: {
            description: {
                story: 'Long marketing copy with a CTA link, exercising message wrapping.',
            },
        },
    },
};
