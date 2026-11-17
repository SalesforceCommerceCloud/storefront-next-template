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
import HomeStorePrompt from '../home-store-prompt';
import { getHomeStorePromptDismissalCookieName } from '@/extensions/store-locator/home-store-prompt-dismissal';

const meta: Meta<typeof HomeStorePrompt> = {
    title: 'Extensions/Store Locator/Home Store Prompt',
    component: HomeStorePrompt,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        initialEntries: ['/'],
        docs: {
            description: {
                component:
                    'A home-page prompt that opens the existing Store Locator sheet and stays dismissed for the current browser session.',
            },
        },
    },
    decorators: [
        (Story) => {
            document.cookie = `${getHomeStorePromptDismissalCookieName('RefArchGlobal')}=; Max-Age=0; Path=/`;
            return <Story />;
        },
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(await canvas.findByTestId('store-locator-home-prompt')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /choose a store/i })).toBeInTheDocument();
    },
};
