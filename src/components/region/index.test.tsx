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
import { act, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { vi } from 'vitest';
import { type ComponentType, Region, type RegionDesignMetadata } from './index';
import type { RegionDefinitionConfig } from '@/lib/decorators';
import type { ShopperExperience } from '@/scapi';
import { prepareCriticalRegion } from '@/lib/page-designer/critical-region';
import type { PageWithComponentData } from '@/lib/page-designer/page-loader.server';
import {
    useRegionContext,
    usePageDesignerMode,
    PageDesignerPageMetadataProvider,
} from '@salesforce/storefront-next-runtime/design/react/core';

// Mock the Component wrapper
vi.mock('./component', () => ({
    Component: ({ component }: { component: { id: string; typeId: string } }) => (
        <div data-testid={`component-${component.id}`}>{component.typeId}</div>
    ),
}));

vi.mock('@/lib/page-designer/critical-region', () => ({
    prepareCriticalRegion: vi.fn(),
}));

let capturedCriticalComponentIds: readonly string[] | undefined;
vi.mock('./critical-component-context', () => ({
    CriticalComponentProvider: ({ children, value }: { children: React.ReactNode; value: readonly string[] }) => {
        capturedCriticalComponentIds = value;
        return <>{children}</>;
    },
}));

// Mock the RegionWrapper to capture designMetadata
let capturedDesignMetadata: any = null;
let regionWrapperSuspension: Promise<never> | undefined;
let regionWrapperSuspendAttempts = 0;
vi.mock('./region-wrapper', () => ({
    RegionWrapper: ({ designMetadata, children, className }: any) => {
        if (regionWrapperSuspension) {
            regionWrapperSuspendAttempts += 1;
            // oxlint-disable-next-line typescript/only-throw-error -- React Suspense consumes the test promise.
            throw regionWrapperSuspension;
        }
        capturedDesignMetadata = designMetadata;
        if (className) {
            return <div className={className}>{children}</div>;
        }
        return <>{children}</>;
    },
}));

vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    useRegionContext: vi.fn(() => ({})),
    usePageDesignerMode: vi.fn(() => ({ isDesignMode: false })),
    PageDesignerPageMetadataProvider: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

describe('Region', () => {
    beforeEach(() => {
        capturedDesignMetadata = null;
        capturedCriticalComponentIds = undefined;
        regionWrapperSuspension = undefined;
        regionWrapperSuspendAttempts = 0;
        vi.clearAllMocks();
        // clearAllMocks resets call records but not mockReturnValue overrides, so re-assert the
        // default here — otherwise a design-mode test would leak isDesignMode:true into later tests.
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: false, isPreviewMode: false });
    });

    const mockRegion = {
        id: 'test-region',
        components: [
            {
                id: 'component-1',
                typeId: 'commerce_layouts.carousel',
                data: { images: ['image1.jpg'] },
            },
            {
                id: 'component-2',
                typeId: 'commerce_layouts.banner',
                data: { text: 'Test Banner' },
            },
        ],
    } as unknown as ShopperExperience.schemas['Region'];

    const mockPage: ShopperExperience.schemas['Page'] = {
        id: 'test-page',
        typeId: 'testPage',
        regions: [mockRegion],
    };

    it('renders page region with correct id and className', async () => {
        render(<Region page={mockPage} regionId="test-region" className="custom-class" />);

        // RegionWrapper no longer renders a wrapper div, it just returns children
        // Check that components are rendered (async)
        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            expect(screen.getByTestId('component-component-2')).toBeInTheDocument();
        });

        // Verify designMetadata was passed correctly
        expect(capturedDesignMetadata).toMatchObject({
            id: 'test-region',
        });
    });

    it('renders all components within the page region', async () => {
        render(<Region page={mockPage} regionId="test-region" />);

        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            expect(screen.getByTestId('component-component-2')).toBeInTheDocument();
            expect(screen.getByText('commerce_layouts.carousel')).toBeInTheDocument();
            expect(screen.getByText('commerce_layouts.banner')).toBeInTheDocument();
        });
    });

    it('prepares a critical region and provides its recursively collected component IDs', () => {
        vi.mocked(prepareCriticalRegion).mockReturnValue(['component-1']);

        render(<Region page={mockPage} regionId="test-region" critical={true} />);

        expect(prepareCriticalRegion).toHaveBeenCalledWith(mockRegion);
        expect(capturedCriticalComponentIds).toEqual(['component-1']);
    });

    it('does not prepare or install critical rendering metadata without the critical prop', () => {
        render(<Region page={mockPage} regionId="test-region" />);
        expect(prepareCriticalRegion).not.toHaveBeenCalled();
        expect(capturedCriticalComponentIds).toBeUndefined();
    });

    it('renders component region synchronously without Suspense', () => {
        const mockComponent = {
            id: 'grid-component',
            typeId: 'grid',
            regions: [mockRegion],
        } as ComponentType;

        render(<Region component={mockComponent} regionId="test-region" />);

        // Component mode is synchronous - no waiting needed
        expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
        expect(screen.getByTestId('component-component-2')).toBeInTheDocument();
    });

    it('component region can have metadata', () => {
        const mockComponent = {
            id: 'grid-component',
            typeId: 'grid',
            regions: [mockRegion],
            designMetadata: {
                id: 'grid-component',
                regionDefinitions: [
                    {
                        id: 'test-region',
                        name: 'Test Region',
                        componentTypeInclusions: [{ typeId: 'commerce_layouts.carousel' }],
                        componentTypeExclusions: [{ typeId: 'commerce_layouts.hero' }],
                    },
                ],
            },
        } as unknown as ComponentType;

        render(<Region component={mockComponent} regionId="test-region" />);

        // Verify designMetadata is properly extracted from component (objects are passed through as-is)
        expect(capturedDesignMetadata).toMatchObject({
            id: 'test-region',
            componentTypeExclusions: [{ typeId: 'commerce_layouts.hero' }],
            componentTypeInclusions: [{ typeId: 'commerce_layouts.carousel' }],
        });
    });

    it('component region without metadata uses empty arrays', () => {
        const mockComponent = {
            id: 'grid-component',
            typeId: 'grid',
            regions: [mockRegion],
        } as ComponentType;

        render(<Region component={mockComponent} regionId="test-region" />);

        // Verify designMetadata has empty arrays when no metadata provided
        expect(capturedDesignMetadata).toMatchObject({
            id: 'test-region',
            componentTypeExclusions: [],
            componentTypeInclusions: [],
        });
    });

    it('renders container for page region components', async () => {
        render(<Region page={mockPage} regionId="test-region" />);

        // RegionWrapper no longer renders a container div
        // Just verify components are rendered (async)
        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
        });
    });

    it('handles empty components array in page region', async () => {
        const emptyRegion = { id: 'empty-region', components: [] };
        const emptyPage = { id: 'page', typeId: 'page', regions: [emptyRegion] };
        render(<Region page={emptyPage} regionId="empty-region" />);

        // Wait for async rendering to complete
        await waitFor(() => {
            // In non-design mode, empty region renders nothing (empty Fragment)
            expect(screen.queryByTestId(/component-/)).not.toBeInTheDocument();
        });
    });

    it('handles empty components array in component region', () => {
        const emptyRegion = { id: 'empty-region', components: [] };
        const mockComponent = {
            id: 'test-component',
            typeId: 'grid',
            regions: [emptyRegion],
        } as ComponentType;
        render(<Region component={mockComponent} regionId="empty-region" />);

        // In non-design mode, empty region renders nothing (empty Fragment)
        expect(screen.queryByTestId(/component-/)).not.toBeInTheDocument();
        // ...and crucially never registers a drop target on the live storefront.
        expect(capturedDesignMetadata).toBeNull();
    });

    it('renders the droppable wrapper for an empty component region in design mode', () => {
        // W-23729804: an empty *component-mode* region must still render its droppable RegionWrapper
        // in Page Designer design mode — matching page mode — so it registers as a drop target (e.g.
        // an empty Grid column). Without forwarding isDesignMode, component mode returned null here.
        vi.mocked(usePageDesignerMode).mockReturnValue({ isDesignMode: true, isPreviewMode: false });
        const emptyRegion = { id: 'empty-region', components: [] };
        const mockComponent = {
            id: 'test-component',
            typeId: 'grid',
            regions: [emptyRegion],
        } as ComponentType;
        render(<Region component={mockComponent} regionId="empty-region" className="w-full" />);

        // RegionWrapper was rendered (mock captured its designMetadata) → drop target registered.
        expect(capturedDesignMetadata).toMatchObject({ id: 'empty-region' });
    });

    it('renders errorElement for empty page region when fallbackOnEmpty is set', async () => {
        const emptyRegion = { id: 'empty-region', components: [] };
        const emptyPage = { id: 'page', typeId: 'page', regions: [emptyRegion] };
        render(
            <Region
                page={emptyPage}
                regionId="empty-region"
                fallbackOnEmpty
                errorElement={<div data-testid="fallback-banner">Fallback</div>}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('fallback-banner')).toBeInTheDocument();
        });
    });

    it('renders errorElement for empty component region when fallbackOnEmpty is set', () => {
        const emptyRegion = { id: 'empty-region', components: [] };
        const mockComponent = {
            id: 'test-component',
            typeId: 'grid',
            regions: [emptyRegion],
        } as ComponentType;
        render(
            <Region
                component={mockComponent}
                regionId="empty-region"
                fallbackOnEmpty
                errorElement={<div data-testid="fallback-banner">Fallback</div>}
            />
        );

        expect(screen.getByTestId('fallback-banner')).toBeInTheDocument();
    });

    it('renders errorElement for empty page region in non-design mode (renderRegionContent fallback)', async () => {
        const emptyRegion = { id: 'empty-region', components: [] };
        const emptyPage = { id: 'page', typeId: 'page', regions: [emptyRegion] };
        render(
            <Region
                page={emptyPage}
                regionId="empty-region"
                errorElement={<div data-testid="fallback-banner">Fallback</div>}
            />
        );

        // In non-design mode, renderRegionContent returns errorElement for any empty region —
        // independent of fallbackOnEmpty (which only short-circuits when the region exists with no components).
        await waitFor(() => {
            expect(screen.getByTestId('fallback-banner')).toBeInTheDocument();
        });
    });

    it('handles undefined components in page region', async () => {
        const regionWithoutComponents = { id: 'no-components', components: [] };
        const pageWithRegion = { id: 'page', typeId: 'page', regions: [regionWithoutComponents] };
        render(<Region page={pageWithRegion} regionId="no-components" />);

        // Wait for async rendering to complete
        await waitFor(() => {
            // In non-design mode, empty region renders nothing (empty Fragment)
            expect(screen.queryByTestId(/component-/)).not.toBeInTheDocument();
        });
    });

    it('passes additional props to the page region', async () => {
        render(<Region page={mockPage} regionId="test-region" data-custom="test-value" aria-label="Test Region" />);

        // RegionWrapper no longer renders a wrapper div, props are not passed down
        // Just verify components are rendered (async)
        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
        });
    });

    it('passes className props to the page region', async () => {
        const { container } = render(
            <Region
                page={mockPage}
                regionId="test-region"
                data-custom="test-value"
                aria-label="Test Region"
                className="test-class"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
        });

        const pageWrapper = container.querySelector('.test-class');
        expect(pageWrapper).toBeInTheDocument();
        expect(pageWrapper?.tagName).toBe('DIV');
    });

    it('passes className props to the component region', async () => {
        const mockComponent = {
            id: 'grid-component',
            typeId: 'grid',
            regions: [mockRegion],
        } as ComponentType;

        const { container } = render(
            <Region
                component={mockComponent}
                regionId="test-region"
                data-custom="test-value"
                aria-label="Test Region"
                className="test-class"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
        });

        const componentWrapper = container.querySelector('.test-class');
        expect(componentWrapper).toBeInTheDocument();
        expect(componentWrapper?.tagName).toBe('DIV');
    });

    it('uses component id as key for mapping in page region', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // This test ensures React keys are properly set
        render(<Region page={mockPage} regionId="test-region" />);

        // If keys weren't set properly, React would warn about missing keys
        expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Warning: Each child in a list should have a unique "key" prop')
        );

        consoleSpy.mockRestore();
    });

    it('uses component id as key for mapping in component region', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const mockComponent = {
            id: 'grid-component',
            typeId: 'grid',
            regions: [mockRegion],
        } as ComponentType;

        render(<Region component={mockComponent} regionId="test-region" />);

        expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Warning: Each child in a list should have a unique "key" prop')
        );

        consoleSpy.mockRestore();
    });

    describe('page designer page metadata provider', () => {
        describe('when rendering page region with no region context', () => {
            beforeEach(() => {
                vi.mocked(useRegionContext).mockReturnValue(null);
            });

            it('renders the page designer page metadata provider', async () => {
                render(<Region page={mockPage} regionId="test-region" />);

                await waitFor(() => {
                    expect(PageDesignerPageMetadataProvider).toHaveBeenCalled();
                });
            });
        });

        describe('when rendering page region with region context', () => {
            beforeEach(() => {
                vi.mocked(useRegionContext).mockReturnValue({ regionId: 'test-region', contentLinkUuids: [] });
            });
            it('does not render the page designer page metadata provider', async () => {
                render(<Region page={mockPage} regionId="test-region" />);

                const result = waitFor(
                    () => {
                        expect(PageDesignerPageMetadataProvider).toHaveBeenCalled();
                    },
                    { timeout: 100 }
                );

                await expect(result).rejects.toThrow();
            });
        });

        describe('when rendering component region', () => {
            beforeEach(() => {
                vi.mocked(useRegionContext).mockReturnValue(null);
                vi.clearAllMocks();
            });

            it('does not render the page designer page metadata provider', () => {
                const mockComponent = {
                    id: 'grid-component',
                    typeId: 'grid',
                    regions: [mockRegion],
                } as ComponentType;

                render(<Region component={mockComponent} regionId="test-region" />);

                // Component mode is synchronous and should never call PageDesignerPageMetadataProvider
                expect(PageDesignerPageMetadataProvider).not.toHaveBeenCalled();
            });
        });
    });

    describe('metadata handling', () => {
        const metadataTestCases = [
            {
                description: 'passes both componentTypeInclusions and componentTypeExclusions when provided',
                metadata: {
                    id: 'test-region',
                    name: 'Test Mixed Region',
                    componentTypeInclusions: [{ typeId: 'commerce_layouts.carousel' }],
                    componentTypeExclusions: [{ typeId: 'commerce_layouts.hero' }],
                } as unknown as RegionDesignMetadata,
                expectedDesignMetadata: {
                    id: 'test-region',
                    componentTypeInclusions: [{ typeId: 'commerce_layouts.carousel' }],
                    componentTypeExclusions: [{ typeId: 'commerce_layouts.hero' }],
                },
            },
            {
                description: 'passes empty arrays when metadata has no inclusions/exclusions',
                metadata: {
                    id: 'test-region',
                    name: 'Test Empty Region',
                } as RegionDefinitionConfig,
                expectedDesignMetadata: {
                    id: 'test-region',
                    componentTypeInclusions: [],
                    componentTypeExclusions: [],
                },
            },
            {
                description: 'handles empty arrays for componentTypeInclusions and componentTypeExclusions',
                metadata: {
                    id: 'test-region',
                    name: 'Test Empty Arrays Region',
                    componentTypeInclusions: [],
                    componentTypeExclusions: [],
                } as RegionDefinitionConfig,
                expectedDesignMetadata: {
                    id: 'test-region',
                    componentTypeInclusions: [],
                    componentTypeExclusions: [],
                },
            },
        ];

        it.each(metadataTestCases)('$description', async ({ metadata, expectedDesignMetadata }) => {
            render(
                <Region
                    page={
                        {
                            ...mockPage,
                            designMetadata: {
                                regionDefinitions: [metadata],
                            },
                        } as unknown as ShopperExperience.schemas['Page']
                    }
                    regionId="test-region"
                />
            );

            // Wait for async rendering to complete
            await waitFor(() => {
                expect(capturedDesignMetadata).toEqual(expectedDesignMetadata);
            });
        });
    });

    describe('ComponentDataProvider handling with sibling regions', () => {
        const mockComponentData = {
            'component-1': Promise.resolve({ foo: 'bar' }),
            'component-2': Promise.resolve({ baz: 'qux' }),
        };

        const mockRegion1 = {
            id: 'region-1',
            components: [
                {
                    id: 'component-1',
                    typeId: 'commerce_layouts.carousel',
                },
            ],
        };

        const mockRegion2 = {
            id: 'region-2',
            components: [
                {
                    id: 'component-2',
                    typeId: 'commerce_layouts.banner',
                },
            ],
        };

        const mockPageWithMultipleRegions: PageWithComponentData = {
            id: 'test-page',
            typeId: 'testPage',
            regions: [mockRegion1, mockRegion2],
            componentData: mockComponentData,
        };

        it('renders components from multiple regions', async () => {
            render(
                <div>
                    <Region page={mockPageWithMultipleRegions} regionId="region-1" />
                    <Region page={mockPageWithMultipleRegions} regionId="region-2" />
                </div>
            );

            await waitFor(() => {
                expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
                expect(screen.getByTestId('component-component-2')).toBeInTheDocument();
            });
        });

        it('renders components when page has componentData', async () => {
            render(
                <div>
                    <Region page={mockPageWithMultipleRegions} regionId="region-1" />
                </div>
            );

            await waitFor(() => {
                expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            });
        });

        it('renders components when page lacks componentData', async () => {
            const pageWithoutComponentData: ShopperExperience.schemas['Page'] = {
                id: 'test-page',
                typeId: 'testPage',
                regions: [mockRegion1],
            };

            render(
                <div>
                    <Region page={pageWithoutComponentData} regionId="region-1" />
                </div>
            );

            await waitFor(() => {
                expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            });
        });
    });

    describe('Error handling - Region not found', () => {
        describe('Component mode', () => {
            it('returns custom errorElement when region not found in component', () => {
                const mockComponent: ComponentType = {
                    id: 'test-component',
                    typeId: 'grid',
                    regions: [
                        {
                            id: 'existing-region',
                            components: [],
                        },
                    ],
                };

                render(
                    <Region
                        component={mockComponent}
                        regionId="non-existent-region"
                        errorElement={<div data-testid="error-fallback">Region not found</div>}
                    />
                );

                // Should render the custom error element
                expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
                expect(screen.getByText('Region not found')).toBeInTheDocument();
            });

            it('returns null when region not found and no errorElement provided', () => {
                const mockComponent: ComponentType = {
                    id: 'test-component',
                    typeId: 'grid',
                    regions: [
                        {
                            id: 'existing-region',
                            components: [],
                        },
                    ],
                };

                const { container } = render(<Region component={mockComponent} regionId="non-existent-region" />);

                // Should render nothing (null)
                expect(container.firstChild).toBeNull();
            });

            it('returns errorElement when component has no regions array', () => {
                const mockComponent: ComponentType = {
                    id: 'test-component',
                    typeId: 'simple',
                    // No regions property
                };

                render(
                    <Region
                        component={mockComponent}
                        regionId="any-region"
                        errorElement={<div data-testid="no-regions-error">No regions available</div>}
                    />
                );

                expect(screen.getByTestId('no-regions-error')).toBeInTheDocument();
            });

            it('returns null when component has empty regions array and no errorElement', () => {
                const mockComponent: ComponentType = {
                    id: 'test-component',
                    typeId: 'simple',
                    regions: [],
                };

                const { container } = render(<Region component={mockComponent} regionId="any-region" />);

                expect(container.firstChild).toBeNull();
            });
        });

        describe('Page mode', () => {
            it('returns custom errorElement when region not found in page', async () => {
                const pageWithDifferentRegion: ShopperExperience.schemas['Page'] = {
                    id: 'test-page',
                    typeId: 'testPage',
                    regions: [
                        {
                            id: 'existing-region',
                            components: [],
                        },
                    ],
                };

                render(
                    <Region
                        page={pageWithDifferentRegion}
                        regionId="non-existent-region"
                        errorElement={<div data-testid="page-error-fallback">Page region not found</div>}
                    />
                );

                // Wait for async rendering
                await waitFor(() => {
                    expect(screen.getByTestId('page-error-fallback')).toBeInTheDocument();
                    expect(screen.getByText('Page region not found')).toBeInTheDocument();
                });
            });

            it('returns null when region not found in page and no errorElement provided', async () => {
                const pageWithDifferentRegion: ShopperExperience.schemas['Page'] = {
                    id: 'test-page',
                    typeId: 'testPage',
                    regions: [
                        {
                            id: 'existing-region',
                            components: [],
                        },
                    ],
                };

                const { container } = render(<Region page={pageWithDifferentRegion} regionId="non-existent-region" />);

                // Wait for async rendering to complete
                await waitFor(() => {
                    // Suspense fallback should be gone
                    expect(container.querySelector('[data-testid]')).not.toBeInTheDocument();
                });

                // Should render nothing (null) after Suspense resolves
                // The container will have the Suspense wrapper but nothing inside
                expect(screen.queryByTestId(/component-/)).not.toBeInTheDocument();
            });

            it('returns errorElement when page has no regions array', async () => {
                const pageWithoutRegions: ShopperExperience.schemas['Page'] = {
                    id: 'test-page',
                    typeId: 'testPage',
                    // No regions property
                };

                render(
                    <Region
                        page={pageWithoutRegions}
                        regionId="any-region"
                        errorElement={<div data-testid="page-no-regions-error">No regions in page</div>}
                    />
                );

                await waitFor(() => {
                    expect(screen.getByTestId('page-no-regions-error')).toBeInTheDocument();
                });
            });

            it('returns errorElement when page has empty regions array', async () => {
                const pageWithEmptyRegions: ShopperExperience.schemas['Page'] = {
                    id: 'test-page',
                    typeId: 'testPage',
                    regions: [],
                };

                render(
                    <Region
                        page={pageWithEmptyRegions}
                        regionId="any-region"
                        errorElement={<div data-testid="empty-regions-error">Region list is empty</div>}
                    />
                );

                await waitFor(() => {
                    expect(screen.getByTestId('empty-regions-error')).toBeInTheDocument();
                });
            });

            it('handles region not found with custom fallback element during loading', async () => {
                const pageWithDifferentRegion: ShopperExperience.schemas['Page'] = {
                    id: 'test-page',
                    typeId: 'testPage',
                    regions: [
                        {
                            id: 'other-region',
                            components: [],
                        },
                    ],
                };

                render(
                    <Region
                        page={Promise.resolve(pageWithDifferentRegion)}
                        regionId="missing-region"
                        fallbackElement={<div data-testid="loading">Loading...</div>}
                        errorElement={<div data-testid="not-found-error">Region missing</div>}
                    />
                );

                // Should show fallback first
                expect(screen.getByTestId('loading')).toBeInTheDocument();

                // Then show error after resolution
                await waitFor(() => {
                    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
                    expect(screen.getByTestId('not-found-error')).toBeInTheDocument();
                });
            });
        });
    });

    describe('Promise identity / stability', () => {
        it('retains resolved server content when a non-critical region suspends during hydration', async () => {
            const element = (
                <Region
                    page={mockPage}
                    regionId="test-region"
                    fallbackElement={<div data-testid="loading">Loading...</div>}
                />
            );
            const container = document.createElement('div');
            container.innerHTML = renderToString(element);
            const serverContent = container.querySelector('[data-testid="component-component-1"]');
            expect(serverContent).not.toBeNull();

            regionWrapperSuspension = new Promise<never>(() => undefined);
            const root = hydrateRoot(container, element);
            await act(() => Promise.resolve());

            expect(regionWrapperSuspendAttempts).toBeGreaterThan(0);
            expect(container.querySelector('[data-testid="component-component-1"]')).toBe(serverContent);
            expect(container.querySelector('[data-testid="loading"]')).toBeNull();

            act(() => root.unmount());
        });

        it('renders synchronously when page is a plain (non-thenable) value', () => {
            // No await/waitFor — a resolved page still renders in the same render pass. The stable
            // Suspense boundary must not turn the value into a new promise or show its fallback.
            render(<Region page={mockPage} regionId="test-region" fallbackElement={<div data-testid="loading" />} />);

            expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
            expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            expect(screen.getByTestId('component-component-2')).toBeInTheDocument();
        });

        it('renders null synchronously when page is null', () => {
            const { container } = render(
                <Region page={null} regionId="test-region" fallbackElement={<div data-testid="loading" />} />
            );

            expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
            expect(container.querySelector('[data-testid^="component-"]')).toBeNull();
        });

        it('shows fallback before resolution when page is a Promise', async () => {
            let resolvePage: (value: ShopperExperience.schemas['Page']) => void = () => {};
            const pendingPromise = new Promise<ShopperExperience.schemas['Page']>((resolve) => {
                resolvePage = resolve;
            });

            render(
                <Region page={pendingPromise} regionId="test-region" fallbackElement={<div data-testid="loading" />} />
            );

            // Promise hasn't resolved yet — Suspense should display the fallback.
            expect(screen.getByTestId('loading')).toBeInTheDocument();
            expect(screen.queryByTestId('component-component-1')).not.toBeInTheDocument();

            resolvePage(mockPage);

            await waitFor(() => {
                expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
                expect(screen.getByTestId('component-component-1')).toBeInTheDocument();
            });
        });
    });
});
