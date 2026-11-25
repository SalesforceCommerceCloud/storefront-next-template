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

import type {
    ComponentInfo,
    ComponentType,
    HostToClientConfiguration,
} from '@salesforce/storefront-next-runtime/design/messaging';
import type { ShopperExperience } from '@/scapi';

type Page = ShopperExperience.schemas['Page'];
type PageComponent = ShopperExperience.schemas['Component'];

/**
 * Host metadata derived from a page tree: real component ids and type ids.
 * Omits `page` so a connect-time config does not seed live preview.
 */
export type PageDesignerHostMetadata = Pick<HostToClientConfiguration, 'components' | 'componentTypes'>;

function componentLabel(component: PageComponent): string {
    const title = (component.data as { title?: unknown } | undefined)?.title;
    return typeof title === 'string' && title.length > 0 ? title : component.typeId;
}

function walk(
    components: PageComponent[] | undefined,
    componentMap: Record<string, ComponentInfo>,
    typeMap: Record<string, ComponentType>
) {
    for (const component of components ?? []) {
        componentMap[component.id] = {
            id: component.id,
            type: component.typeId,
            properties: { ...(component.data as Record<string, unknown> | undefined) },
            visibility: component.visible === false ? 'hidden' : 'visible',
            name: componentLabel(component),
        };

        const typeId = component.typeId;
        if (typeId && !typeMap[typeId]) {
            const label = componentLabel(component);
            typeMap[typeId] = {
                id: typeId,
                name: typeId,
                image: '',
                label,
            };
        }

        for (const region of component.regions ?? []) {
            walk(region.components, componentMap, typeMap);
        }
    }
}

/**
 * Builds the `components` and `componentTypes` maps a design host needs from a
 * page. Keys are the page's real component ids and `typeId`s — not tree UUIDs
 * or content-link ids. Repeated type ids share one type entry; the first
 * component that introduces a type supplies its label.
 */
export function createPageDesignerHostMetadata(page: Page | undefined): PageDesignerHostMetadata {
    const components: Record<string, ComponentInfo> = {};
    const componentTypes: Record<string, ComponentType> = {};

    for (const region of page?.regions ?? []) {
        walk(region.components, components, componentTypes);
    }

    return { components, componentTypes };
}
