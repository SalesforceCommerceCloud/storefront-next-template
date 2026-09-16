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
import { registry } from './registry';

const COMPONENT_SELECTOR = '[data-page-designer-component-type]';

/** Load and register concrete component exports in first-occurrence order. */
export async function registerComponentTypes(typeIds: Iterable<string>, targetRegistry = registry): Promise<void> {
    const uniqueTypeIds = [...new Set(typeIds)];
    const results = await Promise.allSettled(uniqueTypeIds.map((id) => targetRegistry.loadAndRegister(id)));
    const failures = results.flatMap((result, index) =>
        result.status === 'rejected' ? [{ typeId: uniqueTypeIds[index], cause: result.reason }] : []
    );

    if (failures.length === 1) throw failures[0].cause;
    if (failures.length > 1) {
        throw new AggregateError(
            failures.map(({ cause }) => cause),
            `Failed to register Page Designer component types: ${failures.map(({ typeId }) => typeId).join(', ')}`
        );
    }
}

/**
 * Read the exact critical, boundary-free component instances already present in
 * the SSR DOM and return their unique types in DOM order.
 */
export function getServerRenderedComponentTypeIds(root: ParentNode): string[] {
    const typeIds = new Set<string>();
    for (const marker of root.querySelectorAll<HTMLElement>(COMPONENT_SELECTOR)) {
        const typeId = marker.dataset.pageDesignerComponentType;
        if (typeId) typeIds.add(typeId);
    }
    return [...typeIds];
}

/** Register the boundary-free critical component types present in the initial SSR DOM. */
export function registerServerRenderedComponentTypes(root: ParentNode): Promise<void> {
    return registerComponentTypes(getServerRenderedComponentTypeIds(root));
}
