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
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EmbeddedComponentRegion } from './embedded-component-region';
import { ComponentDataProvider, useComponentData } from './component-data-context';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';

// Mock the inner Component wrapper so the test focuses on Region+Embedded glue,
// not on the per-component data flow (covered separately in component.test.tsx).
// The mock probes ComponentDataContext so tests can assert which provider is active.
const componentDataProbe = vi.fn();
vi.mock('./component', () => ({
    Component: ({ component }: { component: { id: string; typeId: string } }) => {
        componentDataProbe(useComponentData());
        return <div data-testid={`component-${component.id}`}>{component.typeId}</div>;
    },
}));

vi.mock('./region-wrapper', () => ({
    RegionWrapper: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        className ? <div className={className}>{children}</div> : <>{children}</>,
}));

vi.mock('@salesforce/storefront-next-runtime/design/react/core', () => ({
    useRegionContext: vi.fn(() => ({})),
    usePageDesignerMode: vi.fn(() => ({ isDesignMode: false })),
    PageDesignerPageMetadataProvider: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
    EmbeddedSubtreeProvider: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

const mockComponent: ComponentWithComponentData = {
    id: 'header-component',
    typeId: 'header',
    regions: [
        {
            id: 'announcement',
            components: [{ id: 'banner-1', typeId: 'announcementBanner' }],
        },
    ],
} as unknown as ComponentWithComponentData;

describe('EmbeddedComponentRegion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        componentDataProbe.mockReset();
    });

    describe('synchronous (resolved) component', () => {
        it('renders the requested region from a resolved component', () => {
            render(<EmbeddedComponentRegion component={mockComponent} regionId="announcement" />);
            expect(screen.getByTestId('component-banner-1')).toBeInTheDocument();
        });

        it('renders nothing when component is undefined (slot not configured)', () => {
            const { container } = render(<EmbeddedComponentRegion component={undefined} regionId="announcement" />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders errorElement when component is null', () => {
            render(
                <EmbeddedComponentRegion
                    component={null}
                    regionId="announcement"
                    errorElement={<div data-testid="error">missing</div>}
                />
            );
            expect(screen.getByTestId('error')).toBeInTheDocument();
        });

        it('renders errorElement when the requested region is missing', () => {
            render(
                <EmbeddedComponentRegion
                    component={mockComponent}
                    regionId="not-a-region"
                    errorElement={<div data-testid="error">missing</div>}
                />
            );
            expect(screen.getByTestId('error')).toBeInTheDocument();
        });
    });

    describe('streamed (Promise) component', () => {
        it('shows fallbackElement while pending, then renders the resolved region', async () => {
            const promise = Promise.resolve(mockComponent);

            render(
                <EmbeddedComponentRegion
                    component={promise}
                    regionId="announcement"
                    fallbackElement={<div data-testid="fallback">loading</div>}
                />
            );

            expect(screen.getByTestId('fallback')).toBeInTheDocument();

            await waitFor(() => {
                expect(screen.getByTestId('component-banner-1')).toBeInTheDocument();
            });
            expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
        });

        it('renders no fallback by default while pending', () => {
            // Never resolves — keeps Suspense pending so we can assert the empty default
            const promise = new Promise<ComponentWithComponentData | null>(() => {});

            const { container } = render(<EmbeddedComponentRegion component={promise} regionId="announcement" />);

            expect(container).toBeEmptyDOMElement();
        });

        it('renders errorElement when the promise resolves to null', async () => {
            const promise = Promise.resolve(null);

            render(
                <EmbeddedComponentRegion
                    component={promise}
                    regionId="announcement"
                    errorElement={<div data-testid="error">no component</div>}
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });
        });

        it('renders errorElement when the promise rejects', async () => {
            const promise = Promise.reject(new Error('fetch failed'));

            render(
                <EmbeddedComponentRegion
                    component={promise}
                    regionId="announcement"
                    errorElement={<div data-testid="error">failed</div>}
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('error')).toBeInTheDocument();
            });
        });
    });

    describe('ComponentDataProvider integration', () => {
        it("installs ComponentDataProvider with the embedded component's componentData", () => {
            const innerData = { 'banner-1': Promise.resolve('inner') };
            const componentWithData = {
                ...mockComponent,
                componentData: innerData,
            } as unknown as ComponentWithComponentData;

            render(<EmbeddedComponentRegion component={componentWithData} regionId="announcement" />);

            expect(screen.getByTestId('component-banner-1')).toBeInTheDocument();
            expect(componentDataProbe).toHaveBeenCalledWith(innerData);
        });

        it('does not install a provider when the component carries no componentData', () => {
            render(<EmbeddedComponentRegion component={mockComponent} regionId="announcement" />);

            expect(componentDataProbe).toHaveBeenCalledWith(undefined);
        });

        it('defers to an outer ComponentDataProvider when one is already present', () => {
            const outerData = { sentinel: Promise.resolve('outer') };
            const componentWithData = {
                ...mockComponent,
                componentData: { 'banner-1': Promise.resolve('inner') },
            } as unknown as ComponentWithComponentData;

            render(
                <ComponentDataProvider value={outerData}>
                    <EmbeddedComponentRegion component={componentWithData} regionId="announcement" />
                </ComponentDataProvider>
            );

            // Inner component sees the OUTER provider's data, not the embedded one.
            // This preserves promise-identity stability when embeds are nested.
            expect(componentDataProbe).toHaveBeenCalledWith(outerData);
        });
    });
});
