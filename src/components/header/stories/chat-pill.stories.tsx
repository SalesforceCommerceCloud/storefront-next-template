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
import ChatPill from '../chat-pill';

const meta: Meta<typeof ChatPill> = {
    title: 'Layout/Header/Chat Pill',
    component: ChatPill,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Header button that opens the shopper agent, styled like the other header icons: a filled sparkle plus the agent name (`headerText`, else "Open chat"). Below `lg` only the sparkle shows.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ChatPill>;

export const WithAgentName: Story = {
    args: { label: 'beauty advisor' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'beauty advisor' })).toBeInTheDocument();
    },
};

export const DefaultLabel: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
    },
};
