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
import HtmlFragment from '..';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigWrapper } from '@/test-utils/config';

const CONTENT_TYPE_OPTIONS = ['plain-text', 'bulleted-list', 'table-2-column'] as const;

const meta: Meta<typeof HtmlFragment> = {
    title: 'Content/Marketing/HTML Fragment',
    component: HtmlFragment,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Renders authored HTML or plain-text content via `dangerouslySetInnerHTML`. SSR-safe. The `contentType` prop selects a default style preset (plain-text / bulleted-list / table-2-column); image URLs in the content are automatically transformed to use DIS with WebP optimization.',
            },
        },
    },
    argTypes: {
        contentType: { control: 'select', options: CONTENT_TYPE_OPTIONS },
        content: { control: 'text' },
        // A Tailwind className string isn't a designer-editable control (Designer-Friendly Input
        // Rule) — hide it from the panel rather than exposing a free-text box that does nothing useful.
        className: { table: { disable: true } },
    },
    args: {
        content: 'This is a premium quality product with excellent durability and comfort.',
        contentType: 'plain-text',
    },
    // composeStories runs outside the global decorator stack; HtmlFragment calls useConfig()
    // for DIS image URL transforms, so we declare ConfigWrapper here to satisfy the snapshot harness path.
    decorators: [
        (Story) => (
            <ConfigWrapper>
                <Story />
            </ConfigWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof HtmlFragment>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle between content types and edit the authored HTML directly via Controls.',
            },
        },
    },
};

export const PlainText: Story = {
    args: {
        content: 'This is a premium quality product with excellent durability and comfort.',
        contentType: 'plain-text',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(
            canvas.getByText('This is a premium quality product with excellent durability and comfort.')
        ).toBeInTheDocument();
    },
};

export const BulletedList: Story = {
    args: {
        content: '<ul><li>Premium cotton blend</li><li>Machine washable</li><li>Breathable fabric</li></ul>',
        contentType: 'bulleted-list',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Premium cotton blend')).toBeInTheDocument();
        await expect(canvas.getByText('Machine washable')).toBeInTheDocument();
        // The bulleted-list contentType actually renders a real <ul>.
        await expect(canvasElement.querySelector('ul')).not.toBeNull();
    },
};

export const Table2Column: Story = {
    args: {
        content:
            '<table><tr><td>Material:</td><td>Full-grain leather</td></tr><tr><td>Sole:</td><td>Rubber</td></tr><tr><td>Heel height:</td><td>1.5"</td></tr><tr><td>Closure:</td><td>Lace-up + side zip</td></tr></table>',
        contentType: 'table-2-column',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Material:')).toBeInTheDocument();
        await expect(canvas.getByText('Full-grain leather')).toBeInTheDocument();
    },
};

export const EmptyContent: Story = {
    args: {
        content: '',
        contentType: 'plain-text',
    },
    parameters: {
        docs: {
            description: {
                story: 'Coverage for AC #2 missing-content — when `content` is an empty string, the component renders the wrapper `<div>` with no inner HTML. Merchants see this when an HTML attribute is left unauthored.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // The wrapper exists (data-testid) but its innerHTML is empty.
        const wrapper = canvasElement.querySelector('[data-testid="html-fragment"]');
        await expect(wrapper).not.toBeNull();
        await expect(wrapper?.innerHTML).toBe('');
    },
};

export const LongCopy: Story = {
    args: {
        content: `
            <h2>Editorial Story Headline That Demonstrates Long Authored Copy</h2>
            <p>This paragraph represents the kind of multi-sentence editorial content merchants author for product description pages, brand stories, and FAQ articles. It includes inline <strong>strong text</strong>, <em>emphasis</em>, and <a href="/category/featured">links</a> — verifying that the default plain-text styling reflows cleanly under realistic copy density without breaking the surrounding layout.</p>
            <p>A second paragraph adds further density: it tests vertical spacing between block elements, paragraph margins, and the legibility of long-form running copy at the default font size. Merchants typically author 200-500 words for editorial sections, occasionally up to 1000+ for full brand stories.</p>
            <ul>
                <li>Inline lists nested inside long-copy sections (this is one such item)</li>
                <li>Multiple bullets with secondary content</li>
                <li>And a final closing item to verify list spacing under the running copy</li>
            </ul>
        `,
        contentType: 'plain-text',
    },
    parameters: {
        docs: {
            description: {
                story: 'AC #2 long-copy authoring — multi-paragraph + inline formatting + nested list. Verifies the default plain-text styles handle realistic editorial content.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/editorial story headline/i)).toBeInTheDocument();
        await expect(canvas.getByRole('link', { name: /links/i })).toBeInTheDocument();
    },
};
