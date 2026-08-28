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
import { useDesignSelector } from './useDesignSelector';

/**
 * Hook that merges live property overrides onto a component's props.
 *
 * Reads any `properties` recorded for the component in the design-time
 * `componentUpdates` state (populated by `ComponentPropertiesChanged` events)
 * and shallow-merges them over the passed props so the wrapped component
 * re-renders with the edited values.
 *
 * The merged result is intentionally a fresh object each call. The decorated
 * component spreads those values into its own props, so `React.memo` compares
 * the individual top-level values with its default shallow comparator.
 *
 * @param componentId - The ID of the component to resolve props for
 * @param props - The component's base props
 * @returns The base props, with any live overrides merged on top
 */
export function useComponentProps(componentId: string, props: Record<string, unknown>): Record<string, unknown> {
    // id-scoped selector — re-renders only when THIS component's properties
    // slice changes, not on any other component's edit. The spread stays out of
    // the selector so the subscription compares a stable ref.
    const overrideProperties = useDesignSelector((s) => s.componentUpdates?.[componentId]?.properties);

    return { ...props, ...overrideProperties };
}
