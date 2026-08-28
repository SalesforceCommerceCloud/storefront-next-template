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
import type React from 'react';

/**
 * How the client applies page updates from the design layer.
 * - 'client': Page updates are applied in-browser without reloading the page.
 * - 'server': Page updates require a round trip to the server to render a new page.
 */
export type PageUpdateMode = 'client' | 'server';

export type ComponentVisibilityState = 'visible' | 'hidden';

/**
 * Default component constructor interface.
 * Used to define default components that should be instantiated in a region.
 */
export interface DefaultComponentConstructor {
    /** Unique identifier for the component instance */
    id: string;
    /** Component type ID to instantiate */
    typeId: string;
    /** Component data/attributes */
    data: Record<string, unknown>;
}

export interface RegionDesignMetadata {
    /**
     * The id of the component or region.
     */
    id: string;
    /**
     * The name of the component or region.
     */
    name?: string;
    /**
     * Optional description for the region.
     */
    description?: string;
    /**
     * Maximum number of components allowed in the region.
     */
    maxComponents?: number;
    /**
     * A list of content link UUIDs for component instances in this region.
     */
    contentLinkUuids?: string[];
    /**
     * A list of allowed component types in this region.
     */
    componentTypeInclusions?: string[];
    /**
     * A list of forbidden component types in this region.
     */
    componentTypeExclusions?: string[];
    /**
     * Default components to instantiate when the region is created.
     */
    defaultComponentConstructors?: DefaultComponentConstructor[];
}

export interface ComponentDesignMetadata {
    /**
     * The id of the component or region.
     */
    id: string;
    /**
     * The unique identifier for the content link between this component
     * and its parent.
     */
    contentLinkUuid?: string;
    /**
     * Whether the component is a fragment.
     */
    isFragment: boolean;
    /**
     * Whether the component is visible based on the current visiblity rules and context.
     */
    isVisible: boolean;
    /**
     * Whether the component has been localized in the current locale.
     */
    isLocalized: boolean;
    /**
     * The name of the component or region.
     */
    name?: string;
    /**
     * The region definitions for this component.
     */
    regionDefinitions?: RegionDesignMetadata[];
}

/**
 * Props for a component produced by {@link createReactComponentDesignDecorator}.
 *
 * `children` is the decorated component's own nested content (a `ReactNode`),
 * matching how the component renders in both design and non-design mode.
 */
export type ComponentDecoratorProps<TProps> = React.PropsWithChildren<
    {
        designMetadata?: ComponentDesignMetadata;
        visible?: boolean;
        localized?: boolean;
    } & TProps
>;

/**
 * Props for the internal `DesignComponent`.
 *
 * Unlike {@link ComponentDecoratorProps}, `children` is a render prop: the
 * decorator hands `DesignComponent` a function so the wrapped component's props
 * can be resolved (e.g. live property overrides) before it renders.
 */
export type DesignComponentProps<TProps> = {
    designMetadata?: ComponentDesignMetadata;
    visible?: boolean;
    localized?: boolean;
    children: (props: TProps) => React.ReactNode;
} & TProps;

export type RegionDecoratorProps<TProps> = React.PropsWithChildren<
    {
        designMetadata?: RegionDesignMetadata;
        className?: string;
    } & TProps
>;
