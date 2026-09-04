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
import { preinit, preloadModule } from 'react-dom';
import type { ShopperExperience } from '@/scapi';
import manifest from 'virtual:storefront-next/page-designer-preload-manifest';
import { resolvePreloadResources, type PreloadResource } from '@salesforce/storefront-next-runtime/design/preload';
import { PAGE_DESIGNER_STYLESHEET_PRECEDENCE } from '@salesforce/storefront-next-runtime/design/react/preload';
import { getClientBundlePath } from '@salesforce/storefront-next-runtime/assets';
import { createLogger } from '@/lib/logger';
import { registry } from '@/lib/page-designer/registry';
import { registerComponentTypes } from './registry-components';
import { collectComponentTypeIds } from './component-identifiers';

const logger = createLogger();
type CachedTypeIds = ReturnType<typeof collectComponentTypeIds>;
const typeIdsByRegion = new WeakMap<ShopperExperience.schemas['Region'], CachedTypeIds>();

function getComponentTypeIds(region: ShopperExperience.schemas['Region']): CachedTypeIds {
    const cached = typeIdsByRegion.get(region);
    if (cached) return cached;

    const typeIds = collectComponentTypeIds(region);
    typeIdsByRegion.set(region, typeIds);
    return typeIds;
}

function resolveResources(typeIds: Iterable<string>): PreloadResource[] {
    const orderedTypeIds = [...new Set(typeIds)];
    return resolvePreloadResources(manifest, orderedTypeIds, {
        bundlePath: getClientBundlePath(),
        warnAtResources: 40,
        onWarning(warning) {
            logger.warn('Page Designer preload warning', warning);
        },
    });
}

function emitResourceHints(resources: PreloadResource[]): void {
    for (const resource of resources) {
        if (resource.kind === 'module') {
            preloadModule(resource.href, { as: 'script', crossOrigin: 'anonymous' });
        } else {
            preinit(resource.href, { as: 'style', precedence: PAGE_DESIGNER_STYLESHEET_PRECEDENCE });
        }
    }
}

/** Emit unbudgeted hints for the component graph of one rendered region. */
export function emitPageDesignerResourceHints(typeIds: Iterable<string>): void {
    emitResourceHints(resolveResources(typeIds));
}

function suspendUntilComponentsAreRegistered(typeIds: Iterable<string>): void {
    const uniqueTypeIds = [...new Set(typeIds)];
    const missingTypeIds = uniqueTypeIds.filter((typeId) => !registry.hasConcreteComponent(typeId));
    if (missingTypeIds.length === 0) return;

    const failures = missingTypeIds.flatMap((typeId) => {
        const error = registry.consumeRegistrationError(typeId);
        return error ? [{ typeId, error }] : [];
    });
    if (failures.length === 1) throw failures[0].error;
    if (failures.length > 1) {
        throw new AggregateError(
            failures.map(({ error }) => error),
            `Failed to prepare critical Page Designer component types: ${failures.map(({ typeId }) => typeId).join(', ')}`
        );
    }

    // oxlint-disable-next-line typescript/only-throw-error -- React Suspense consumes the cached promise.
    throw registerComponentTypes(missingTypeIds);
}

/**
 * Ensure the concrete exports for a rendered critical region's direct children are
 * available before they enter the SSR shell. Nested regions prepare their own direct
 * children only when their owning component actually renders them.
 */
export function prepareCriticalRegion(region: ShopperExperience.schemas['Region']): void {
    const typeIds = getComponentTypeIds(region);
    if (typeIds.size === 0) return;

    suspendUntilComponentsAreRegistered(typeIds);
}
