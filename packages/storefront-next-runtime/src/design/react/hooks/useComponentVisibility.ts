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
import type { ComponentVisibilityState } from '../core/component.types';
import { useDesignSelector } from './useDesignSelector';

/**
 * Resolves a component's current visibility in Page Designer.
 *
 * A host-provided visibility override takes precedence over the component's
 * base visibility. Without an override, the boolean visibility metadata maps
 * to the state consumed by design-mode components.
 *
 * @param componentId - The component whose visibility state is being resolved.
 * @param isVisible - The component's base visibility from page data.
 * @returns The effective `visible` or `hidden` state for the component.
 */
export function useComponentVisibility(componentId: string, isVisible: boolean): ComponentVisibilityState {
    const overrideVisibilityState = useDesignSelector((s) => s.componentUpdates?.[componentId]?.visibility);

    return overrideVisibilityState ?? (isVisible ? 'visible' : 'hidden');
}
