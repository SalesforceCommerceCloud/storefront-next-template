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

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Grid } from './index';

// Mock decorators (minimal mocking to avoid testing them)
vi.mock('@/lib/decorators/component', () => ({
    Component: () => (target: any) => target,
}));

vi.mock('@/lib/decorators', () => ({
    RegionDefinition: () => (target: any) => target,
}));

vi.mock('@/lib/decorators/attribute-definition', () => ({
    AttributeDefinition: () => () => {},
}));

vi.mock('@/components/region', () => ({
    Region: ({ regionId, className }: { regionId: string; className?: string }) => (
        <div data-testid={`region-${regionId}`} className={className}>
            Region: {regionId}
        </div>
    ),
}));

// The instructional empty state is gated to Page Designer design mode. Default to false (live
// storefront) so the bulk of the suite exercises the shopper-facing render; individual empty-state
// tests flip this to true.
let mockIsDesignMode = false;
vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    usePageDesignerMode: () => ({ isDesignMode: mockIsDesignMode }),
}));

describe('Grid Component', () => {
    beforeEach(() => {
        mockIsDesignMode = false;
    });

    describe('Basic Rendering', () => {
        it('should render with children', () => {
            render(
                <Grid data-testid="grid">
                    <div>Child 1</div>
                    <div>Child 2</div>
                </Grid>
            );

            const grid = screen.getByTestId('grid');
            expect(grid).toBeInTheDocument();
            expect(grid.children).toHaveLength(2);
        });

        it('should render as div by default', () => {
            render(<Grid data-testid="grid">Content</Grid>);
            const grid = screen.getByTestId('grid');
            expect(grid.tagName).toBe('DIV');
        });

        it('should render as span when as="span"', () => {
            render(
                <Grid as="span" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.tagName).toBe('SPAN');
        });

        it('should have data-slot="grid" attribute', () => {
            render(<Grid data-testid="grid">Content</Grid>);
            const grid = screen.getByTestId('grid');
            expect(grid).toHaveAttribute('data-slot', 'grid');
        });

        it('should have grid class by default', () => {
            render(<Grid data-testid="grid">Content</Grid>);
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid');
        });
    });

    describe('Display Prop', () => {
        it('should apply grid class by default', () => {
            render(<Grid data-testid="grid">Content</Grid>);
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid');
        });

        it('should apply inline-grid when display="inline-grid"', () => {
            render(
                <Grid display="inline-grid" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('inline-grid');
        });
    });

    describe('Columns Prop', () => {
        // Test all valid column values (1-6)
        const validColumns = ['1', '2', '3', '4', '5', '6'] as const;

        validColumns.forEach((column) => {
            it(`should apply grid-cols-${column} for columns="${column}"`, () => {
                render(
                    <Grid columns={column} data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain(`grid-cols-${column}`);
            });
        });

        it('should handle columns outside range (defaults to grid-cols-1)', () => {
            render(
                <Grid columns="7" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid-cols-1');
        });

        it('should handle invalid columns string (defaults to grid-cols-1)', () => {
            render(
                <Grid columns="invalid" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid-cols-1');
        });
    });

    describe('Flow Prop', () => {
        // Test all flow values
        const flowValues = [
            { flow: 'row', class: 'grid-flow-row' },
            { flow: 'col', class: 'grid-flow-col' },
            { flow: 'dense', class: 'grid-flow-dense' },
            { flow: 'row-dense', class: 'grid-flow-row-dense' },
            { flow: 'col-dense', class: 'grid-flow-col-dense' },
        ] as const;

        flowValues.forEach(({ flow, class: className }) => {
            it(`should apply ${className} for flow="${flow}"`, () => {
                render(
                    <Grid flow={flow} data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain(className);
            });
        });
    });

    describe('Padding Props', () => {
        it('should apply p-4 for p="4"', () => {
            render(
                <Grid p="4" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('p-4');
        });

        it('should apply px-4 for px="4"', () => {
            render(
                <Grid px="4" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('px-4');
        });

        it('should apply py-2 for py="2"', () => {
            render(
                <Grid py="2" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('py-2');
        });

        it('should apply multiple padding classes', () => {
            render(
                <Grid px="4" py="2" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('px-4');
            expect(grid.className).toContain('py-2');
        });

        it('should not apply padding for "0"', () => {
            render(
                <Grid p="0" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).not.toContain('p-0');
        });

        it('should not apply padding for invalid values', () => {
            render(
                <Grid p="invalid" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).not.toContain('p-invalid');
        });
    });

    describe('Custom Props', () => {
        it('should accept custom className', () => {
            render(
                <Grid className="custom-class" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('custom-class');
        });

        it('should accept custom styles', () => {
            render(
                <Grid style={{ backgroundColor: 'red' }} data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.style.backgroundColor).toBe('red');
        });

        it('should forward DOM props', () => {
            render(
                <Grid id="test-id" aria-label="Test Grid" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid).toHaveAttribute('id', 'test-id');
            expect(grid).toHaveAttribute('aria-label', 'Test Grid');
        });

        it('should merge custom styles with component styles', () => {
            render(
                <Grid style={{ backgroundColor: 'red', color: 'white' }} data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.style.backgroundColor).toBe('red');
            expect(grid.style.color).toBe('white');
        });
    });

    describe('Combined Props', () => {
        it('should handle multiple props together', () => {
            render(
                <Grid columns="3" flow="row" p="4" className="custom" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid-cols-3');
            expect(grid.className).toContain('grid-flow-row');
            expect(grid.className).toContain('p-4');
            expect(grid.className).toContain('custom');
        });

        it('should handle all padding props together', () => {
            render(
                <Grid p="4" px="6" py="2" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('p-4');
            expect(grid.className).toContain('px-6');
            expect(grid.className).toContain('py-2');
        });

        it('should work with span element and props', () => {
            render(
                <Grid as="span" columns="2" flow="col" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.tagName).toBe('SPAN');
            expect(grid.className).toContain('grid-cols-2');
            expect(grid.className).toContain('grid-flow-col');
        });
    });

    describe('Ref Forwarding', () => {
        it('should forward ref to the DOM element', () => {
            const ref = { current: null as HTMLDivElement | null };
            render(
                <Grid ref={ref} data-testid="grid">
                    Content
                </Grid>
            );
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
            expect(ref.current).toBe(screen.getByTestId('grid'));
        });

        it('should forward ref to span element', () => {
            const ref = { current: null as HTMLSpanElement | null };
            render(
                <Grid as="span" ref={ref as any} data-testid="grid">
                    Content
                </Grid>
            );
            expect(ref.current).toBeInstanceOf(HTMLSpanElement);
        });
    });

    describe('Edge Cases', () => {
        it('should render with empty children', () => {
            render(<Grid data-testid="grid" />);
            const grid = screen.getByTestId('grid');
            expect(grid).toBeInTheDocument();
            expect(grid.children).toHaveLength(0);
        });

        it('should handle multiple children types', () => {
            render(
                <Grid data-testid="grid">
                    <div>Div</div>
                    <span>Span</span>
                    Text
                    {123}
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid).toBeInTheDocument();
            expect(grid.textContent).toContain('Div');
            expect(grid.textContent).toContain('Span');
            expect(grid.textContent).toContain('Text');
            expect(grid.textContent).toContain('123');
        });
    });

    describe('New Page Designer Attributes', () => {
        describe('Max Width', () => {
            it('should apply max-w-screen-lg for maxWidth="lg"', () => {
                render(
                    <Grid maxWidth="lg" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('max-w-screen-lg');
            });

            it('should apply max-w-full for maxWidth="full"', () => {
                render(
                    <Grid maxWidth="full" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('max-w-full');
            });

            it('should not apply max width class when maxWidth="none"', () => {
                render(
                    <Grid maxWidth="none" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).not.toContain('max-w-');
            });
        });

        describe('Container Alignment', () => {
            const alignments = [
                { value: 'start', class: 'mx-0' },
                { value: 'center', class: 'mx-auto' },
                { value: 'end', class: 'ml-auto' },
            ] as const;

            alignments.forEach(({ value, class: className }) => {
                it(`should apply ${className} for containerAlign="${value}"`, () => {
                    render(
                        <Grid containerAlign={value} data-testid="grid">
                            Content
                        </Grid>
                    );
                    const grid = screen.getByTestId('grid');
                    expect(grid.className).toContain(className);
                });
            });

            it('should center grid with maxWidth and containerAlign="center"', () => {
                render(
                    <Grid maxWidth="lg" containerAlign="center" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('max-w-screen-lg');
                expect(grid.className).toContain('mx-auto');
            });
        });

        describe('Column Gap', () => {
            const gapValues = ['0', '1', '2', '3', '4', '6', '8', '12', '16'] as const;

            gapValues.forEach((gap) => {
                it(`should apply gap-${gap} for columnGap="${gap}"`, () => {
                    render(
                        <Grid columnGap={gap} data-testid="grid">
                            Content
                        </Grid>
                    );
                    const grid = screen.getByTestId('grid');
                    expect(grid.className).toContain(`gap-${gap}`);
                });
            });
        });

        describe('Vertical Alignment', () => {
            const alignments = [
                { value: 'start', class: 'items-start' },
                { value: 'center', class: 'items-center' },
                { value: 'end', class: 'items-end' },
                { value: 'stretch', class: 'items-stretch' },
                { value: 'baseline', class: 'items-baseline' },
            ] as const;

            alignments.forEach(({ value, class: className }) => {
                it(`should apply ${className} for verticalAlignment="${value}"`, () => {
                    render(
                        <Grid verticalAlignment={value} data-testid="grid">
                            Content
                        </Grid>
                    );
                    const grid = screen.getByTestId('grid');
                    expect(grid.className).toContain(className);
                });
            });
        });

        describe('Background Gradient', () => {
            it('should apply gradient classes for backgroundGradient="light"', () => {
                render(
                    <Grid backgroundGradient="light" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('bg-gradient-to-br');
                expect(grid.className).toContain('from-white');
                expect(grid.className).toContain('to-gray-100');
            });

            it('should apply gradient classes for backgroundGradient="blue"', () => {
                render(
                    <Grid backgroundGradient="blue" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('bg-gradient-to-br');
                expect(grid.className).toContain('from-blue-500');
                expect(grid.className).toContain('to-blue-700');
            });

            it('should not apply gradient for backgroundGradient="none"', () => {
                render(
                    <Grid backgroundGradient="none" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).not.toContain('bg-gradient');
            });
        });

        describe('Background Blur', () => {
            const blurValues = [
                { value: 'sm', class: 'backdrop-blur-sm' },
                { value: 'md', class: 'backdrop-blur-md' },
                { value: 'lg', class: 'backdrop-blur-lg' },
                { value: 'xl', class: 'backdrop-blur-xl' },
            ] as const;

            blurValues.forEach(({ value, class: className }) => {
                it(`should apply ${className} for backgroundBlur="${value}"`, () => {
                    render(
                        <Grid backgroundBlur={value} data-testid="grid">
                            Content
                        </Grid>
                    );
                    const grid = screen.getByTestId('grid');
                    expect(grid.className).toContain(className);
                });
            });

            it('should not apply blur for backgroundBlur="none"', () => {
                render(
                    <Grid backgroundBlur="none" data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).not.toContain('backdrop-blur');
            });
        });

        describe('Combined New Attributes', () => {
            it('should handle multiple new attributes together', () => {
                render(
                    <Grid
                        columns="3"
                        maxWidth="lg"
                        containerAlign="center"
                        columnGap="8"
                        verticalAlignment="center"
                        backgroundGradient="purple"
                        backgroundBlur="md"
                        data-testid="grid">
                        Content
                    </Grid>
                );
                const grid = screen.getByTestId('grid');
                expect(grid.className).toContain('max-w-screen-lg');
                expect(grid.className).toContain('mx-auto');
                expect(grid.className).toContain('gap-8');
                expect(grid.className).toContain('items-center');
                expect(grid.className).toContain('from-purple-500');
                expect(grid.className).toContain('backdrop-blur-md');
            });
        });
    });

    describe('Page Designer Mode - Dynamic Regions', () => {
        const mockComponent = {
            id: 'test-grid',
            typeId: 'grid',
            regions: [
                { id: 'column_1', components: [] },
                { id: 'column_2', components: [] },
                { id: 'column_3', components: [] },
            ],
        } as any;

        // Test data for column counts 1-6
        const columnTestCases = [
            { columns: 1, description: 'single region' },
            { columns: 2, description: 'two regions' },
            { columns: 3, description: 'three regions' },
            { columns: 4, description: 'four regions' },
            { columns: 5, description: 'five regions' },
            { columns: 6, description: 'six regions' },
        ] as const;

        it.each(columnTestCases)('should render $description when columns="$columns"', ({ columns }) => {
            render(
                <Grid columns={String(columns)} component={mockComponent} data-testid="grid">
                    Fallback content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid).toBeInTheDocument();

            // Should have exactly N regions
            const regions = screen.getAllByTestId(/^region-column_/);
            expect(regions).toHaveLength(columns);

            // Assert each expected region exists
            for (let i = 1; i <= columns; i++) {
                expect(screen.getByTestId(`region-column_${i}`)).toBeInTheDocument();
            }

            // Assert unwanted regions don't exist
            for (let i = columns + 1; i <= 6; i++) {
                expect(screen.queryByTestId(`region-column_${i}`)).not.toBeInTheDocument();
            }
        });

        it('should apply grid-cols-3 class when rendering 3 regions', () => {
            render(
                <Grid columns="3" component={mockComponent} data-testid="grid">
                    Fallback content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid-cols-3');
        });

        it('should not render children when in Page Designer mode', () => {
            render(
                <Grid columns="2" component={mockComponent} data-testid="grid">
                    <div data-testid="child-content">This should not appear</div>
                </Grid>
            );

            // Children should not be rendered in Page Designer mode
            expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();

            // Only regions should be present
            expect(screen.getByTestId('region-column_1')).toBeInTheDocument();
            expect(screen.getByTestId('region-column_2')).toBeInTheDocument();
        });

        it('should combine Page Designer attributes with dynamic regions', () => {
            render(
                <Grid
                    columns="4"
                    maxWidth="xl"
                    columnGap="6"
                    verticalAlignment="start"
                    component={mockComponent}
                    data-testid="grid">
                    Fallback
                </Grid>
            );

            const grid = screen.getByTestId('grid');

            // Check that styling classes are applied
            expect(grid.className).toContain('grid-cols-4');
            expect(grid.className).toContain('max-w-screen-xl');
            expect(grid.className).toContain('gap-6');
            expect(grid.className).toContain('items-start');

            // Check that 4 regions are created
            const regions = screen.getAllByTestId(/^region-column_/);
            expect(regions).toHaveLength(4);
        });

        it('should render regions with w-full class only, not grid container classes', () => {
            render(
                <Grid columns="3" component={mockComponent} data-testid="grid">
                    Fallback
                </Grid>
            );

            const grid = screen.getByTestId('grid');

            // Grid container should have grid classes
            expect(grid.className).toContain('grid');
            expect(grid.className).toContain('grid-cols-3');

            // Regions should have w-full but NOT grid container classes
            const region1 = screen.getByTestId('region-column_1');
            const region2 = screen.getByTestId('region-column_2');
            const region3 = screen.getByTestId('region-column_3');

            // Each region should have w-full for full width within grid cell
            [region1, region2, region3].forEach((region) => {
                expect(region.className).toContain('w-full');
                // Regions should NOT be grid containers themselves
                expect(region.className).not.toContain('grid-cols');
                expect(region.className).not.toContain('gap-');
            });
        });
    });

    describe('Empty state (Page Designer authoring)', () => {
        const emptyComponent = {
            id: 'test-grid-empty',
            typeId: 'grid',
            regions: [
                { id: 'column_1', components: [] },
                { id: 'column_2', components: [] },
            ],
        } as any;

        const partiallyFilledComponent = {
            id: 'test-grid-partial',
            typeId: 'grid',
            regions: [
                { id: 'column_1', components: [] },
                { id: 'column_2', components: [{ id: 'some-component' }] },
            ],
        } as any;

        // The dashed column-outline styling applied to each column's Region in the empty state.
        const OUTLINE_CLASS = 'border-dashed';

        it('outlines every column Region in design mode when all columns are empty', () => {
            mockIsDesignMode = true;
            render(<Grid columns="2" component={emptyComponent} data-testid="grid" />);

            // W-23729804: in Page Designer design mode, a freshly-dropped Grid with no content in
            // any column shows the grid's column outlines (Figma "Fallback" spec). Crucially, the
            // outline is applied to each column's *Region* — not a standalone div — so every visible
            // column stays a real, droppable Page Designer target. The Regions remain mounted.
            const region1 = screen.getByTestId('region-column_1');
            const region2 = screen.getByTestId('region-column_2');
            expect(region1.className).toContain(OUTLINE_CLASS);
            expect(region2.className).toContain(OUTLINE_CLASS);
        });

        it('outlines a Region per column for the default column count', () => {
            mockIsDesignMode = true;
            // Figma default: Columns = 3. A freshly-dropped Grid with no columns prop configured
            // shows three outlined column Regions.
            const threeEmpty = {
                id: 'test-grid-3',
                typeId: 'grid',
                regions: [
                    { id: 'column_1', components: [] },
                    { id: 'column_2', components: [] },
                    { id: 'column_3', components: [] },
                ],
            } as any;
            render(<Grid component={threeEmpty} data-testid="grid" />);

            expect(screen.getByTestId('grid').className).toContain('grid-cols-3');
            const outlined = screen
                .getAllByTestId(/^region-column_/)
                .filter((r) => r.className.includes(OUTLINE_CLASS));
            expect(outlined).toHaveLength(3);
        });

        it('the outlined columns are droppable Regions, not decorative controls', () => {
            mockIsDesignMode = true;
            render(<Grid columns="2" component={emptyComponent} data-testid="grid" />);

            // The outlines are the Regions' own droppable surfaces — no focusable controls or links.
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(screen.getByTestId('region-column_1')).toBeInTheDocument();
            expect(screen.getByTestId('region-column_2')).toBeInTheDocument();
        });

        it('renders normal (non-outlined) regions in design mode when at least one column has content', () => {
            mockIsDesignMode = true;
            render(<Grid columns="2" component={partiallyFilledComponent} data-testid="grid" />);

            // A partially-filled grid is unaffected by design mode — no outline styling leaks in, and
            // both regions render normally so the merchant can keep filling in the rest.
            const region1 = screen.getByTestId('region-column_1');
            const region2 = screen.getByTestId('region-column_2');
            expect(region1.className).not.toContain(OUTLINE_CLASS);
            expect(region2.className).not.toContain(OUTLINE_CLASS);
            expect(region1.className).toContain('w-full');
        });

        it('renders normal (non-outlined) regions on the live storefront with all columns empty', () => {
            // Critical no-leak case: on the live storefront the Regions still render (they render
            // nothing per empty column internally), but never carry the authoring outline styling.
            render(<Grid columns="2" component={emptyComponent} data-testid="grid" />);

            const region1 = screen.getByTestId('region-column_1');
            const region2 = screen.getByTestId('region-column_2');
            expect(region1.className).not.toContain(OUTLINE_CLASS);
            expect(region2.className).not.toContain(OUTLINE_CLASS);
            expect(region1.className).toContain('w-full');
        });

        it('standalone mode (children, no component) is unchanged, even if design mode is forced on', () => {
            mockIsDesignMode = true;
            render(
                <Grid data-testid="grid">
                    <div data-testid="child-content">Child</div>
                </Grid>
            );

            const grid = screen.getByTestId('grid');
            expect(screen.getByTestId('child-content')).toBeInTheDocument();
            expect(grid.querySelector('[data-testid^="region-column_"]')).not.toBeInTheDocument();
        });
    });

    describe('Class Name Merging', () => {
        it('should properly merge built-in classes with custom className', () => {
            render(
                <Grid columns="3" className="p-8" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            expect(grid.className).toContain('grid');
            expect(grid.className).toContain('grid-cols-3');
            expect(grid.className).toContain('p-8');
        });

        it('should handle conflicting classes', () => {
            render(
                <Grid p="4" className="p-8" data-testid="grid">
                    Content
                </Grid>
            );
            const grid = screen.getByTestId('grid');
            // cn() from lib/utils should handle conflicting classes
            // className prop comes last, so p-8 should win
            expect(grid.className).toContain('p-8');
        });
    });
});
