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

export interface PageDesignerPreloadManifestResource {
    file: string;
    kind: 'module' | 'style';
    bytes: number;
    estimatedBrotliBytes: number;
    estimatedGzipBytes: number;
}

export interface PageDesignerPreloadManifestComponentResources {
    styles?: number[];
    entries?: number[];
    dependencies?: number[];
}

export interface PageDesignerPreloadManifest {
    version: 1;
    compression: {
        brotli: { quality: number };
        gzip: { level: number };
    };
    resources: PageDesignerPreloadManifestResource[];
    components: Record<string, PageDesignerPreloadManifestComponentResources>;
}

export type PreloadResource = { kind: 'module'; href: string } | { kind: 'style'; href: string };
export type CompressedSizeStrategy = 'brotli' | 'gzip' | 'max';

export type PreloadWarning =
    | { code: 'unknown-type-ids'; typeIds: string[] }
    | {
          code: 'module-budget-exceeded';
          selectedModuleEstimatedTransferBytes: number;
          selectedModuleRawBytes: number;
          omittedModules: Array<{
              file: string;
              estimatedTransferBytes: number;
              rawBytes: number;
          }>;
      }
    | { code: 'resource-count'; selectedResources: number; warnAtResources: number };

export interface ResolvePreloadResourcesOptions {
    bundlePath: string;
    /** Maximum estimated transfer bytes spent on optional module hints; required styles are excluded. */
    maxModuleEstimatedTransferBytes?: number;
    /** Maximum raw bytes spent on optional module hints; required styles are excluded. */
    maxModuleRawBytes?: number;
    compressedSizeStrategy?: CompressedSizeStrategy;
    warnAtResources?: number;
    onWarning?: (warning: PreloadWarning) => void;
}

type ResourceRole = 'style' | 'entry' | 'dependency';

interface RankedResource extends PageDesignerPreloadManifestResource {
    role: ResourceRole;
    encounterOrder: number;
}

const PRIORITY: Record<ResourceRole, number> = {
    style: 0,
    entry: 1,
    dependency: 2,
};

function validateManifest(manifest: PageDesignerPreloadManifest): void {
    if (
        !manifest ||
        manifest.version !== 1 ||
        !Array.isArray(manifest.resources) ||
        !manifest.components ||
        !manifest.compression
    ) {
        throw new Error('Unsupported or malformed Page Designer preload manifest');
    }
}

function estimatedBytes(resource: PageDesignerPreloadManifestResource, strategy: CompressedSizeStrategy): number {
    if (strategy === 'brotli') return resource.estimatedBrotliBytes;
    if (strategy === 'gzip') return resource.estimatedGzipBytes;
    return Math.max(resource.estimatedBrotliBytes, resource.estimatedGzipBytes);
}

function joinBundlePath(bundlePath: string, file: string): string {
    let base = bundlePath.replace(/\/+$/, '');
    let relativeFile = file.replace(/^\/+/, '');
    if (base.endsWith('/assets') && relativeFile.startsWith('assets/')) {
        relativeFile = relativeFile.slice('assets/'.length);
    }
    if (!base) base = '';
    return `${base}/${relativeFile}`;
}

export function dedupePreloadResources(resources: PreloadResource[]): PreloadResource[] {
    const seen = new Set<string>();
    return resources.filter((resource) => {
        const key = `${resource.kind}:${resource.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function resolvePreloadResources(
    manifest: PageDesignerPreloadManifest,
    typeIds: Iterable<string>,
    options: ResolvePreloadResourcesOptions
): PreloadResource[] {
    validateManifest(manifest);
    const strategy = options.compressedSizeStrategy ?? 'max';
    const maxModuleEstimatedTransferBytes = options.maxModuleEstimatedTransferBytes ?? 250_000;
    const maxModuleRawBytes = options.maxModuleRawBytes ?? 750_000;
    const warnAtResources = options.warnAtResources ?? 40;
    const unknownTypeIds = new Set<string>();
    const byFile = new Map<string, RankedResource>();
    let encounterOrder = 0;

    const addResources = (indices: number[] | undefined, role: ResourceRole): void => {
        for (const index of indices ?? []) {
            const resource = manifest.resources[index];
            if (!resource) throw new Error(`Page Designer preload manifest references missing resource ${index}`);
            const existing = byFile.get(resource.file);
            if (!existing) {
                byFile.set(resource.file, { ...resource, role, encounterOrder: encounterOrder++ });
            } else if (PRIORITY[role] < PRIORITY[existing.role]) {
                byFile.set(resource.file, { ...resource, role, encounterOrder: existing.encounterOrder });
            }
        }
    };

    for (const typeId of new Set(typeIds)) {
        const component = manifest.components[typeId];
        if (!component) {
            unknownTypeIds.add(typeId);
            continue;
        }
        addResources(component.styles, 'style');
        addResources(component.entries, 'entry');
        addResources(component.dependencies, 'dependency');
    }
    if (unknownTypeIds.size > 0) {
        options.onWarning?.({ code: 'unknown-type-ids', typeIds: [...unknownTypeIds].sort() });
    }

    const candidates = [...byFile.values()].sort((a, b) => {
        const roleDifference = PRIORITY[a.role] - PRIORITY[b.role];
        if (roleDifference !== 0) return roleDifference;
        // Stylesheets are active resources, so preserve Vite's encounter order for the CSS cascade.
        // Module preloads only affect fetching and can retain a deterministic filename tie-breaker.
        return a.role === 'style' ? a.encounterOrder - b.encounterOrder : a.file.localeCompare(b.file);
    });
    let selectedModuleEstimatedTransferBytes = 0;
    let selectedModuleRawBytes = 0;
    const selected: RankedResource[] = [];
    const omittedModules: Extract<PreloadWarning, { code: 'module-budget-exceeded' }>['omittedModules'] = [];

    for (const resource of candidates) {
        // Active styles are required for the SSR content and cannot be budget-truncated safely.
        // The budget applies only to optional module preload hints.
        if (resource.role === 'style') {
            selected.push(resource);
            continue;
        }
        const charge = estimatedBytes(resource, strategy);
        const exceedsBudget =
            selectedModuleEstimatedTransferBytes + charge > maxModuleEstimatedTransferBytes ||
            selectedModuleRawBytes + resource.bytes > maxModuleRawBytes;
        if (exceedsBudget) {
            omittedModules.push({ file: resource.file, estimatedTransferBytes: charge, rawBytes: resource.bytes });
            continue;
        }
        selected.push(resource);
        selectedModuleEstimatedTransferBytes += charge;
        selectedModuleRawBytes += resource.bytes;
    }
    if (omittedModules.length > 0) {
        options.onWarning?.({
            code: 'module-budget-exceeded',
            selectedModuleEstimatedTransferBytes,
            selectedModuleRawBytes,
            omittedModules,
        });
    }
    if (selected.length >= warnAtResources) {
        options.onWarning?.({ code: 'resource-count', selectedResources: selected.length, warnAtResources });
    }

    return selected.map((resource) => ({
        kind: resource.kind,
        href: joinBundlePath(options.bundlePath, resource.file),
    }));
}
