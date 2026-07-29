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
import { allModes } from '../../../../../.storybook/modes';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { AppDownloadSection } from '../index';

const meta: Meta<typeof AppDownloadSection> = {
    title: 'Account/App Download Section',
    component: AppDownloadSection,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'padded',
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof AppDownloadSection>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Download Our App')).toBeInTheDocument();
        await expect(canvas.getByRole('img', { name: 'App Store' })).toBeInTheDocument();
        await expect(canvas.getByRole('img', { name: 'Google Play' })).toBeInTheDocument();
    },
};
