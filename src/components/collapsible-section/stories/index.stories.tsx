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
import CollapsibleSection from '..';

const meta: Meta<typeof CollapsibleSection> = {
    title: 'Content/Marketing/Collapsible Section',
    component: CollapsibleSection,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
    // Re-key on `defaultOpen` so toggling that Control remounts the section.
    // CollapsibleSection seeds its `isOpen`/`hasOpened` state from
    // `defaultOpen` via useState (index.tsx:61) with no useEffect resync, so
    // without a remount the Controls panel value would be ignored.
    decorators: [(Story, context) => <Story key={`defaultOpen-${String(context.args.defaultOpen)}`} />],
    // Only props that visibly drive the canvas are exposed in the controls
    // panel. `labelSupplement` is a ReactNode — Storybook's controls can't
    // usefully edit JSX, so it's hidden.
    argTypes: {
        label: {
            control: 'text',
            description: 'The label rendered inside the summary row',
            table: { type: { summary: 'string' } },
        },
        defaultOpen: {
            control: 'boolean',
            description: 'Whether the section starts open',
            table: {
                type: { summary: 'boolean' },
                defaultValue: { summary: 'false' },
            },
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
        // `children` is typed as ReactNode but the component renders strings
        // as plain text nodes inside the <details> body. Exposing it as a
        // `text` control lets a Storybook user edit the body inline.
        children: {
            control: 'text',
            description: 'Content revealed when the section is open',
            table: { type: { summary: 'string' } },
        },
        labelSupplement: { control: false, table: { disable: true } },
    },
    args: {
        label: 'Description:',
        children: 'This is the collapsible body content.',
    },
};

export default meta;
type Story = StoryObj<typeof CollapsibleSection>;

/**
 * Open-by-default state — the summary row plus the revealed body content
 * are both visible.
 */
export const Default: Story = {
    args: {
        defaultOpen: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Description:')).toBeInTheDocument();
        await expect(canvas.getByText('This is the collapsible body content.')).toBeInTheDocument();

        const details = canvasElement.querySelector('details');
        await expect(details).toHaveAttribute('open');
    },
};

/**
 * Closed-by-default state with long body content. Exercises the full
 * click → open → click → close cycle and verifies the long content renders
 * cleanly when expanded.
 */
export const Closed: Story = {
    args: {
        label: 'Full description:',
        defaultOpen: false,
        children: Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1}: ${'Long Content. '.repeat(8).trim()}`).join(
            '\n\n'
        ),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const summary = canvas.getByText('Full description:').closest('summary');
        await expect(summary).toBeInTheDocument();

        const details = canvasElement.querySelector('details');
        await expect(details).not.toHaveAttribute('open');

        // Open: long body content becomes visible.
        await userEvent.click(summary!);
        await expect(details).toHaveAttribute('open');
        await expect(canvas.getByText(/Paragraph 1:/i)).toBeInTheDocument();
        await expect(canvas.getByText(/Paragraph 8:/i)).toBeInTheDocument();

        // Close again: details collapses and `open` attribute is removed.
        await userEvent.click(summary!);
        await expect(details).not.toHaveAttribute('open');
    },
};
