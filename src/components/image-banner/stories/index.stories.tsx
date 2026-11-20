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
import { PageDesignerProvider } from '@salesforce/storefront-next-runtime/design/react/core';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import ImageBanner from '../index';

const artwork = (width: number, height: number, text: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#dde9df"/><text x="5%" y="55%" font-size="32" fill="#173c2c">${text}</text></svg>`)}`;
const meta = {
    title: 'Content/Marketing/Image Banner',
    component: ImageBanner,
    tags: ['autodocs', 'interaction'],
    parameters: { layout: 'fullscreen' },
    decorators: [
        (Story) => (
            <AllProvidersWrapper>
                <Story />
            </AllProvidersWrapper>
        ),
    ],
    args: {
        imageUrl: {
            url: artwork(1600, 240, 'Discover the seasonal collection'),
            metaData: { width: 1600, height: 240 },
        },
        imageAlt: 'Discover the seasonal collection',
        linkUrl: '/c/seasonal',
    },
} satisfies Meta<typeof ImageBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByRole('link', { name: 'Discover the seasonal collection' })).toBeVisible();
    },
};
export const Sponsored: Story = { args: { disclosure: 'Sponsored' } };
export const Unlinked: Story = { args: { linkUrl: undefined } };
export const MissingLinkTextLive: Story = { args: { imageAlt: '   ' } };
export const MissingLinkTextDesignMode: Story = {
    args: { imageAlt: '   ' },
    decorators: [
        (Story) => (
            <PageDesignerProvider clientId="storybook-image-banner-validation" targetOrigin="*" mode="EDIT">
                <Story />
            </PageDesignerProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
        await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    },
};
export const EmptyLive: Story = { args: { imageUrl: undefined } };
export const EmptyDesignMode: Story = {
    args: { imageUrl: undefined },
    decorators: [
        (Story) => (
            <PageDesignerProvider clientId="storybook-image-banner" targetOrigin="*" mode="EDIT">
                <Story />
            </PageDesignerProvider>
        ),
    ],
};
