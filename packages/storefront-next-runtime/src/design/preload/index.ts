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
}

export interface PageDesignerPreloadManifestComponentResources {
    styles?: number[];
    entries?: number[];
    dependencies?: number[];
}

export interface PageDesignerPreloadManifest {
    resources: PageDesignerPreloadManifestResource[];
    components: Record<string, PageDesignerPreloadManifestComponentResources>;
}

export type PreloadResource = { kind: 'module'; href: string } | { kind: 'style'; href: string };

export type PreloadWarning =
    | { code: 'unknown-type-ids'; typeIds: string[] }
    | { code: 'resource-count'; selectedResources: number; warnAtResources: number };

export interface ResolvePreloadResourcesOptions {
    bundlePath: string;
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
    if (!manifest || !Array.isArray(manifest.resources) || !manifest.components) {
        throw new Error('Malformed Page Designer preload manifest');
    }
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
        return a.encounterOrder - b.encounterOrder;
    });
    if (candidates.length >= warnAtResources) {
        options.onWarning?.({ code: 'resource-count', selectedResources: candidates.length, warnAtResources });
    }

    return candidates.map((resource) => ({
        kind: resource.kind,
        href: joinBundlePath(options.bundlePath, resource.file),
    }));
}
