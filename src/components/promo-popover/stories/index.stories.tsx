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
import PromoPopover from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ReactElement } from 'react';

interface PopoverHarnessArgs {
    header?: string;
    body?: string;
}

function PopoverHarness({ header, body }: PopoverHarnessArgs): ReactElement {
    return (
        <PromoPopover header={header}>
            <p>{body}</p>
        </PromoPopover>
    );
}

const meta: Meta<typeof PopoverHarness> = {
    title: 'Cart/Promo Codes/Promo Popover',
    component: PopoverHarness,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
\`<PromoPopover>\` renders a small **info** icon that opens a tooltip-style popover on hover/focus. Used to surface applied-promotion details on the cart/order summary line items.

The component's API is just two slots: an optional \`header\` and required \`children\`. Per Pattern 10 those are exposed as text controls (using the ReactNode-as-text trick) on a single **Default** story rather than spawning per-content variants.

Pattern 11 — overlay closed by default: the trigger button is in the canvas, the popover content lives in a portal and only mounts on hover.
                `,
            },
        },
    },
    argTypes: {
        header: {
            control: 'text',
            description: 'Optional header rendered above the body, separated by a divider.',
        },
        body: {
            control: 'text',
            description: 'Body copy. Wrapped in a `<p>` so plain strings work in the controls textarea.',
        },
    },
    args: {
        header: 'Special Promotion',
        body: 'This is a special promotional offer. Get 20% off on your next purchase when you spend over $100!',
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        const infoButton = await canvas.findByRole('button', { name: /info/i }, { timeout: 5000 });
        await expect(infoButton).toBeInTheDocument();

        // Radix tooltips open on pointerenter / focus and portal their content
        // to `document.body`, so the assertion has to walk the whole document.
        // Use focus rather than `userEvent.hover` because Radix's hover delay
        // (`delayDuration` default ~700 ms) makes hover-driven flows flaky in
        // the headless test runner; focus is synchronous and matches the
        // keyboard path users hit anyway.
        //
        // Radix also renders a hidden duplicate of the popover content for
        // `aria-describedby` purposes — `findAllByText` returns both nodes;
        // we accept any matching node existing.
        infoButton.focus();
        const documentBody = within(document.body);
        if (args.header) {
            const headers = await documentBody.findAllByText(args.header, undefined, { timeout: 5000 });
            await expect(headers.length).toBeGreaterThan(0);
        }
        const bodies = await documentBody.findAllByText(args.body ?? '', undefined, { timeout: 5000 });
        await expect(bodies.length).toBeGreaterThan(0);
    },
};
