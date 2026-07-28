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
import { createContext, useContext, type ReactNode } from 'react';

/**
 * ComponentDataMap - A map of component IDs to their data promises
 * Used to pass component-specific data from page loaders down to individual components
 */
export type ComponentDataMap = Record<string, Promise<unknown>>;

const ComponentDataContext = createContext<ComponentDataMap | undefined>(undefined);

/**
 * ComponentDataProvider - Provides component data context at the page level
 *
 * This provider is created once at the page-level region and makes the componentData
 * map available to all nested components via hooks. It prevents the need to thread
 * data through props in nested layout components (like Grid, Carousel, etc.).
 *
 * @example
 * ```tsx
 * // In Region component (page mode)
 * <ComponentDataProvider value={pageComponentData}>
 *   <RegionWrapper>
 *     {components.map(comp => <Component component={comp} />)}
 *   </RegionWrapper>
 * </ComponentDataProvider>
 * ```
 */
export function ComponentDataProvider({ children, value }: { children: ReactNode; value: ComponentDataMap }) {
    return <ComponentDataContext.Provider value={value}>{children}</ComponentDataContext.Provider>;
}

/**
 * useComponentData - Access the full componentData map from context
 *
 * Returns the complete map of component IDs to data promises. Primarily used
 * internally by Region to check if context already exists (to avoid nesting providers).
 *
 * @returns ComponentDataMap if within provider, undefined otherwise
 *
 * @example
 * ```tsx
 * const existingData = useComponentData();
 * if (!existingData) {
 *   // Create new provider
 * }
 * ```
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useComponentData(): ComponentDataMap | undefined {
    return useContext(ComponentDataContext);
}

/**
 * useComponentDataById - Get a specific component's data promise by ID
 *
 * Retrieves the data promise for a specific component from the context.
 * Used by the Component wrapper to fetch component-specific data for rendering.
 *
 * @param componentId - The unique ID of the component
 * @returns Promise resolving to component data, or undefined if not found/no context
 *
 * @example
 * ```tsx
 * // In Component wrapper
 * const dataPromise = useComponentDataById(component.id);
 * return (
 *   <Await resolve={dataPromise}>
 *     {(data) => <DynamicComponent data={data} />}
 *   </Await>
 * );
 * ```
 */
// oxlint-disable-next-line react-refresh/only-export-components
export function useComponentDataById(componentId: string): Promise<unknown> | undefined {
    const componentData = useContext(ComponentDataContext);
    return componentData?.[componentId];
}
