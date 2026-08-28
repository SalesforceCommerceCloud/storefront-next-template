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
import { useMemo, Suspense, type HTMLAttributes, type ReactNode } from 'react';
import { Await } from 'react-router';
import { Component } from './component';
import { RegionWrapper } from './region-wrapper';
import type { ShopperExperience } from '@/scapi';
import {
    PageDesignerPageMetadataProvider,
    useRegionContext,
    usePageDesignerMode,
    useDesignContext,
} from '@salesforce/storefront-next-runtime/design/react/core';
import type {
    ComponentDecoratorProps,
    PageDecoratorProps,
    RegionDesignMetadata,
} from '@salesforce/storefront-next-runtime/design/react';
import { ComponentDataProvider, useComponentData } from './component-data-context';
import { collectClientComponentData } from '@/lib/page-designer/collect-component-data.client';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { CriticalComponentProvider } from './critical-component-context';
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

// Props when rendering a page-level region
interface PageRegionProps extends HTMLAttributes<HTMLDivElement> {
    page: Promise<PageWithDesignMetadata | null> | PageWithDesignMetadata | null;
    component?: never;
    regionId: string;
    fallbackElement?: ReactNode;
    errorElement?: ReactNode;
    fallbackOnEmpty?: boolean;
    /** Block the initial shell on this region's modules and emit their browser resource hints. */
    critical?: boolean;
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

// Collects client-loader component data for the live page's target region.
// Called unconditionally at the top level of `Region` (like `useDesignContext`)
// so the hook count stays stable across component/page modes — the caller merges
// the result onto the resolved page's own component data.
function useLiveComponentData(
    livePage: ShopperExperience.schemas['Page'] | null,
    regionId: string,
    locale: string | undefined
): PageWithDesignMetadata['componentData'] {
    return useMemo(() => {
        if (!livePage) return undefined;

        const region = livePage.regions?.find((r) => r.id === regionId);
        if (!region) return undefined;

        const data: Record<string, Promise<unknown>> = {};

        collectClientComponentData({ locale }, [region], data);

        return data;
    }, [livePage, regionId, locale]);
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
 *    - Wraps non-critical regions in Suspense for async page and module loading
 *    - With `critical`, prepares nested component modules and lets suspension reach the outer boundary
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
 * - Preloads modules and styles for page-level regions marked as critical
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
    // Null when not in design mode
    const designContext = useDesignContext();
    const config = useConfig();
    // If the live preview feature is off or this is a component region, return null.
    const livePage =
        config.features.livePreview && !props.component ? (designContext?.pageDesignerConfig?.page ?? null) : null;
    const liveLocale = designContext?.pageDesignerConfig?.locale;
    // Client-loader data for the live page. Kept at the top level (not inside the
    // render closure below) so the hook count is stable across both render modes.
    // Returns null if there is no live page.
    const liveComponentData = useLiveComponentData(livePage, regionId, liveLocale);

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
        return renderRegionContent(region, regionId, metadata, className, rest, undefined, isDesignMode);
    }

    // PAGE MODE: Rendering a page-level region
    const renderResolvedPage = (resolvedPage: PageWithDesignMetadata | null) => {
        const effectivePage = livePage
            ? {
                  ...livePage,
                  // Merge the client-collected live data over the resolved page's
                  // own component data so nested/streamed data still resolves.
                  componentData: { ...resolvedPage?.componentData, ...liveComponentData },
              }
            : resolvedPage;

        if (!effectivePage) {
            return errorElement ?? null;
        }

        const region = effectivePage.regions?.find((r) => r.id === regionId);
        if (!region || (fallbackOnEmpty && !region.components?.length)) {
            return errorElement ?? null;
        }

        // SCAPI types `designMetadata` as `Record<string, never>` but the runtime
        // payload follows `PageDesignMetadata` — cast through `unknown` so we can
        // read `regionDefinitions`.
        const designMetadata = effectivePage.designMetadata as
            | { regionDefinitions?: RegionDesignMetadata[] }
            | undefined;
        const metadata = designMetadata?.regionDefinitions?.find((r) => r.id === regionId);
        const { componentData: pageComponentData, ...pageData } = effectivePage;
        const criticalComponentIds = critical ? prepareCriticalRegion(region) : [];

        let content = (
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
            content = <ComponentDataProvider value={pageComponentData}>{content}</ComponentDataProvider>;
        }

        if (criticalComponentIds.length) {
            content = <CriticalComponentProvider value={criticalComponentIds}>{content}</CriticalComponentProvider>;
        }

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
