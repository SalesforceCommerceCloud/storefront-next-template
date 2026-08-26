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

import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { relative } from 'node:path';
import type { Rollup } from 'vite';
import type {
    PageDesignerPreloadManifest,
    PageDesignerPreloadManifestResource,
} from '@salesforce/storefront-next-runtime/design/preload';
import type { ComponentInfo } from './staticRegistry';

export type {
    PageDesignerPreloadManifest,
    PageDesignerPreloadManifestResource,
} from '@salesforce/storefront-next-runtime/design/preload';

export const PAGE_DESIGNER_PRELOAD_MANIFEST_ID = 'virtual:storefront-next/page-designer-preload-manifest';
export const RESOLVED_PAGE_DESIGNER_PRELOAD_MANIFEST_ID = `\0${PAGE_DESIGNER_PRELOAD_MANIFEST_ID}`;

export interface PageDesignerPreloadCompressionConfig {
    brotli?: { quality?: number };
    gzip?: { level?: number };
}

export interface PageDesignerPreloadManifestConfig {
    path?: string;
    requiredTypeIds?: string[];
    compression?: PageDesignerPreloadCompressionConfig;
}

export interface NormalizedPageDesignerPreloadManifestConfig {
    path: string;
    requiredTypeIds: string[];
    compression: {
        brotli: { quality: number };
        gzip: { level: number };
    };
}

export interface ViteManifestRecord {
    file: string;
    src?: string;
    isEntry?: boolean;
    isDynamicEntry?: boolean;
    imports?: string[];
    css?: string[];
}

export type ViteManifest = Record<string, ViteManifestRecord>;

function correlateComponentRecords(
    source: string,
    viteManifest: ViteManifest,
    bundle: Rollup.OutputBundle,
    projectRoot: string
): [string, ViteManifestRecord][] {
    const directMatches = Object.entries(viteManifest).filter(
        ([key, record]) =>
            normalizeSourceId(projectRoot, key) === source ||
            normalizeSourceId(projectRoot, record.src ?? '') === source
    );
    if (directMatches.length > 0) return directMatches;

    // Vite can merge a dynamically imported component into a shared chunk whose manifest key/src
    // belongs to another module. Rollup's module list retains the source-to-chunk relationship.
    const containingFiles = new Set(
        Object.values(bundle)
            .filter(
                (output): output is Rollup.OutputChunk =>
                    output.type === 'chunk' &&
                    Object.keys(output.modules ?? {}).some(
                        (moduleId) => normalizeSourceId(projectRoot, moduleId) === source
                    )
            )
            .map((chunk) => chunk.fileName)
    );

    return Object.entries(viteManifest)
        .filter(([, record]) => containingFiles.has(record.file))
        .map(([key, record]) => [
            key,
            // Shared chunks do not always carry isDynamicEntry even though the registry reaches
            // them through import(). Only a true eager entry is already guaranteed to be loaded.
            { ...record, isDynamicEntry: !record.isEntry },
        ]);
}

function assertViteManifestStructure(value: unknown): asserts value is ViteManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid standard Vite manifest: expected a top-level object');
    }
    for (const [key, record] of Object.entries(value)) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            throw new Error(`Invalid standard Vite manifest: record "${key}" must be an object`);
        }
        if (!('file' in record) || typeof record.file !== 'string' || record.file.length === 0) {
            throw new Error(`Invalid standard Vite manifest: record "${key}" must have a non-empty string "file"`);
        }
    }
}

function integerInRange(value: unknown, path: string, min: number, max: number, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
        throw new Error(`${path} must be an integer between ${min} and ${max}`);
    }
    return value as number;
}

export function normalizePageDesignerPreloadManifestConfig(
    config: boolean | PageDesignerPreloadManifestConfig
): NormalizedPageDesignerPreloadManifestConfig {
    const options: PageDesignerPreloadManifestConfig = typeof config === 'object' ? config : {};
    return {
        path: options.path ?? 'page-designer-preload-manifest.json',
        requiredTypeIds: [...new Set(options.requiredTypeIds ?? [])].sort(),
        compression: {
            brotli: {
                quality: integerInRange(
                    options.compression?.brotli?.quality,
                    'preloadManifest.compression.brotli.quality',
                    0,
                    11,
                    9
                ),
            },
            gzip: {
                level: integerInRange(
                    options.compression?.gzip?.level,
                    'preloadManifest.compression.gzip.level',
                    0,
                    9,
                    6
                ),
            },
        },
    };
}

