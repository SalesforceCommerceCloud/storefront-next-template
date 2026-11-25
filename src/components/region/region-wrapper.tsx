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

import { type ReactNode } from 'react';
import {
    usePageDesignerMode,
    createReactRegionDesignDecorator,
} from '@salesforce/storefront-next-runtime/design/react/core';
import type { RegionDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';
import type { ShopperExperience } from '@/scapi';

/**
 * Props for the base region renderer
 */
export interface RegionRendererProps extends React.HTMLAttributes<HTMLDivElement> {
    region: ShopperExperience.schemas['Region'];
    children: ReactNode;
    designMetadata?: Omit<RegionDesignMetadata, 'contentLinkUuids'>;
}

/**
 * Base region renderer component that handles the actual DOM structure
 * This is the component that gets decorated in design mode
 */
function RegionRenderer({ children, designMetadata: _designMetadata, className }: RegionRendererProps) {
    if (className) {
        return <div className={className}>{children}</div>;
    }
    return <>{children}</>;
}

/**
 * Create the design-mode decorated version of the region renderer
 * This wraps the region with Page Designer functionality when in design mode
 */
const DecoratedRegionRenderer = createReactRegionDesignDecorator(RegionRenderer);

/**
 * RegionWrapper - Smart wrapper that conditionally applies design mode decoration
 *
 * This component provides a clean abstraction for rendering regions that:
 * - Automatically detects design mode and applies the appropriate decorator
 * - Maintains a simple API for region rendering
 * - Handles design metadata when in Page Designer
 *
 * @example
 * ```tsx
 * <RegionWrapper regionId={region.id}>
 *   {region.components.map(component => (
 *     <Component key={component.id} component={component} />
 *   ))}
 * </RegionWrapper>
 * ```
 */
export function RegionWrapper({ region, children, className, designMetadata, ...rest }: RegionRendererProps) {
    const { isDesignMode } = usePageDesignerMode();

    if (isDesignMode && region?.id) {
        return (
            <DecoratedRegionRenderer
                region={region}
                designMetadata={{
                    id: region.id,
                    contentLinkUuids: region?.components?.map((cmp) => cmp.contentLinkUuid || cmp.id) || [],
                    componentTypeExclusions: designMetadata?.componentTypeExclusions || [],
                    componentTypeInclusions: designMetadata?.componentTypeInclusions || [],
                }}
                className={className}
                {...rest}>
                {children}
            </DecoratedRegionRenderer>
        );
    }

    // At runtime, render directly without decoration overhead
    return (
        <RegionRenderer region={region} className={className} {...rest}>
            {children}
        </RegionRenderer>
    );
}
