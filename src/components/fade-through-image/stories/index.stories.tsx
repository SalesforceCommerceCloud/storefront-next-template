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
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import { FadeThroughImage } from '../index';

// DIS placeholder syntax `[?sw={width}]` so the composed DynamicImage emits per-breakpoint widths.
const SRC = 'https://via.placeholder.com/800[?sw={width}&q=60]';

const meta: Meta<typeof FadeThroughImage> = {
    title: 'Media/Fade Through Image',
    component: FadeThroughImage,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Fade-through image for variant swaps (Material Design motion): on a src change the outgoing ' +
                    'image fades OUT first, then the incoming image fades IN once the fade-out completes. The ' +
                    'incoming image preloads on a hidden layer during the fade-out, so the fade-in starts with no ' +
                    'wait and there is no blank flash — switching a product variant fades the outgoing hero out and ' +
                    'the incoming hero in. First paint shows the image immediately (no fade-in, so it stays ' +
                    'LCP-friendly); the transition only applies to swaps. Composes DynamicImage for each layer.',
            },
        },
    },
    // composeStories (snapshot harness) runs outside the global decorators; DynamicImage needs a config.
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof FadeThroughImage>;

/** Basic fade-through image rendering a single src immediately. */
export const Default: Story = {
    args: {
        src: SRC,
        alt: 'The Classic Automatic',
        priority: 'high',
        widths: { base: 360 },
        className: 'aspect-square w-[360px] bg-muted/40',
    },
};

/** With responsive widths for different breakpoints. */
export const ResponsiveWidths: Story = {
    args: {
        src: SRC,
        alt: 'The Classic Automatic',
        widths: { base: '100vw', lg: '50vw', '2xl': 680 },
        className: 'aspect-square w-[360px] bg-muted/40',
    },
};