export function createEmptyPageDesignerPreloadManifest(
    config: NormalizedPageDesignerPreloadManifestConfig
): PageDesignerPreloadManifest {
    return { version: 1, compression: config.compression, resources: [], components: {} };
}

export function normalizeSourceId(projectRoot: string, id: string): string {
    const withoutQuery = id.split('?', 1)[0].replace(/\\/g, '/');
    const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (withoutQuery === normalizedRoot) return '';
    if (withoutQuery.startsWith(`${normalizedRoot}/`)) return withoutQuery.slice(normalizedRoot.length + 1);
    return withoutQuery.startsWith('/') ? relative(projectRoot, withoutQuery).replace(/\\/g, '/') : withoutQuery;
}

function outputBytes(output: Rollup.OutputChunk | Rollup.OutputAsset): Buffer {
    if (output.type === 'chunk') return Buffer.from(output.code);
    return Buffer.isBuffer(output.source) ? output.source : Buffer.from(output.source);
}

function describeResource(
    file: string,
    kind: PageDesignerPreloadManifestResource['kind'],
    bundle: Rollup.OutputBundle,
    config: NormalizedPageDesignerPreloadManifestConfig
): PageDesignerPreloadManifestResource {
    const output = bundle[file];
    if (!output) throw new Error(`Vite manifest references missing emitted resource "${file}"`);
    const bytes = outputBytes(output);
    return {
        file,
        kind,
        bytes: bytes.byteLength,
        estimatedBrotliBytes: brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: config.compression.brotli.quality },
        }).byteLength,
        estimatedGzipBytes: gzipSync(bytes, { level: config.compression.gzip.level }).byteLength,
    };
}

function assertUniqueTypeIds(components: ComponentInfo[]): void {
    const seen = new Map<string, string>();
    for (const component of components) {
        const previous = seen.get(component.id);
        if (previous) {
            throw new Error(
                `Duplicate Page Designer typeId "${component.id}" found in "${previous}" and "${component.filePath}"`
            );
        }
        seen.set(component.id, component.filePath);
    }
}

