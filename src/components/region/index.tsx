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
import { Suspense, type HTMLAttributes, type ReactNode } from 'react';
import { Await } from 'react-router';
import { Component } from './component';
import { RegionWrapper } from './region-wrapper';
import type { ShopperExperience } from '@/scapi';
import {
    PageDesignerPageMetadataProvider,
    useRegionContext,
    usePageDesignerMode,
} from '@salesforce/storefront-next-runtime/design/react/core';
import type {
    ComponentDecoratorProps,
    PageDecoratorProps,
    RegionDesignMetadata,
} from '@salesforce/storefront-next-runtime/design/react';
import { ComponentDataProvider, useComponentData } from './component-data-context';

export type { RegionDesignMetadata };

// Page shape accepted by `<Region page={...}>`. Aligns with `PageWithComponentData`
// returned by `fetchPageWithComponentData` — the SCAPI `Page` type plus an
// optional `componentData` map. Decorator metadata (`PageDesignMetadata`) is
// accessed through a cast at the use site, since SCAPI's generated `Page` types
// `designMetadata` as `Record<string, never>` while the runtime payload follows
// the `PageDesignMetadata` shape.
type PageWithDesignMetadata = ShopperExperience.schemas['Page'] & {
    componentData?: Record<string, Promise<unknown>>;
};

// Props when rendering a page-level region
interface PageRegionProps extends HTMLAttributes<HTMLDivElement> {
    page: Promise<PageWithDesignMetadata | null> | PageWithDesignMetadata | null;
    component?: never;
    regionId: string;
    fallbackElement?: ReactNode;
    errorElement?: ReactNode;
    fallbackOnEmpty?: boolean;
}

export type ComponentType = ComponentDecoratorProps<ShopperExperience.schemas['Component']>;

// Props when rendering a component-level region (nested)
interface ComponentRegionProps extends HTMLAttributes<HTMLDivElement> {
    page?: never;
    component: ComponentType;
    regionId: string;
    fallbackElement?: ReactNode;
    errorElement?: ReactNode;
    fallbackOnEmpty?: boolean;
}

// Discriminated union
export type RegionProps = PageRegionProps | ComponentRegionProps;

// Helper: Extract design metadata from region definition
function getDesignMetadata(regionId: string, metadata?: RegionDesignMetadata) {
    return {
        id: regionId,
        componentTypeExclusions: metadata?.componentTypeExclusions ?? [],
        componentTypeInclusions: metadata?.componentTypeInclusions ?? [],
    };
}

// Helper: Render region wrapper with components
function renderRegionContent(
    region: ShopperExperience.schemas['Region'],
    regionId: string,
    metadata: RegionDesignMetadata | undefined,
    className: string | undefined,
    rest: HTMLAttributes<HTMLDivElement>,
    errorElement?: ReactNode,
    isDesignMode?: boolean
) {
    // In MRT (not design mode), return errorElement for empty regions
    const hasComponents = (region.components?.length ?? 0) > 0;
    if (!hasComponents && !isDesignMode) {
        return errorElement ?? null;
    }

    return (
        <RegionWrapper
            region={region}
            designMetadata={getDesignMetadata(regionId, metadata)}
            className={className}
            {...rest}>
            {region.components?.map((comp) => {
                const typedComp = comp as ComponentType;
                const key = typedComp.contentLinkUuid ?? typedComp.id;
                return typedComp.id && <Component key={key} component={typedComp} regionId={region.id} />;
            })}
        </RegionWrapper>
    );
}

