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
import { EmbeddedSubtreeProvider } from '@salesforce/storefront-next-runtime/design/react/core';
import { Region, type ComponentType } from './index';
import { ComponentDataProvider, useComponentData } from './component-data-context';
import type { ComponentWithComponentData } from '@/lib/page-designer/component-loader.server';

type ResolvedEmbeddedComponent = ComponentWithComponentData | null;

export interface EmbeddedComponentRegionProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * The embedded component, streamed from a route loader. Accepts:
     * - a Promise (typical: streamed from `fetchComponentWithComponentData`)
     * - the resolved value
     * - undefined when no embedded component is configured for this slot (renders nothing)
     */
    component: ResolvedEmbeddedComponent | Promise<ResolvedEmbeddedComponent> | undefined;
    /** The region within the embedded component to render. */
    regionId: string;
    /**
     * Rendered while the component promise is pending. Defaults to nothing,
     * mirroring `<Region page={...}>` — once the component resolves, each
     * inner `<Component>` shows its own registry fallback for per-component
     * data via the typeId-driven lookup, so an outer fallback is rarely needed.
     */
    fallbackElement?: ReactNode;
    /** Rendered when the promise rejects or the component resolves to null. */
    errorElement?: ReactNode;
}

/**
 * Renders a single region from an **embedded** Page Designer component
 * (one fetched outside of a page context — e.g. the global header banner).
 *
 * Bridges `fetchComponentWithComponentData`'s output to `<Region>` by:
 * 1. Wrapping the streamed promise in Suspense + Await (sync paths skip this).
 * 2. Installing a `ComponentDataProvider` so embedded children can resolve their
 *    loader data via `useComponentDataById` — same pattern as `<Region page={...}>`.
 * 3. Delegating actual rendering to `<Region>`. Per-component Suspense
 *    fallbacks for inner data promises come from each component's registry
 *    fallback via the `<Component>` wrapper, so this layer doesn't reach into
 *    the registry itself.
 *
 * @example
 * ```tsx
 * <EmbeddedComponentRegion component={loaderData.headerComponent} regionId="announcement" />
 * ```
 */
export function EmbeddedComponentRegion({
    component,
    regionId,
    fallbackElement = <></>,
    errorElement,
    ...rest
}: EmbeddedComponentRegionProps) {
    if (component === undefined) return null;

    const renderResolved = (resolved: ResolvedEmbeddedComponent) => {
        if (!resolved) return errorElement ?? null;

        // The Page Designer design decorators render these children as static
        // content: an embedded owner lives outside the page, so its region and
        // children can't be selected / deleted / moved. EmbeddedSubtreeProvider
        // declares that to the SDK from the owner's own `embedded` flag — the
        // sole source of truth for embeddedness. No effect outside design mode.
        const region = (
            <EmbeddedSubtreeProvider embedded={resolved.embedded === true}>
                <Region
                    component={resolved as ComponentType}
                    regionId={regionId}
                    errorElement={errorElement}
                    {...rest}
                />
            </EmbeddedSubtreeProvider>
        );

        return resolved.componentData ? (
            <EmbeddedComponentDataProvider componentData={resolved.componentData}>
                {region}
            </EmbeddedComponentDataProvider>
        ) : (
            region
        );
    };

    if (component instanceof Promise) {
        return (
            <Suspense fallback={fallbackElement}>
                <Await resolve={component} errorElement={errorElement}>
                    {renderResolved}
                </Await>
            </Suspense>
        );
    }

    return renderResolved(component);
}

function EmbeddedComponentDataProvider({
    componentData,
    children,
}: {
    componentData: Record<string, Promise<unknown>>;
    children: ReactNode;
}) {
    const existing = useComponentData();
    if (existing) return <>{children}</>;
    return <ComponentDataProvider value={componentData}>{children}</ComponentDataProvider>;
}
