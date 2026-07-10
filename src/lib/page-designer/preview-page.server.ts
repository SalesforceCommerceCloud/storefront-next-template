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
import { PREVIEW_PAGE_ID, PREVIEW_REGION_ID } from './preview-page';
import type { PageWithComponentData } from './page-loader.server';
import type { ComponentWithComponentData } from './component-loader.server';

// Re-export the client-safe region id so existing `preview-page.server` importers
// keep working; the canonical definition lives in the non-`.server` sibling module
// (the route's client component must import it without pulling in server-only code).
export { PREVIEW_REGION_ID };

/**
 * Returns the constant id used for the locally synthesized preview page.
 *
 * The mini-PD component-preview route does not fetch a real hosting page — it
 * builds a Page-shaped object on the fly so the existing `<Region page={…}>`
 * render path can be reused. The id is a stable constant (no SCAPI lookup).
 */
export function resolvePreviewPageId(): string {
    return PREVIEW_PAGE_ID;
}

/**
 * Synthesizes a `PageWithComponentData` that hosts a single, already-fetched
 * Page Designer component inside a region named {@link PREVIEW_REGION_ID}, so the
 * mini-PD canvas can render one component standalone via `<Region page={…}>`.
 *
 * The returned page's `componentData` map merges:
 *  - the component's descendant data (collected by `collectFromRegions` inside
 *    `fetchComponentWithComponentData`), plus
 *  - the previewed ROOT component's own loader data, which `collectFromRegions`
 *    never collects (it only walks descendants). Without this the root block
 *    would render with `data === undefined`.
 *
 * Keys are component ids (unique), so the merge is collision-free by construction.
 * Promises are passed through by reference and never awaited here — the route
 * awaits only the page identity (gating 200 vs 404) while per-component data
 * streams behind Suspense.
 */
export function injectIntoPreviewRegion(
    component: ComponentWithComponentData,
    args: LoaderFunctionArgs
): PageWithComponentData {
    // Strip the page-level `componentData` field off the component — it belongs on
    // the page, not on the component placed inside the region.
    const { componentData: descendantData, ...strippedComponent } = component;

    const componentData: Record<string, Promise<unknown>> = { ...(descendantData ?? {}) };

    // Register the previewed root component's own loader data (descendants only are
    // collected upstream by collectFromRegions).
    if (registry.hasLoaders(strippedComponent.typeId)) {
        componentData[strippedComponent.id] = registry.callLoader(
            strippedComponent.typeId,
            {
                componentData: strippedComponent,
                context: args.context,
                request: args.request,
            },
            'loader'
        );
    }

    const region = {
        id: PREVIEW_REGION_ID,
        components: [strippedComponent],
    } as unknown as ShopperExperience.schemas['Region'];

    const page = {
        id: resolvePreviewPageId(),
        regions: [region],
    } as unknown as ShopperExperience.schemas['Page'];

    return { ...page, componentData };
}
