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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Picture } from '../index';

const meta: Meta<typeof Picture> = {
    title: 'Core/Picture',
    component: Picture,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Presentational `<picture>` base: an ordered list of `<source>` entries followed by the projected image element. It does no URL math. With no sources it renders just the image. List narrower media queries first, since the first matching source wins.',
            },
        },
    },
};

export default meta;

type Story = StoryObj<typeof Picture>;

export const ArtDirected: Story = {
    args: {
        sources: [
            { srcSet: 'https://via.placeholder.com/400x300', media: 'not all and (min-width: 768px)' },
            { srcSet: 'https://via.placeholder.com/800x300', media: '(min-width: 768px)' },
        ],
        children: <img src="https://via.placeholder.com/800x300" alt="Art directed placeholder" />,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const sources = canvasElement.querySelectorAll('picture source');
        await expect(sources).toHaveLength(2);
        await expect(sources[0]).toHaveAttribute('media', 'not all and (min-width: 768px)');
    },
};

export const WithoutSources: Story = {
    args: {
        sources: [],
        children: <img src="https://via.placeholder.com/400x300" alt="Bare placeholder" />,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await expect(canvasElement.querySelector('picture')).toBeNull();
        await expect(canvasElement.querySelector('img')).not.toBeNull();
    },
};
