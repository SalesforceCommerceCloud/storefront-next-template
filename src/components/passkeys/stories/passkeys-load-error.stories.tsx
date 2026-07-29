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
import { PasskeysLoadError } from '../passkeys-load-error';

const meta: Meta<typeof PasskeysLoadError> = {
    title: 'ACCOUNT/Passkeys/Passkeys Load Error',
    component: PasskeysLoadError,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Inline error shown in place of the passkeys list (as the `<Await errorElement>`) when the deferred credentials promise rejects. The page chrome — heading and "Add Passkey" button — renders outside the `<Await>`, so this replaces only the list, not the whole page.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/couldn't load your passkeys/i)).toBeInTheDocument();
    },
};
