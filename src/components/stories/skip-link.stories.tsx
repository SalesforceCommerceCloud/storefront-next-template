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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { SkipLink } from '../skip-link';

const { t } = getTranslation();

const meta: Meta<typeof SkipLink> = {
    title: 'Core/Skip Link',
    component: SkipLink,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Visually hidden link that lets keyboard users jump directly to `#main-content`, appearing only on focus (WCAG 2.1 SC 2.4.1 Bypass Blocks).',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof SkipLink>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const link = canvas.getByText(t('common:skipToMainContent'));
        await expect(link).toBeInTheDocument();
        await expect(link).toHaveAttribute('href', '#main-content');
        await expect(link).toHaveClass('sr-only');
    },
};

export const FocusedRevealsLink: Story = {
    parameters: {
        docs: {
            description: {
                story: 'On focus the link becomes visible and, on click, moves focus to `#main-content` — this story mounts its own `<main>` target since Storybook stories render outside the app shell.',
            },
        },
    },
    decorators: [
        (Story) => (
            <>
                <Story />
                <main id="main-content" tabIndex={-1}>
                    Main content
                </main>
            </>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const link = canvas.getByText(t('common:skipToMainContent'));

        await userEvent.tab();
        await expect(link).toHaveFocus();

        const main = canvasElement.ownerDocument.getElementById('main-content');
        // JSDOM/browser test env doesn't implement scrollIntoView by default.
        if (main) main.scrollIntoView = () => {};

        await userEvent.click(link);
        await expect(main).toHaveFocus();
    },
};
