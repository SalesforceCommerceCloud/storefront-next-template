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
import { Grid } from '../index';

function renderItems(count: number, variant: 'muted' | 'card' = 'muted') {
    const itemClass =
        variant === 'card' ? 'bg-white p-4 rounded shadow text-sm' : 'bg-muted p-4 rounded text-center text-sm';
    return Array.from({ length: count }, (_, i) => (
        <div key={i} className={itemClass}>
            Item {i + 1}
        </div>
    ));
}

const meta: Meta<typeof Grid> = {
    title: 'Core/Data Display/Grid',
    component: Grid,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'A layout grid based on Radix UI Themes. Supports 1–6 columns plus column gap, max-width, container/vertical alignment, and background styling. Used in Page Designer as `Layout.grid`.',
            },
        },
    },
    // Only props that visibly drive the canvas are exposed as controls.
    // Page Designer plumbing (regionId/component/designMetadata/data) and
    // ReactNode props (children) are hidden — the stories supply concrete
    // children via a render function that respects `columns`.
    argTypes: {
        columns: {
            control: 'radio',
            options: ['1', '2', '3', '4', '5', '6'],
            description: 'Number of columns (1–6)',
            table: { defaultValue: { summary: '1' } },
        },
        columnGap: {
            control: 'select',
            options: ['0', '1', '2', '3', '4', '6', '8', '12', '16'],
            description: 'Spacing between columns (Tailwind gap-* token)',
            table: { defaultValue: { summary: '4' } },
        },
        maxWidth: {
            control: 'select',
            options: ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'],
            description: 'Maximum width of the grid container',
            table: { defaultValue: { summary: 'full' } },
        },
        containerAlign: {
            control: 'radio',
            options: ['start', 'center', 'end'],
            description: 'Horizontal alignment of the grid container within its parent',
            table: { defaultValue: { summary: 'start' } },
        },
        verticalAlignment: {
            control: 'select',
            options: ['start', 'center', 'end', 'stretch', 'baseline'],
            description: 'Vertical alignment of grid items',
            table: { defaultValue: { summary: 'stretch' } },
        },
        backgroundGradient: {
            control: 'select',
            options: ['none', 'light', 'dark', 'blue', 'purple'],
            description: 'Gradient background applied to the grid container',
            table: { defaultValue: { summary: 'none' } },
        },
        backgroundBlur: {
            control: 'select',
            options: ['none', 'sm', 'md', 'lg', 'xl'],
            description: 'Backdrop blur intensity',
            table: { defaultValue: { summary: 'none' } },
        },
        flow: {
            control: 'select',
            options: ['row', 'col', 'dense', 'row-dense', 'col-dense'],
            description: 'CSS grid auto-flow',
            table: { defaultValue: { summary: 'row' } },
        },
        display: {
            control: 'radio',
            options: ['grid', 'inline-grid', 'none'],
            description: 'Display mode',
            table: { defaultValue: { summary: 'grid' } },
        },
        // `className` is utility-class noise — Designer-Friendly Input Rule.
        className: { control: false, table: { disable: true } },
        // Hidden: ReactNode and Page Designer internals.
        children: { control: false, table: { disable: true } },
        as: { control: false, table: { disable: true } },
        p: { control: false, table: { disable: true } },
        px: { control: false, table: { disable: true } },
        py: { control: false, table: { disable: true } },
        regionId: { control: false, table: { disable: true } },
        component: { control: false, table: { disable: true } },
        designMetadata: { control: false, table: { disable: true } },
        data: { control: false, table: { disable: true } },
    },
    args: {
        columns: '3',
        columnGap: '4',
        maxWidth: 'full',
        containerAlign: 'start',
        verticalAlignment: 'stretch',
        backgroundGradient: 'none',
        backgroundBlur: 'none',
        flow: 'row',
        display: 'grid',
    },
};

export default meta;
type Story = StoryObj<typeof Grid>;

/**
 * Default 3-column grid. The controls panel drives every visible style —
 * change `columns`, `columnGap`, `maxWidth`, etc. and the canvas reflects
 * the result immediately.
 */
export const Default: Story = {
    render: (args) => <Grid {...args}>{renderItems(Number(args.columns ?? '3'))}</Grid>,
};

/**
 * Page Designer-style hero grid — 4 columns with a purple gradient,
 * centered with `maxWidth="2xl"`. Demonstrates how the styling props
 * compose into a polished layout.
 */
export const Featured: Story = {
    args: {
        columns: '4',
        columnGap: '6',
        maxWidth: '2xl',
        containerAlign: 'center',
        backgroundGradient: 'purple',
        className: 'p-8',
    },
    render: (args) => <Grid {...args}>{renderItems(Number(args.columns ?? '4'), 'card')}</Grid>,
};
