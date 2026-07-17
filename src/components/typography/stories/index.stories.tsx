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

import { Typography } from '../index';

const meta: Meta<typeof Typography> = {
    title: 'Design System/UI/Typography',
    component: Typography,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'A comprehensive typography component with multiple variants for headings, body text, and product-specific text styles. Supports semantic HTML elements and custom styling.',
            },
        },
    },
    tags: ['autodocs'],
    argTypes: {
        variant: {
            description: 'Typography variant style',
            control: 'select',
            options: [
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
                'p',
                'blockquote',
                'inline-code',
                'lead',
                'large',
                'small',
                'muted',
                'product-title',
                'product-price',
                'product-description',
                'recommendation-title',
            ],
        },
        align: {
            description: 'Text alignment',
            control: 'select',
            options: ['left', 'center', 'right'],
        },
        as: {
            description: 'HTML element to render as',
            control: 'select',
            options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'blockquote', 'code'],
        },
        asChild: {
            description: 'Render as child component using Slot',
            control: 'boolean',
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
        children: {
            description: 'Text content',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof Typography>;

/**
 * All heading and text variants in one composite — useful as a visual
 * showcase / snapshot baseline. Replaces the separate per-variant stories
 * by demonstrating every supported `variant` value at once.
 */
export const AllVariants: Story = {
    render: () => (
        <div className="space-y-6">
            <Typography variant="h1">Heading 1</Typography>
            <Typography variant="h2">Heading 2</Typography>
            <Typography variant="h3">Heading 3</Typography>
            <Typography variant="h4">Heading 4</Typography>
            <Typography variant="h5">Heading 5</Typography>
            <Typography variant="h6">Heading 6</Typography>
            <Typography variant="p">Paragraph text with regular styling.</Typography>
            <Typography variant="lead">Lead paragraph with larger text.</Typography>
            <Typography variant="large">Large text</Typography>
            <Typography variant="small">Small text</Typography>
            <Typography variant="muted">Muted text</Typography>
            <Typography variant="blockquote">Blockquote</Typography>
            <Typography variant="inline-code">inline code</Typography>
            <Typography variant="product-title">Product Title</Typography>
            <Typography variant="product-price">$29.99</Typography>
            <Typography variant="product-description">Product description text</Typography>
            <Typography variant="recommendation-title">Recommendation title</Typography>
        </div>
    ),
    parameters: {
        docs: {
            description: {
                story: 'All typography variants: headings h1-h6, paragraph, lead, large, small, muted, blockquote, inline-code, and product variants.',
            },
        },
    },
};

/**
 * Controls-driven playground — exercise any combination of `variant`,
 * `align`, `as`, and `children`. Replaces the dedicated `CenterAligned`,
 * `RightAligned`, and `CustomElement` stories that each varied a single
 * prop.
 */
export const Playground: Story = {
    args: {
        variant: 'h2',
        align: 'left',
        children: 'Edit me from the Controls panel',
    },
    parameters: {
        docs: {
            description: {
                story: 'Use the Controls panel to combine `variant`, `align`, `as`, and `children`. Examples worth trying: `variant: h3` + `align: right`, or `variant: h3` + `as: div` to render an h3 style as a non-heading element.',
            },
        },
    },
};

/**
 * Demonstrates `asChild` (Radix Slot pattern): the Typography styling is
 * applied to the inner `<button>` element instead of wrapping it. Pairs
 * Typography with an interactive element so the merging-class behavior is
 * visible in the canvas.
 */
export const AsChildButton: Story = {
    render: () => (
        <Typography variant="h4" asChild>
            <button
                type="button"
                className="px-4 py-2 bg-primary text-primary-foreground rounded"
                data-testid="typography-button">
                Typography Button
            </button>
        </Typography>
    ),
};