export function buildPageDesignerPreloadManifest(
    components: ComponentInfo[],
    viteManifest: ViteManifest,
    bundle: Rollup.OutputBundle,
    projectRoot: string,
    config: NormalizedPageDesignerPreloadManifestConfig,
    warn: (message: string) => void
): PageDesignerPreloadManifest {
    assertUniqueTypeIds(components);
    const required = new Set(config.requiredTypeIds);
    const componentFiles: Record<string, { styles?: string[]; entries?: string[]; dependencies?: string[] }> = {};
    const resourceKinds = new Map<string, PageDesignerPreloadManifestResource['kind']>();
    const addResource = (file: string, kind: PageDesignerPreloadManifestResource['kind']): void => {
        const existingKind = resourceKinds.get(file);
        if (existingKind && existingKind !== kind) {
            throw new Error(`Emitted resource "${file}" was classified as both ${existingKind} and ${kind}`);
        }
        resourceKinds.set(file, kind);
    };

    for (const component of [...components].sort((a, b) => a.id.localeCompare(b.id))) {
        const source = normalizeSourceId(projectRoot, component.filePath);
        const matches = correlateComponentRecords(source, viteManifest, bundle, projectRoot);
        if (matches.length > 1) {
            throw new Error(
                `Ambiguous Vite manifest correlation for Page Designer typeId "${component.id}" (${source}): ${matches
                    .map(([key]) => key)
                    .join(', ')}`
            );
        }
        if (matches.length === 0) {
            const message = `No Vite manifest record found for Page Designer typeId "${component.id}" (${source})`;
            if (required.has(component.id))
                throw new Error(`${message}; it is listed in preloadManifest.requiredTypeIds`);
            warn(message);
            continue;
        }

        const [, entryRecord] = matches[0];
        if (!entryRecord.isDynamicEntry) {
            // Already part of an eager entry/route graph; an extra preload would be redundant.
            componentFiles[component.id] = {};
            continue;
        }

        const visited = new Set<string>();
        const scripts = new Map<string, 'entry' | 'dependency'>();
        const styles = new Set<string>();
        const visit = (record: ViteManifestRecord, isComponentEntry: boolean): void => {
            if (visited.has(record.file)) return;
            visited.add(record.file);
            scripts.set(record.file, isComponentEntry ? 'entry' : 'dependency');
            for (const importedKey of record.imports ?? []) {
                const imported = viteManifest[importedKey];
                if (!imported)
                    throw new Error(`Vite manifest record "${record.file}" imports missing record "${importedKey}"`);
                visit(imported, false);
            }
            // Match Vite's dynamic-import preload order: imported chunks contribute their CSS
            // before the importing chunk. The order is semantically significant for the cascade.
            for (const css of record.css ?? []) styles.add(css);
        };
        visit(entryRecord, true);

        const styleFiles = [...styles];
        const entryFiles = [...scripts]
            .filter(([, role]) => role === 'entry')
            .map(([file]) => file)
            .sort();
        const dependencyFiles = [...scripts]
            .filter(([, role]) => role === 'dependency')
            .map(([file]) => file)
            .sort();
        for (const file of styleFiles) addResource(file, 'style');
        for (const file of [...entryFiles, ...dependencyFiles]) addResource(file, 'module');
        componentFiles[component.id] = {
            ...(styleFiles.length > 0 ? { styles: styleFiles } : {}),
            entries: entryFiles,
            ...(dependencyFiles.length > 0 ? { dependencies: dependencyFiles } : {}),
        };
    }

    for (const typeId of required) {
        if (!(typeId in componentFiles)) {
            throw new Error(`Required Page Designer typeId "${typeId}" was not discovered by the static registry scan`);
        }
    }

    const resourceFiles = [...resourceKinds.keys()].sort();
    const resourceIndices = Object.fromEntries(resourceFiles.map((file, index) => [file, index]));
    const toIndices = (files: string[]): number[] => files.map((file) => resourceIndices[file]);
    return {
        version: 1,
        compression: config.compression,
        resources: resourceFiles.map((file) =>
            describeResource(
                file,
                resourceKinds.get(file) as PageDesignerPreloadManifestResource['kind'],
                bundle,
                config
            )
        ),
        components: Object.fromEntries(
            Object.entries(componentFiles).map(([typeId, files]) => [
                typeId,
                {
                    ...(files.styles ? { styles: toIndices(files.styles) } : {}),
                    ...(files.entries ? { entries: toIndices(files.entries) } : {}),
                    ...(files.dependencies ? { dependencies: toIndices(files.dependencies) } : {}),
                },
            ])
        ),
    };
}

export function parseViteManifestAsset(bundle: Rollup.OutputBundle): ViteManifest {
    const candidates = Object.values(bundle).filter(
        (output): output is Rollup.OutputAsset =>
            output.type === 'asset' && /(^|\/)manifest\.json$/.test(output.fileName)
    );
    if (candidates.length !== 1) {
        throw new Error(`Expected exactly one standard Vite manifest asset, found ${candidates.length}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(String(candidates[0].source));
    } catch (error) {
        throw new Error(`Could not parse the standard Vite manifest: ${(error as Error).message}`);
    }
    assertViteManifestStructure(parsed);
    return parsed;
}

export function validateEmbeddedPageDesignerPreloadManifest(
    value: unknown
): asserts value is PageDesignerPreloadManifest {
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
        throw new Error('Page Designer preload manifest is missing, malformed, or uses an unsupported version');
    }
    const candidate = value as Partial<PageDesignerPreloadManifest>;
    if (
        !candidate.compression ||
        !Array.isArray(candidate.resources) ||
        !candidate.components ||
        typeof candidate.components !== 'object'
    ) {
        throw new Error('Page Designer preload manifest is incomplete');
    }
}
