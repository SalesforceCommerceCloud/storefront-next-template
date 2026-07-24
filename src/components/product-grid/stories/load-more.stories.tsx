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
import { expect, fn, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import LoadMore from '../load-more';

const meta: Meta<typeof LoadMore> = {
    title: 'CATEGORY/Load More',
    component: LoadMore,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
"Load more" control for the product listing page — the infinite-scroll and
manual-append counterpart to numbered pagination. Shows a "Showing X of Y"
progress line and a button that requests the next batch of products; an
invisible sentinel below the button auto-loads the next batch as the shopper
scrolls near it. Renders nothing once every product has been loaded
(\`hasMore\` is false and no request is in flight) or when the result set is empty.
                `,
            },
        },
    },
    argTypes: {
        loadedCount: { description: 'Products currently shown', control: { type: 'number', min: 0 } },
        total: { description: 'Total products matching the search', control: { type: 'number', min: 0 } },
        hasMore: { description: 'Whether more products remain to load', control: 'boolean' },
        capReached: { description: 'Whether the DOM cap was hit with products remaining', control: 'boolean' },
        isLoading: { description: 'Whether a request is in flight', control: 'boolean' },
        hasError: { description: 'Whether the last request failed', control: 'boolean' },
        onLoadMore: { action: 'load-more' },
    },
    args: {
        onLoadMore: fn(),
    },
    decorators: [
        (Story) => (
            <div className="p-4">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Baseline: 24 of 218 products shown, more remaining. The button is enabled and
 * clicking it requests the next batch.
 */
export const Default: Story = {
    args: {
        loadedCount: 24,
        total: 218,
        hasMore: true,
        isLoading: false,
        hasError: false,
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Showing 24 of 218')).toBeInTheDocument();
        const button = canvas.getByRole('button', { name: /load more/i });
        await expect(button).toBeEnabled();
        await userEvent.click(button);
        await expect(args.onLoadMore).toHaveBeenCalledTimes(1);
    },
};

/**
 * A batch is being fetched — the button is disabled and shows a spinner + "Loading…".
 */
export const Loading: Story = {
    args: {
        loadedCount: 24,
        total: 218,
        hasMore: true,
        isLoading: true,
        hasError: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = canvas.getByRole('button', { name: /loading/i });
        await expect(button).toBeDisabled();
    },
};

/**
 * The last request failed — an alert is shown and the button offers a retry.
 */
export const Error: Story = {
    args: {
        loadedCount: 24,
        total: 218,
        hasMore: true,
        isLoading: false,
        hasError: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('alert')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /try again/i })).toBeEnabled();
    },
};

/**
 * Everything loaded — `hasMore` is false and nothing is in flight, so the control shows the
 * end-of-catalog message instead of a button.
 */
export const AllLoaded: Story = {
    args: {
        loadedCount: 218,
        total: 218,
        hasMore: false,
        isLoading: false,
        hasError: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/reached the end/i)).toBeInTheDocument();
        await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    },
};

/**
 * DOM cap reached (200 products loaded with more remaining) — the button is replaced with a prompt
 * to refine filters, preventing DOM bloat on low-end devices.
 */
export const CapReached: Story = {
    args: {
        loadedCount: 200,
        total: 553,
        hasMore: false,
        capReached: true,
        isLoading: false,
        hasError: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/refine your filters/i)).toBeInTheDocument();
        await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    },
};
