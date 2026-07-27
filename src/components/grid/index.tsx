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
import { type ComponentPropsWithoutRef, type CSSProperties, type ReactNode, forwardRef } from 'react';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import { cn } from '@/lib/utils';
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';
import { type ComponentType, Region } from '@/components/region';

// Based on Radix UI Themes Grid component API
// Reference: https://www.radix-ui.com/themes/docs/components/grid

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('grid', {
    name: 'Grid',
    description: 'A flexible grid layout component for organizing content in columns',
    group: 'Layout',
})
@RegionDefinition([
    {
        id: 'column_1',
        name: 'Column 1',
    },
    {
        id: 'column_2',
        name: 'Column 2',
    },
    {
        id: 'column_3',
        name: 'Column 3',
    },
    {
        id: 'column_4',
        name: 'Column 4',
    },
    {
        id: 'column_5',
        name: 'Column 5',
    },
    {
        id: 'column_6',
        name: 'Column 6',
    },
])
// oxlint-disable-next-line react/only-export-components -- oxlint flags the co-exported Page Designer metadata class; eslint-plugin-react-refresh does not
export class GridMetadata {
    @AttributeDefinition({
        description: 'Number of columns in the grid (1-6)',
        type: 'enum',
        values: ['1', '2', '3', '4', '5', '6'],
        defaultValue: '1',
    })
    columns?: string;

    @AttributeDefinition({
        id: 'maxWidth',
        name: 'Max Width',
        description: 'Maximum width of the grid container',
        type: 'enum',
        values: ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'],
        defaultValue: 'full',
    })
    maxWidth?: string;

    @AttributeDefinition({
        id: 'containerAlign',
        name: 'Container Alignment',
        description: 'Horizontal alignment of the grid container within its parent',
        type: 'enum',
        values: ['start', 'center', 'end'],
        defaultValue: 'start',
    })
    containerAlign?: string;

    @AttributeDefinition({
        id: 'columnGap',
        name: 'Column Gap',
        description: 'Space between columns',
        type: 'enum',
        values: ['0', '1', '2', '3', '4', '6', '8', '12', '16'],
        defaultValue: '4',
    })
    columnGap?: string;

    @AttributeDefinition({
        id: 'verticalAlignment',
        name: 'Vertical Alignment',
        description: 'Vertical alignment of grid items',
        type: 'enum',
        values: ['start', 'center', 'end', 'stretch', 'baseline'],
        defaultValue: 'stretch',
    })
    verticalAlignment?: string;

    @AttributeDefinition({
        id: 'backgroundGradient',
        name: 'Background Gradient',
        description: 'Gradient background effect',
        type: 'enum',
        values: ['none', 'light', 'dark', 'blue', 'purple'],
        defaultValue: 'none',
    })
    backgroundGradient?: string;

    @AttributeDefinition({
        id: 'backgroundBlur',
        name: 'Background Blur',
        description: 'Blur effect intensity',
        type: 'enum',
        values: ['none', 'sm', 'md', 'lg', 'xl'],
        defaultValue: 'none',
    })
    backgroundBlur?: string;
}
/* v8 ignore stop */

type GridFlow = 'row' | 'col' | 'dense' | 'row-dense' | 'col-dense';

interface GridProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
    as?: 'div' | 'span';
    display?: 'none' | 'grid' | 'inline-grid';
    columns?: string;
    flow?: GridFlow;

    // Layout props
    p?: string;
    px?: string;
    py?: string;
    children?: ReactNode;

    // Page Designer attributes
    maxWidth?: string;
    containerAlign?: string;
    columnGap?: string;
    verticalAlignment?: string;
    backgroundGradient?: string;
    backgroundBlur?: string;

    // Page Designer props (need to be extracted to avoid passing to DOM)
    regionId?: string;
    component?: ComponentType;
    designMetadata?: ComponentDesignMetadata;
    data?: unknown;
}

// Mapping functions
const columnsMap: Record<string, string> = {
    '1': 'grid-cols-1',
    '2': 'grid-cols-2',
    '3': 'grid-cols-3',
    '4': 'grid-cols-4',
    '5': 'grid-cols-5',
    '6': 'grid-cols-6',
};

