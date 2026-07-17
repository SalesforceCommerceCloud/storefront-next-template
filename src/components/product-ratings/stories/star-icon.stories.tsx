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
import type { ComponentProps } from 'react';

import { StarIcon } from '../star-icon';

type SizePreset = 'sm' | 'default' | 'lg' | 'xl';

const SIZE_CLASSES: Record<SizePreset, string> = {
    sm: 'w-3 h-3',
    default: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
};

type StoryArgs = ComponentProps<typeof StarIcon> & { size: SizePreset };

const meta: Meta<StoryArgs> = {
    title: 'Products/Product Ratings/Star Icon',
    component: StarIcon,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        opacity: {
            control: { type: 'range', min: 0, max: 1, step: 0.1 },
            description:
                'Fill fraction (0–1). When `filled: true`, opacity 1 = solid rating color, 0 < x < 1 = left-to-right hard-stop gradient. When `filled: false`, opacity is ignored',
        },
        filled: {
            control: 'boolean',
            description: 'Whether the star has any fill. False = empty outline with border-subtle stroke',
        },
        size: {
            control: 'radio',
            options: ['sm', 'default', 'lg', 'xl'] satisfies SizePreset[],
            description:
                '`sm` = 12px (w-3 h-3), `default` = 24px (w-6 h-6), `lg` = 32px (w-8 h-8), `xl` = 48px (w-12 h-12)',
        },
        className: { table: { disable: true } },
        ref: { table: { disable: true } },
    },
    render: ({ size, ...props }) => <StarIcon {...props} className={SIZE_CLASSES[size]} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

/**
 * Solid rating-color star at default size. Drive every other variant from
 * the Controls panel:
 *
 *   - `opacity: 0` + `filled: true` → unfilled appearance (white fill,
 *     border-subtle stroke). Replaces the old `UnfilledStar` story
 *   - `opacity: 0.5` + `filled: true` → partial fill via left-to-right
 *     gradient (`url(#…)` fill). Replaces `PartialStar`
 *   - `filled: false` → unfilled (white fill, border-subtle stroke;
 *     opacity ignored)
 *   - `size: 'sm'` / `'default'` / `'lg'` / `'xl'` → size variants used in
 *     production (replaces the multi-star `SizeVariations` grid)
 */
export const Default: Story = {
    args: {
        opacity: 1,
        filled: true,
        size: 'lg',
    },
};
