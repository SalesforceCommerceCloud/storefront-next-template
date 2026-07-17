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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import ChangeStoreButton from '../change-store-button';

const meta: Meta<typeof ChangeStoreButton> = {
    title: 'Account/Store Preferences/Change Store Button',
    component: ChangeStoreButton,
    tags: ['autodocs', 'sfdc-ext-store-locator'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Client component that provides a button to open the Store Selector extension. Requires the store-locator extension to be installed. The button DOM is identical regardless of `currentStoreId` (it only feeds the extension on click), so a single Default story covers both the with- and without-current-store cases.',
            },
        },
    },
    args: {
        currentStoreId: 'store-001',
    },
    argTypes: {
        currentStoreId: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof ChangeStoreButton>;

/**
 * Default — Change-store button rendered. The visible DOM doesn't change per
 * `currentStoreId`, so a single story covers both with- and without-store.
 */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByRole('button', { name: 'Change store' })).toBeInTheDocument();
    },
};
