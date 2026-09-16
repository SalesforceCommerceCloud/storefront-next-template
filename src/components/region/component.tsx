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
import {
    Component as ReactComponent,
    type ErrorInfo,
    type ReactElement,
    type ReactNode,
    memo,
    Suspense,
    useEffect,
} from 'react';
import { registry } from '@/lib/page-designer/registry';
import { Await, useAsyncError } from 'react-router';
import { createLogger } from '@/lib/logger';
import { emitPageDesignerResourceHints } from '@/lib/page-designer/critical-region';

const logger = createLogger();
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import { useComponentDataById } from './component-data-context';
import {
    CriticalComponentHydrationMarker,
    useIsInCriticalRegion,
    useWasServerRendered,
} from './critical-component-context';
import type { ComponentType } from './index';

export interface ComponentProps {
    component: ComponentType;
    className?: string;
    regionId: string;
}

interface ResolvedComponentProps extends ComponentProps {
    data: unknown;
    designMetadata: ComponentDesignMetadata;
}

interface ComponentErrorBoundaryProps {
    children: ReactNode;
    componentId: string;
    componentTypeId: string;
    fallback: ReactNode;
}

interface ComponentErrorBoundaryState {
    error: Error | null;
}

/** Keep client-side Page Designer component failures local to the affected component. */
class ComponentErrorBoundary extends ReactComponent<ComponentErrorBoundaryProps, ComponentErrorBoundaryState> {
    state: ComponentErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        registry.clearRegistrationError(this.props.componentTypeId);
        logger.error(
            `Failed to render Page Designer component "${this.props.componentId}" (${this.props.componentTypeId})`,
            { error, errorInfo }
        );
    }

    render(): ReactNode {
        return this.state.error ? this.props.fallback : this.props.children;
    }
}

/**
 * Error handler component that logs component data loading errors and renders nothing.
 * Uses React Router's useAsyncError to access the error from the Await boundary.
 *
 * When a component's data fails to load (e.g., API error), we render nothing (null)
 * instead of showing a misleading skeleton/fallback. The error is logged to the console
 * for debugging purposes.
 */
function ComponentErrorFallback({ componentId, componentTypeId }: { componentId: string; componentTypeId: string }) {
    const error = useAsyncError();

    useEffect(() => {
        logger.error(`Failed to load data for component "${componentId}" (${componentTypeId})`, { error });
    }, [componentId, componentTypeId, error]);

    // Render nothing when data loading fails
    return null;
}

/** Resolve the concrete component inside the component-local Suspense boundary. */
function ResolvedComponent({ component, className, regionId, data, designMetadata }: ResolvedComponentProps) {
    if (!registry.hasConcreteComponent(component.typeId)) {
        const registrationError = import.meta.env.SSR
            ? registry.consumeRegistrationError(component.typeId)
            : registry.getRegistrationError(component.typeId);
        if (registrationError) throw registrationError;
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense consumes the promise.
        throw registry.loadAndRegister(component.typeId);
    }

    const DynamicComponent = registry.getComponent(component.typeId);
    if (!DynamicComponent) throw new Error(`Registered Page Designer component "${component.typeId}" is unavailable`);

    return (
        <DynamicComponent
            {...(component.data ?? {})}
            designMetadata={designMetadata}
            component={component}
            data={data}
            className={className}
            regionId={regionId}
        />
    );
}

export const Component = memo(function Component({ component, className, regionId }: ComponentProps): ReactElement {
    // Get this component's data promise from context by its ID
    const dataPromise = useComponentDataById(component.id);
    const isInCriticalRegion = useIsInCriticalRegion();
    const wasServerRendered = useWasServerRendered(component.id, component.typeId);
    const requiresRegistration = !(dataPromise instanceof Promise);
    const FallbackComponent = registry.getFallback(component.typeId);

    // Emit hints only for component wrappers that the server actually reaches. In particular,
    // components in conditional nested-region payloads do not cause browser preloads.
    if (import.meta.env.SSR) emitPageDesignerResourceHints([component.typeId]);

    const designMetadata: ComponentDesignMetadata = {
        name: component.designMetadata?.name,
        isFragment: Boolean(component.fragment),
        isVisible: Boolean(component.visible),
        isLocalized: Boolean(component.localized),
        id: component.id,
        // In content block editor a standalone block has no contentLinkUuid.
        // Fall back to the component id so selection/hover identity is never the empty
        // string, which would otherwise collide with the '' default and render the block
        // permanently selected. Matches the `?? id` fallback used in region-wrapper/index.
        contentLinkUuid: component.contentLinkUuid ?? component.id,
    };

    const renderComponent = (data: unknown) => (
        <ResolvedComponent
            designMetadata={designMetadata}
            component={component}
            data={data}
            className={className}
            regionId={regionId}
        />
    );

    const fallback = FallbackComponent ? <FallbackComponent {...(component.data ?? {})} /> : <div />;

    const content =
        dataPromise instanceof Promise ? (
            <Await
                resolve={dataPromise}
                errorElement={<ComponentErrorFallback componentId={component.id} componentTypeId={component.typeId} />}>
                {renderComponent}
            </Await>
        ) : (
            renderComponent(undefined)
        );

    // A critical component without deferred data must block the server shell when its module or
    // render tree suspends. A local Suspense boundary would flush the empty component fallback and
    // move its SSR content into a script-dependent hidden streaming segment instead.
    const componentContent =
        isInCriticalRegion && wasServerRendered && requiresRegistration ? (
            content
        ) : (
            <Suspense fallback={fallback}>{content}</Suspense>
        );

    return (
        <>
            {wasServerRendered && (
                <CriticalComponentHydrationMarker
                    componentId={component.id}
                    componentTypeId={component.typeId}
                    requiresRegistration={requiresRegistration}
                />
            )}
            <ComponentErrorBoundary
                key={`${component.id}:${component.typeId}`}
                componentId={component.id}
                componentTypeId={component.typeId}
                fallback={fallback}>
                {componentContent}
            </ComponentErrorBoundary>
        </>
    );
});
