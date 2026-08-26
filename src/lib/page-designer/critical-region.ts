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
import { loadAndRegisterRegistryComponents } from './static-registry';
import { collectComponentIdentifiers } from './component-identifiers';

const logger = createLogger();
const resourcesByTypes = new Map<string, PreloadResource[]>();

type Preparation =
    | { status: 'pending'; promise: Promise<void> }
    | { status: 'fulfilled' }
    | { status: 'rejected'; error: Error };

const preparations = new Map<string, Preparation>();
type CachedIdentifiers = ReturnType<typeof collectComponentIdentifiers> & { componentIdList?: string[] };
const identifiersByRegion = new WeakMap<ShopperExperience.schemas['Region'], CachedIdentifiers>();

function getComponentIdentifiers(region: ShopperExperience.schemas['Region']): CachedIdentifiers {
    const cached = identifiersByRegion.get(region);
    if (cached) return cached;

    const identifiers = collectComponentIdentifiers(region);
    identifiersByRegion.set(region, identifiers);
    return identifiers;
}

function setKeyFor(typeIds: Iterable<string>): string {
    return [...new Set(typeIds)].sort().join('\0');
}

function resolveResources(typeIds: Iterable<string>): PreloadResource[] {
    const orderedTypeIds = [...new Set(typeIds)];
    const key = orderedTypeIds.join('\0');
    const cached = resourcesByTypes.get(key);
    if (cached) return cached;

    const resources = resolvePreloadResources(manifest, orderedTypeIds, {
        bundlePath: getClientBundlePath(),
        maxModuleEstimatedTransferBytes: 250_000,
        maxModuleRawBytes: 750_000,
        compressedSizeStrategy: 'max',
        warnAtResources: 40,
        onWarning(warning) {
            logger.warn('Page Designer critical-region preload warning', warning);
        },
    });
    resourcesByTypes.set(key, resources);
    return resources;
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

/** Resolve and emit React resource hints for a set of critical component types. */
export function emitCriticalRegionResourceHints(typeIds: Iterable<string>): void {
    emitResourceHints(resolveResources(typeIds));
}

function suspendUntilComponentsAreRegistered(typeIds: Iterable<string>): void {
    const uniqueTypeIds = [...new Set(typeIds)];
    const missingTypeIds = uniqueTypeIds.filter((typeId) => !registry.hasConcreteComponent(typeId));
    if (missingTypeIds.length === 0) return;

    // Key by the complete region selection rather than the currently missing subset.
    // Unknown external type IDs are deliberately ignored by loadAndRegister; remembering
    // the completed attempt prevents an already-resolved promise from suspending forever.
    const key = setKeyFor(uniqueTypeIds);
    const existing = preparations.get(key);
    if (existing?.status === 'pending') {
        // oxlint-disable-next-line typescript/only-throw-error -- React Suspense consumes the cached promise.
        throw existing.promise;
    }
    if (existing?.status === 'fulfilled') return;
    if (existing?.status === 'rejected') throw existing.error;

    const promise = loadAndRegisterRegistryComponents(missingTypeIds).then(
        () => {
            preparations.set(key, { status: 'fulfilled' });
        },
        (error: unknown) => {
            const cause =
                error instanceof Error
                    ? error
                    : new Error('Critical Page Designer component import failed', { cause: error });
            preparations.set(key, { status: 'rejected', error: cause });
            throw cause;
        }
    );
    preparations.set(key, { status: 'pending', promise });
    // oxlint-disable-next-line typescript/only-throw-error -- React Suspense consumes the cached promise.
    throw promise;
}

/**
 * Emit browser hints and ensure concrete component exports are available before a
 * critical region enters the SSR shell. The client build receives an empty manifest;
 * browser hints are emitted only during SSR, after the finalized manifest exists.
 */
export function prepareCriticalRegion(region: ShopperExperience.schemas['Region']): string[] {
    const identifiers = getComponentIdentifiers(region);
    const { typeIds, componentIds } = identifiers;
    if (typeIds.size === 0) return [];

    if (import.meta.env.SSR) emitCriticalRegionResourceHints(typeIds);
    suspendUntilComponentsAreRegistered(typeIds);
    // Cache the array on the identifier result as well, so the context value stays referentially
    // stable across Suspense retries and parent renders.
    return (identifiers.componentIdList ??= [...componentIds]);
}
