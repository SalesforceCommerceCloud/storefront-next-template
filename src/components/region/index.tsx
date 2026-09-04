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
import { CriticalRegionProvider, useIsInCriticalRegion } from './critical-component-context';
import { prepareCriticalRegion } from '@/lib/page-designer/critical-region';

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

interface PageRegionPropsBase extends HTMLAttributes<HTMLDivElement> {
    component?: never;
    regionId: string;
    fallbackElement?: ReactNode;
    errorElement?: ReactNode;
    fallbackOnEmpty?: boolean;
}

// A critical region must be available in the synchronous shell. Its boundary-free component
// markers form the client hydration barrier and therefore cannot arrive in a later segment.
interface CriticalPageRegionProps extends PageRegionPropsBase {
    page: PageWithDesignMetadata | null;
    critical: true;
}

interface NonCriticalPageRegionProps extends PageRegionPropsBase {
    page: Promise<PageWithDesignMetadata | null> | PageWithDesignMetadata | null;
    critical?: false;
}

type PageRegionProps = CriticalPageRegionProps | NonCriticalPageRegionProps;

export type ComponentType = ComponentDecoratorProps<ShopperExperience.schemas['Component']>;

// Props when rendering a component-level region (nested)
interface ComponentRegionProps extends HTMLAttributes<HTMLDivElement> {
    page?: never;
    component: ComponentType;
    regionId: string;
    fallbackElement?: ReactNode;
    errorElement?: ReactNode;
    fallbackOnEmpty?: boolean;
    critical?: never;
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
    isDesignMode?: boolean,
    critical = false
) {
    // In MRT (not design mode), return errorElement for empty regions
    const hasComponents = (region.components?.length ?? 0) > 0;
    if (!hasComponents && !isDesignMode) {
        return errorElement ?? null;
    }

    // Prepare one actually rendered region at a time. A conditional nested region never reaches
    // this point, so its declared payload does not cause unused component modules to be imported.
    if (import.meta.env.SSR && critical) prepareCriticalRegion(region);

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
 *    - Wraps non-critical page promises in a region-level Suspense boundary
 *    - With `critical`, prepares direct component modules as each region is actually rendered
 *    - Provides ComponentDataContext at page level
 *    - Registers PageDesignerPageMetadataProvider for root regions
 *
 * 2. **Component Mode** - For nested regions in layout components:
 *    ```tsx
 *    <Region component={component} regionId="main" errorElement={children} />
 *    ```
 *    - Accepts component (ShopperExperience.schemas['Component'])
 *    - Synchronous region lookup; each child owns its component-local Suspense boundary
 *    - Inherits ComponentDataContext from parent
 *    - No PageDesignerPageMetadataProvider (only for page-level)
 *
 * Key Functionality:
 * - TypeScript enforces you pass EITHER page OR component, never both
 * - Finds the region by ID within the page or component
 * - Renders all components within the region using the Component wrapper
 * - Supports region-specific fallback and error elements
 * - Emits module and style hints for every rendered region
 * - Handles metadata for component type inclusions/exclusions
 *
 * Use Case: Foundational component in Salesforce's Page Designer system for rendering
 * regions that can contain multiple components managed through the Page Designer interface.
 */
export function Region(props: RegionProps) {
    const {
        regionId,
        className,
        errorElement = <></>,
        fallbackElement = <></>,
        fallbackOnEmpty,
        critical,
        ...rest
    } = props;
    const regionContext = useRegionContext();
    const existingComponentData = useComponentData();
    const { isDesignMode } = usePageDesignerMode();
    const isInCriticalRegion = useIsInCriticalRegion();

    // COMPONENT MODE: Rendering a component-level region (nested)
    if (props.component !== undefined) {
        const region = props.component.regions?.find((r) => r.id === regionId);
        if (!region || (fallbackOnEmpty && !region.components?.length)) {
            return errorElement ?? null;
        }

        const metadata = props.component.designMetadata?.regionDefinitions?.find((r) => r.id === regionId);
        // Forward `isDesignMode` so an *empty* nested region still renders its droppable
        // `RegionWrapper` in Page Designer — matching page mode below. Without this, an empty
        // component-mode region returned null even in design mode, so it never registered as a drop
        // target (e.g. a Grid column with no content yet). `errorElement` stays `undefined` here to
        // preserve the prior live-storefront behavior exactly: an empty component-mode region on the
        // storefront (`!isDesignMode`) still renders nothing, as before.
        return renderRegionContent(
            region,
            regionId,
            metadata,
            className,
            rest,
            undefined,
            isDesignMode,
            isInCriticalRegion
        );
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
        let content = (
            <>
                {!regionContext && (
                    <PageDesignerPageMetadataProvider
                        page={pageData as PageDecoratorProps<ShopperExperience.schemas['Page']>}
                    />
                )}
                {renderRegionContent(
                    region,
                    regionId,
                    metadata,
                    className,
                    rest,
                    errorElement,
                    isDesignMode,
                    Boolean(critical)
                )}
            </>
        );

        // Provide ComponentDataContext at page level only
        if (pageComponentData && !existingComponentData) {
            content = <ComponentDataProvider value={pageComponentData}>{content}</ComponentDataProvider>;
        }

        if (critical) content = <CriticalRegionProvider>{content}</CriticalRegionProvider>;

        return content;
    };

    const regionContent =
        props.page instanceof Promise ? (
            <Await resolve={props.page} errorElement={errorElement}>
                {renderResolvedPage}
            </Await>
        ) : (
            renderResolvedPage(props.page)
        );

    // A critical region owns the shell-blocking boundary. Let both the page
    // request and module registration suspend to the nearest outer boundary.
    if (critical) return regionContent;

    // Keep the same boundary around non-critical regions on the server and client. A lazy component
    // module may suspend while its SSR markup is being hydrated; the dehydrated boundary lets React
    // retain that server content until the client module is ready.
    return <Suspense fallback={fallbackElement}>{regionContent}</Suspense>;
}

// Re-export RegionWrapper for direct usage if needed
export { RegionWrapper } from './region-wrapper';
export type { RegionRendererProps } from './region-wrapper';

// Re-export component data context utilities
// oxlint-disable-next-line react-refresh/only-export-components
export { ComponentDataProvider, useComponentData, useComponentDataById } from './component-data-context';
export type { ComponentDataMap } from './component-data-context';
