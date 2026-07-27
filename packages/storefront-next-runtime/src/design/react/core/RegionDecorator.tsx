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
import { lazy } from 'react';
import type { RegionDecoratorProps } from './component.types';
import { usePageDesignerMode } from './PageDesignerProvider';

// oxlint-disable-next-line react/only-export-components -- oxlint flags the lazy const alongside the exported decorator factory; eslint-plugin-react-refresh does not
const LazyDesignRegion = lazy(() =>
    import('../components/DesignRegion').then((module) => ({ default: module.DesignRegion }))
);

export function createReactRegionDesignDecorator<TProps>(
    Region: React.ComponentType<TProps>
): (props: RegionDecoratorProps<TProps>) => React.JSX.Element {
    return function DesignDecoratedRegion(props: RegionDecoratorProps<TProps>) {
        const { designMetadata, children, className, ...componentProps } = props;
        const { isDesignMode } = usePageDesignerMode();

        return isDesignMode ? (
            <LazyDesignRegion designMetadata={designMetadata} className={className}>
                <Region {...(componentProps as unknown as TProps)}>{children}</Region>
            </LazyDesignRegion>
        ) : (
            <Region {...(componentProps as unknown as TProps)} className={className}>
                {children}
            </Region>
        );
    };
}