const flowMap: Record<GridFlow, string> = {
    row: 'grid-flow-row',
    col: 'grid-flow-col',
    dense: 'grid-flow-dense',
    'row-dense': 'grid-flow-row-dense',
    'col-dense': 'grid-flow-col-dense',
};

const maxWidthMap: Record<string, string> = {
    none: '',
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full',
};

const alignMap: Record<string, string> = {
    start: 'mx-0',
    center: 'mx-auto',
    end: 'ml-auto',
};

const columnGapMap: Record<string, string> = {
    '0': 'gap-0',
    '1': 'gap-1',
    '2': 'gap-2',
    '3': 'gap-3',
    '4': 'gap-4',
    '6': 'gap-6',
    '8': 'gap-8',
    '12': 'gap-12',
    '16': 'gap-16',
};

const verticalAlignmentMap: Record<string, string> = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
    baseline: 'items-baseline',
};

const backgroundGradientMap: Record<string, string> = {
    none: '',
    light: 'bg-gradient-to-br from-white to-gray-100',
    dark: 'bg-gradient-to-br from-gray-800 to-gray-900',
    blue: 'bg-gradient-to-br from-blue-500 to-blue-700',
    purple: 'bg-gradient-to-br from-purple-500 to-purple-700',
};

const backgroundBlurMap: Record<string, string> = {
    none: '',
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
};

const Grid = forwardRef<HTMLDivElement, GridProps>(
    (
        {
            as: ComponentElement = 'div',
            className,
            display = 'grid',
            columns = '1',
            flow = 'row',
            p,
            px,
            py,
            maxWidth = 'full',
            containerAlign = 'start',
            columnGap = '4',
            verticalAlignment = 'stretch',
            backgroundGradient = 'none',
            backgroundBlur = 'none',
            style,
            children,
            regionId: _regionId,
            component,
            designMetadata: _designMetadata,
            data: _data,
            ...props
        },
        ref
    ) => {
        // Build grid styles
        const gridStyles: CSSProperties = { ...style };

        // Support for column numbers from 1 to 6
        const columnsNum: string = Number(columns) > 0 && Number(columns) < 7 ? columns : '1';
        const numColumns = Number(columnsNum);

        // Build class names
        const classes = cn(
            // Display
            typeof display === 'string'
                ? display === 'grid'
                    ? 'grid'
                    : display === 'inline-grid'
                      ? 'inline-grid'
                      : ''
                : '',

            // Columns
            columns && columnsMap[columnsNum],

            // Flow
            flow && flowMap[flow],

            // Max Width
            maxWidth && maxWidthMap[maxWidth],

            // Container Alignment
            containerAlign && alignMap[containerAlign],

            // Column Gap
            columnGap && columnGapMap[columnGap],

            // Vertical Alignment
            verticalAlignment && verticalAlignmentMap[verticalAlignment],

            // Background Gradient
            backgroundGradient && backgroundGradientMap[backgroundGradient],

            // Background Blur
            backgroundBlur && backgroundBlurMap[backgroundBlur],

            // Padding
            Number(p) > 0 && `p-${p}`,
            Number(px) > 0 && `px-${px}`,
            Number(py) > 0 && `py-${py}`,

            className
        );

        // Page Designer mode: Render dynamic regions based on column count
        if (component) {
            // Generate region IDs based on column count (column_1, column_2, etc.)
            const regionIds = Array.from({ length: numColumns }, (_, i) => `column_${i + 1}`);

            return (
                <ComponentElement ref={ref} className={classes} style={gridStyles} data-slot="grid" {...props}>
                    {regionIds.map((regionId) => (
                        <Region
                            key={regionId}
                            regionId={regionId}
                            component={component}
                            errorElement={null}
                            className="w-full"
                        />
                    ))}
                </ComponentElement>
            );
        }

        // Standalone mode: Render children directly
        return (
            <ComponentElement ref={ref} className={classes} style={gridStyles} data-slot="grid" {...props}>
                {children}
            </ComponentElement>
        );
    }
);

Grid.displayName = 'Grid';

export { Grid };
export type { GridProps };
export default Grid;
