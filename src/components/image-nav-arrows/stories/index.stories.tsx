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
import { useState, type ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import ImageNavArrows from '../index';

type SyntheticArgs = {
    imageCount: number;
    size: 'sm' | 'lg';
    className: string;
};

function ImageNavArrowsWrapper({ imageCount, size, className }: SyntheticArgs) {
    const [index, setIndex] = useState(0);
    return (
        <div className="relative w-80 h-60 bg-muted flex items-center justify-center rounded-none">
            <span className="text-muted-foreground text-sm">
                Image {index + 1} of {imageCount}
            </span>
            <ImageNavArrows
                imageCount={imageCount}
                onIndexChange={setIndex}
                size={size}
                className={className || undefined}
            />
        </div>
    );
}

const meta: Meta<ComponentType<SyntheticArgs>> = {
    title: 'Core/Navigation/Image Nav Arrows',
    component: ImageNavArrows as unknown as ComponentType<SyntheticArgs>,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        imageCount: {
            control: { type: 'number', min: 1, max: 20 },
            description: 'Number of images the arrows wrap around',
        },
        size: {
            control: { type: 'radio' },
            options: ['sm', 'lg'],
            description: '`sm` for PLP/cart (compact), `lg` for PDP (larger button + shadow)',
        },
        className: {
            control: 'text',
            description: 'Additional CSS classes merged onto both arrow buttons',
        },
    },
};

export default meta;
type Story = StoryObj<ComponentType<SyntheticArgs>>;

/**
 * Default — small arrow buttons (PLP/cart variant) wrapped in an 80×60
 * harness so the absolutely-positioned arrows have something to anchor
 * to. Drive every variant from the Controls panel:
 *
 *   - `size: 'lg'` — switches to PDP variant (`p-3` padding,
 *     `size-6` chevron, `left-4`/`right-4`, `shadow-lg`)
 *   - `imageCount` — changes the wrap-around length (used by play test
 *     for backward-wrap from index 0 → imageCount - 1)
 *   - `className` — pass extra Tailwind classes to override default
 *     button styling
 *
 * The play test exercises forward, backward, and backward-wrap navigation.
 */
export const Default: Story = {
    args: {
        imageCount: 5,
        size: 'sm',
        className: '',
    },
    render: (args) => <ImageNavArrowsWrapper {...args} />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const prevButton = canvas.getByRole('button', { name: /previous/i });
        const nextButton = canvas.getByRole('button', { name: /next/i });
        await expect(prevButton).toBeInTheDocument();
        await expect(nextButton).toBeInTheDocument();

        await expect(canvas.getByText('Image 1 of 5')).toBeInTheDocument();

        await userEvent.click(nextButton);
        await expect(canvas.getByText('Image 2 of 5')).toBeInTheDocument();

        await userEvent.click(prevButton);
        await expect(canvas.getByText('Image 1 of 5')).toBeInTheDocument();

        await userEvent.click(prevButton);
        await expect(canvas.getByText('Image 5 of 5')).toBeInTheDocument();
    },
};
