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
import { type ReactElement, memo, Suspense, useEffect } from 'react';
import { registry } from '@/lib/page-designer/registry';
import { Await, useAsyncError } from 'react-router';
import { createLogger } from '@/lib/logger';

const logger = createLogger();
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import { useComponentDataById } from './component-data-context';
import type { ComponentType } from './index';

export interface ComponentProps {
    component: ComponentType;
    className?: string;
    regionId: string;
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

export const Component = memo(function Component({ component, className, regionId }: ComponentProps): ReactElement {
    // Get this component's data promise from context by its ID
    const dataPromise = useComponentDataById(component.id);
    const FallbackComponent = registry.getFallback(component.typeId);
    const DynamicComponent = registry.getComponent(component.typeId);
    if (!DynamicComponent) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw registry.preload(component.typeId);
    }

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

    return (
        <Suspense fallback={FallbackComponent ? <FallbackComponent {...(component.data ?? {})} /> : <div />}>
            <Await
                resolve={dataPromise}
                errorElement={<ComponentErrorFallback componentId={component.id} componentTypeId={component.typeId} />}>
                {(data) => (
                    <DynamicComponent
                        {...(component.data ?? {})}
                        designMetadata={designMetadata}
                        component={component}
                        data={data}
                        className={className}
                        regionId={regionId}
                    />
                )}
            </Await>
        </Suspense>
    );
});
