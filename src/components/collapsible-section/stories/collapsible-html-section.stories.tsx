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
import { waitForStorybookReady } from '@storybook/test-utils';
import CollapsibleHtmlSection from '../collapsible-html-section';

const meta: Meta<typeof CollapsibleHtmlSection> = {
    title: 'Content/Marketing/Collapsible HTML Section',
    component: CollapsibleHtmlSection,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
    argTypes: {
        contentType: {
            control: 'radio',
            options: ['plain-text', 'bulleted-list', 'table-2-column'],
            description: 'Declares the expected HTML structure; resolves default styling',
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof CollapsibleHtmlSection>;

export const PlainText: Story = {
    args: {
        label: 'Description:',
        content: 'This is a premium quality product with excellent durability and comfort.',
        contentType: 'plain-text',
        defaultOpen: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Description:')).toBeInTheDocument();
        await expect(
            canvas.getByText('This is a premium quality product with excellent durability and comfort.')
        ).toBeInTheDocument();
    },
};

export const BulletedList: Story = {
    args: {
        label: 'Features:',
        content: '<ul><li>Premium cotton blend</li><li>Machine washable</li><li>Breathable fabric</li></ul>',
        contentType: 'bulleted-list',
        defaultOpen: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Features:')).toBeInTheDocument();
        await expect(canvas.getByText('Premium cotton blend')).toBeInTheDocument();
        await expect(canvas.getByText('Machine washable')).toBeInTheDocument();
    },
};

export const Table2Column: Story = {
    args: {
        label: 'Specifications:',
        content:
            '<table><tr><td>Material:</td><td>Full-grain leather</td></tr><tr><td>Sole:</td><td>Rubber</td></tr></table>',
        contentType: 'table-2-column',
        defaultOpen: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Specifications:')).toBeInTheDocument();
        await expect(canvas.getByText('Material:')).toBeInTheDocument();
        await expect(canvas.getByText('Full-grain leather')).toBeInTheDocument();
    },
};

export const OpenByDefault: Story = {
    args: {
        label: 'Details:',
        content: 'This content is visible on load because defaultOpen is true.',
        defaultOpen: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Details:')).toBeInTheDocument();
        const details = canvasElement.querySelector('details');
        await expect(details).toHaveAttribute('open');
    },
};

export const ToggleInteraction: Story = {
    args: {
        label: 'Click to expand:',
        content: 'This content appears after expanding the section.',
        defaultOpen: false,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const summary = canvas.getByText('Click to expand:').closest('summary');
        await expect(summary).toBeInTheDocument();

        const details = canvasElement.querySelector('details');
        await expect(details).not.toHaveAttribute('open');

        await userEvent.click(summary!);
        await expect(details).toHaveAttribute('open');
    },
};
