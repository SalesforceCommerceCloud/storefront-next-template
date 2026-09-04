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
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience } from '@/scapi';
import { registry } from '@/lib/page-designer/registry';

/**
 * Add one component's server-loader promise to the page-level data map.
 */
export function collectComponentData(
    ctx: LoaderFunctionArgs,
    component: ShopperExperience.schemas['Component'],
    map: Record<string, Promise<unknown>>
): void {
    if (!registry.hasLoaders(component.typeId)) return;

    map[component.id] = registry.callLoader(component.typeId, {
        componentData: component,
        context: ctx.context,
        request: ctx.request,
    });
}

/** Recursively collect component data promises from regions. */
export function collectFromRegions(
    ctx: LoaderFunctionArgs,
    regions: ShopperExperience.schemas['Region'][] | undefined,
    map: Record<string, Promise<unknown>>
): void {
    for (const region of regions ?? []) {
        for (const component of region.components ?? []) {
            collectComponentData(ctx, component, map);
            collectFromRegions(ctx, component.regions, map);
        }
    }
}
