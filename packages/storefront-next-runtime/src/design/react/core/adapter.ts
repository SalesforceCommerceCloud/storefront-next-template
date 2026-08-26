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

import React from 'react';
import { type ComponentModule, type FrameworkAdapter } from '../../registry/types';
import { createReactComponentDesignDecorator } from './ComponentDecorator';

/* ==================== React-Specific Types ==================== */

export type ReactComponentModule<TProps> = ComponentModule<TProps, ReactDesignComponentType<TProps>>;

/**
 * A React component that optionally accepts design metadata.
 * Any component returned from the registry could potentially accept design metadata.
 * This includes both regular components and lazy components with their React-specific properties.
 */
export type ReactDesignComponentType<TProps> =
    | React.ComponentType<TProps>
    | React.LazyExoticComponent<React.ComponentType<TProps>>;

/* ==================== React Adapter Implementation ==================== */

/**
 * React framework adapter that implements React-specific behavior
 * for the framework-agnostic component registry.
 */
export class ReactAdapter<TProps> implements FrameworkAdapter<TProps, ReactDesignComponentType<TProps>> {
    private readonly decoratedComponents = new WeakMap<object, ReactDesignComponentType<TProps>>();

    /**
     * Creates a React lazy component from an importer function.
     */
    createLazyComponent(importer: () => Promise<ReactComponentModule<TProps>>): ReactDesignComponentType<TProps> {
        const lazyComp = React.lazy(async () => {
            const m = await importer();

            const component = m.default as React.ComponentType<TProps>;

            return { default: component };
        });

        return lazyComp as ReactDesignComponentType<TProps>;
    }

    /**
     * Decorates a React component with design-time capabilities.
     * Uses the React-specific design decorator directly.
     */
    decorateComponent(component: ReactDesignComponentType<TProps>): ReactDesignComponentType<TProps> {
        const cached = this.decoratedComponents.get(component);
        if (cached) return cached;

        const reactComponent = component as React.ComponentType<TProps>;
        const decorated = createReactComponentDesignDecorator(reactComponent) as ReactDesignComponentType<TProps>;
        this.decoratedComponents.set(component, decorated);
        return decorated;
    }
}

/**
 * Creates a React adapter instance with optional configuration.
 */
export function createReactAdapter<TProps>(): ReactAdapter<TProps> {
    return new ReactAdapter<TProps>();
}