/**
 * Region - Renders a Page Designer region from Salesforce's ShopperExperience API data
 *
 * This component supports two distinct modes via a discriminated union:
 *
 * 1. **Page Mode** - For route-level regions:
 *    ```tsx
 *    <Region page={loaderData.page} regionId="main" fallbackElement={<Skeleton />} />
 *    ```
 *    - Accepts page (Promise<PageWithComponentData> or PageWithComponentData)
 *    - Wraps in Suspense for async loading; renders synchronously when the page is already resolved
 *    - Provides ComponentDataContext at page level
 *    - Registers PageDesignerPageMetadataProvider for root regions
 *
 * 2. **Component Mode** - For nested regions in layout components:
 *    ```tsx
 *    <Region component={component} regionId="main" errorElement={children} />
 *    ```
 *    - Accepts component (ShopperExperience.schemas['Component'])
 *    - Synchronous rendering (no Suspense overhead)
 *    - Inherits ComponentDataContext from parent
 *    - No PageDesignerPageMetadataProvider (only for page-level)
 *
 * Key Functionality:
 * - TypeScript enforces you pass EITHER page OR component, never both
 * - Finds the region by ID within the page or component
 * - Renders all components within the region using the Component wrapper
 * - Supports region-specific fallback and error elements
 * - Handles metadata for component type inclusions/exclusions
 *
 * Use Case: Foundational component in Salesforce's Page Designer system for rendering
 * regions that can contain multiple components managed through the Page Designer interface.
 */
export function Region(props: RegionProps) {
    const { regionId, className, errorElement = <></>, fallbackElement = <></>, fallbackOnEmpty, ...rest } = props;
    const regionContext = useRegionContext();
    const existingComponentData = useComponentData();
    const { isDesignMode } = usePageDesignerMode();

    // COMPONENT MODE: Rendering a component-level region (nested)
    if (props.component !== undefined) {
        const region = props.component.regions?.find((r) => r.id === regionId);
        if (!region || (fallbackOnEmpty && !region.components?.length)) {
            return errorElement ?? null;
        }

        const metadata = props.component.designMetadata?.regionDefinitions?.find((r) => r.id === regionId);
        return renderRegionContent(region, regionId, metadata, className, rest);
    }

    // PAGE MODE: Rendering a page-level region
    const renderResolvedPage = (resolvedPage: PageWithDesignMetadata | null) => {
        if (!resolvedPage) {
            return errorElement ?? null;
        }

        const region = resolvedPage.regions?.find((r) => r.id === regionId);
        if (!region || (fallbackOnEmpty && !region.components?.length)) {
            return errorElement ?? null;
        }

        // SCAPI types `designMetadata` as `Record<string, never>` but the runtime
        // payload follows `PageDesignMetadata` — cast through `unknown` so we can
        // read `regionDefinitions`.
        const designMetadata = resolvedPage.designMetadata as
            | { regionDefinitions?: RegionDesignMetadata[] }
            | undefined;
        const metadata = designMetadata?.regionDefinitions?.find((r) => r.id === regionId);
        const { componentData: pageComponentData, ...pageData } = resolvedPage;

        const content = (
            <>
                {!regionContext && (
                    <PageDesignerPageMetadataProvider
                        page={pageData as PageDecoratorProps<ShopperExperience.schemas['Page']>}
                    />
                )}
                {renderRegionContent(region, regionId, metadata, className, rest, errorElement, isDesignMode)}
            </>
        );

        // Provide ComponentDataContext at page level only
        if (pageComponentData && !existingComponentData) {
            return <ComponentDataProvider value={pageComponentData}>{content}</ComponentDataProvider>;
        }

        return content;
    };

    // When props.page is already resolved, render synchronously and skip Suspense entirely.
    if (props.page instanceof Promise) {
        return (
            <Suspense fallback={fallbackElement}>
                <Await resolve={props.page} errorElement={errorElement}>
                    {renderResolvedPage}
                </Await>
            </Suspense>
        );
    }

    return renderResolvedPage(props.page);
}

// Re-export RegionWrapper for direct usage if needed
export { RegionWrapper } from './region-wrapper';
export type { RegionRendererProps } from './region-wrapper';

// Re-export component data context utilities
// oxlint-disable-next-line react-refresh/only-export-components
export { ComponentDataProvider, useComponentData, useComponentDataById } from './component-data-context';
export type { ComponentDataMap } from './component-data-context';
