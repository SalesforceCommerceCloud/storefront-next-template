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
import CategoryPagination from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof CategoryPagination> = {
    title: 'Category/Category Pagination',
    component: CategoryPagination,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Pagination control for product listing pages. Renders Previous / page numbers
(with smart ellipsis) / Next, with the boundary buttons auto-disabling at the
edges. Returns \`null\` when \`total <= limit\`.

The component takes three direct props (\`limit\`, \`offset\`, \`total\`) — all are
exposed in the Controls panel, so a single FullyFeatured story can be driven
through every page-count / current-page combination. Boundary states (first
page, last page, single-page-collapsed) are kept as dedicated stories with
assertions, since they each show a fundamentally different layout.
                `,
            },
        },
    },
    argTypes: {
        limit: {
            description: 'Items per page (drives the page-count math)',
            control: { type: 'number', min: 1, step: 1 },
        },
        offset: {
            description: 'Current offset into the result set — `Math.floor(offset / limit) + 1` is the current page',
            control: { type: 'number', min: 0, step: 1 },
        },
        total: {
            description: 'Total result count. If `total <= limit`, the component renders nothing.',
            control: { type: 'number', min: 0, step: 1 },
        },
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
 * Rich-but-realistic baseline: 500 results at 12 per page, currently on page 6
 * (offset 60). Ellipsis appears on both sides; both Previous and Next are
 * enabled. Adjust `limit`, `offset`, and `total` from the Controls panel to
 * exercise every page combination — a 5-page range, a single mid-page,
 * pagination at the edges, etc.
 */
export const FullyFeatured: Story = {
    args: {
        limit: 12,
        offset: 60,
        total: 500,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const nav = canvas.getByRole('navigation', { name: /pagination/i });
        await expect(nav).toBeInTheDocument();
        const prev = canvas.getByRole('button', { name: /previous page/i });
        const next = canvas.getByRole('button', { name: /next page/i });
        await expect(prev).toBeEnabled();
        await expect(next).toBeEnabled();
    },
};

/**
 * First page — Previous is disabled, Next is enabled. Distinct boundary state.
 */
export const FirstPage: Story = {
    args: {
        limit: 24,
        offset: 0,
        total: 100,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const prev = canvas.getByRole('button', { name: /previous page/i });
        await expect(prev).toBeDisabled();
        const next = canvas.getByRole('button', { name: /next page/i });
        await expect(next).toBeEnabled();
    },
};

/**
 * Last page — Next is disabled, Previous is enabled. Distinct boundary state.
 */
export const LastPage: Story = {
    args: {
        limit: 24,
        offset: 96,
        total: 120,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const next = canvas.getByRole('button', { name: /next page/i });
        await expect(next).toBeDisabled();
        const prev = canvas.getByRole('button', { name: /previous page/i });
        await expect(prev).toBeEnabled();
    },
};

/**
 * Single page — `total <= limit` causes the component to return `null`. The
 * collapse-to-nothing case is fundamentally different from any rendered state
 * and worth a bookmarkable URL.
 */
export const SinglePage: Story = {
    args: {
        limit: 24,
        offset: 0,
        total: 20,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const nav = canvasElement.querySelector('nav[aria-label="Pagination"]');
        await expect(nav).not.toBeInTheDocument();
    },
};
