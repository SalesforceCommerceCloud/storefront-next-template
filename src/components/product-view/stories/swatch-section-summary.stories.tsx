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
import { SwatchSectionSummary } from '../swatch-section-summary';

const meta: Meta<typeof SwatchSectionSummary> = {
    title: 'Products/Swatch Section Summary',
    component: SwatchSectionSummary,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof SwatchSectionSummary>;

/** Selected value with a swatch thumbnail — the collapsed header of a chosen swatch section. */
export const WithSelection: Story = {
    args: {
        label: 'Fabric',
        selectedName: 'Slate Linen',
        image: {
            link: 'https://placehold.co/72x72/e4d5b7/333333?text=Linen',
            alt: 'Slate Linen swatch',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Fabric')).toBeInTheDocument();
        await expect(canvas.getByText('Slate Linen')).toBeInTheDocument();
    },
};

/** No selection yet — only the attribute label renders (no thumbnail, no value line). */
export const LabelOnly: Story = {
    args: {
        label: 'Fabric',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Fabric')).toBeInTheDocument();
        await expect(canvasElement.querySelector('img')).toBeNull();
    },
};

/** Selected value without swatch imagery — label over value name, no thumbnail. */
export const NoThumbnail: Story = {
    args: {
        label: 'Leg Style',
        selectedName: 'Tapered Wood',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Leg Style')).toBeInTheDocument();
        await expect(canvas.getByText('Tapered Wood')).toBeInTheDocument();
    },
};
