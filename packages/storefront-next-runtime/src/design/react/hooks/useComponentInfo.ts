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
import type { ComponentInfo } from '../../messaging-api';
import { useDesignContext } from '../context/DesignContext';
import { useDesignSelector } from './useDesignSelector';

/**
 * Hook that returns the current ComponentInfo for a given component ID,
 * merging the base config with any runtime updates.
 *
 * @param componentId - The ID of the component to get info for
 * @returns The merged ComponentInfo or null if the component doesn't exist
 */
export function useComponentInfo(componentId: string): ComponentInfo | null {
    const { pageDesignerConfig } = useDesignContext() ?? {};
    // id-scoped selector — subscribe to only this component's update record.
    const componentUpdate = useDesignSelector((s) => s.componentUpdates?.[componentId]) ?? {};
    const baseComponentInfo = pageDesignerConfig?.components?.[componentId];

    if (!baseComponentInfo) {
        return null;
    }

    const { name } = componentUpdate;

    return { ...baseComponentInfo, name: name ?? baseComponentInfo.name };
}
