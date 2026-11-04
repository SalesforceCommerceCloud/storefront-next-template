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
import path from 'node:path';
import { decode } from '@jridgewell/sourcemap-codec';
import { ImportType, init, parse as parseImports } from 'es-module-lexer';
import { z } from 'zod';

// ---- rollup-plugin-visualizer data, embedded in the HTML report as `const data = {…};`

const visualizerSchema = z
    .object({
        version: z.number(),
        nodeParts: z.record(z.string(), z.object({ renderedLength: z.number(), metaUid: z.string() }).passthrough()),
        nodeMetas: z.record(
            z.string(),
            z
                .object({
                    id: z.string(),
                    moduleParts: z.record(z.string(), z.string()),
                    imported: z.array(z.object({ uid: z.string(), dynamic: z.boolean().optional() }).passthrough()),
                    isEntry: z.boolean().nullable().optional(),
                })
                .passthrough()
        ),
    })
    .passthrough();

/** Data versions this parser has been checked against. */
const VISUALIZER_VERSIONS = new Set([2]);

export type GraphModule = {
    /** Absolute path, without the bundler's query (`?__react-router-build-client-route`). */
    id: string;
    static: Set<string>;
    dynamic: Set<string>;
    /** Pre-minification length the visualizer measured, over every chunk the module is in. */
    rendered: number;
    /** A bundle entry: entry.client or a route module. */
    entry: boolean;
    /** Chunks of the analyze build (readable names) that hold the module's code. */
    chunks: Set<string>;
};
export type ModuleGraph = Map<string, GraphModule>;

/** Rollup's virtual modules (`\0vite/preload-helper`) have no file; they're bundler runtime. */
const isVirtual = (id: string): boolean => id.startsWith('\0') && !id.slice(1).startsWith('/');

/**
 * The visualizer writes ids relative to the project root when they're inside it (`/src/root.tsx`) and absolute
 * otherwise (a hoisted `node_modules`). An id is relative when its first segment is an entry of the project root.
 */
export function moduleIdResolver(projectRoot: string, rootEntries: ReadonlySet<string>): (id: string) => string {
    return (raw) => {
        const id = (raw.startsWith('\0') ? raw.slice(1) : raw).replace(/\?.*$/, '');
        const first = id.split('/')[1] ?? '';
        return id.startsWith('/') && rootEntries.has(first) ? path.join(projectRoot, id) : path.resolve(id);
    };
}

export function parseVisualizerHtml(html: string, resolveId: (id: string) => string): ModuleGraph {
    const match = html.match(/^\s*const data = (\{.*\});\s*$/m);
    if (!match) throw new Error('The visualizer report has no embedded `const data = {…}`.');
    const data = visualizerSchema.parse(JSON.parse(match[1]));
    if (!VISUALIZER_VERSIONS.has(data.version)) throw new Error(`Unsupported visualizer data version ${data.version}.`);
    const graph: ModuleGraph = new Map();
    for (const meta of Object.values(data.nodeMetas)) {
        if (isVirtual(meta.id)) continue;
        const id = resolveId(meta.id);
        const node = graph.get(id) ?? {
            id,
            static: new Set(),
            dynamic: new Set(),
            rendered: 0,
            entry: false,
            chunks: new Set(),
        };
        node.entry ||= meta.isEntry === true;
        for (const [chunk, partUid] of Object.entries(meta.moduleParts)) {
            const part = data.nodeParts[partUid];
            if (!part) throw new Error(`Visualizer module ${meta.id} names an unknown part ${partUid}.`);
            node.chunks.add(chunk);
            node.rendered += part.renderedLength;
        }
        for (const edge of meta.imported) {
            const target = data.nodeMetas[edge.uid];
            if (!target || isVirtual(target.id)) continue;
            const targetId = resolveId(target.id);
            if (targetId !== id) (edge.dynamic ? node.dynamic : node.static).add(targetId);
        }
        graph.set(id, node);
    }
    // The same file reached statically and dynamically (through its query variants) is still split out.
    for (const node of graph.values()) for (const target of node.dynamic) node.static.delete(target);
    return graph;
}

// ---- a built chunk, attributed byte for byte to its modules through the hidden source map

const sourceMapSchema = z
    .object({ sources: z.array(z.string().nullable()), sourceRoot: z.string().optional(), mappings: z.string() })
    .passthrough();

export const PRELOAD_LIST_PREFIX = 'const __vite__mapDeps=';
export const ROUTER_MANIFEST_PREFIX = 'window.__reactRouterManifest=';

export type ParsedChunk = {
    file: string;
    bytes: number;
    /** Minified bytes per module (absolute path), from the source map. */
    modules: Map<string, number>;
    /** Bytes of Vite's `__vite__mapDeps` dependency list on the first line. */
    preloadList: number;
    /** Bytes the map attributes to no module: JSON modules (which have no mappings) and import/export glue. */
    unattributed: number;
    hasMap: boolean;
    routerManifest: boolean;
    imports: string[];
    dynamicImports: string[];
};

export const lexerReady = init;

/** `code` and `map` are the chunk and its `.map` (absent when the build wrote none); `assetsDir` resolves map sources. */
export function parseChunk(file: string, code: string, map: string | undefined, assetsDir: string): ParsedChunk {
    const bytes = Buffer.byteLength(code);
    const routerManifest = code.startsWith(ROUTER_MANIFEST_PREFIX);
    const imports = new Set<string>();
    const dynamicImports = new Set<string>();
    if (!routerManifest) {
        for (const item of parseImports(code)[0]) {
            // Chunks import each other relatively (`./x.js`); dynamic imports through the preload helper are
            // `import("./x.js")` too. Anything else (a URL, a bare specifier) isn't part of this build.
            if (item.t === ImportType.ImportMeta || !item.n?.startsWith('./')) continue;
            (item.t === ImportType.Dynamic ? dynamicImports : imports).add(item.n.slice(2));
        }
    }
    const lines = code.split('\n');
    const preloadList = lines[0].startsWith(PRELOAD_LIST_PREFIX)
        ? Buffer.byteLength(lines[0]) + (lines.length > 1 ? 1 : 0)
        : 0;
    const chunk: ParsedChunk = {
        file,
        bytes,
        modules: new Map(),
        preloadList,
        unattributed: bytes - preloadList,
        hasMap: false,
        routerManifest,
        imports: [...imports],
        dynamicImports: [...dynamicImports].filter((item) => !imports.has(item)),
    };
    if (routerManifest || map === undefined) return chunk;
    const parsed = sourceMapSchema.parse(JSON.parse(map));
    const sourceBase = path.resolve(assetsDir, parsed.sourceRoot ?? '');
    // Without the query (`entry.client.tsx?platform-passthrough`, `index.css?url`), like the graph's ids.
    const sources = parsed.sources.map((source) =>
        source === null || source.includes('\0') ? null : path.resolve(sourceBase, source.replace(/\?.*$/, ''))
    );
    const decoded = decode(parsed.mappings);
    let unattributed = 0;
    const add = (source: number | undefined, length: number): void => {
        const id = source === undefined ? null : sources[source];
        if (id) chunk.modules.set(id, (chunk.modules.get(id) ?? 0) + length);
        else unattributed += length;
    };
    lines.forEach((line, index) => {
        const newline = index < lines.length - 1 ? 1 : 0;
        if (index === 0 && preloadList) return;
        unattributed += newline;
        const segments = decoded[index] ?? [];
        if (!segments.length) {
            unattributed += Buffer.byteLength(line);
            return;
        }
        // Columns count UTF-16 units, so slice the string and measure each span in bytes.
        unattributed += Buffer.byteLength(line.slice(0, segments[0][0]));
        segments.forEach((segment, k) => {
            const end = k + 1 < segments.length ? segments[k + 1][0] : line.length;
            add(segment.length >= 4 ? segment[1] : undefined, Buffer.byteLength(line.slice(segment[0], end)));
        });
    });
    chunk.hasMap = true;
    chunk.unattributed = unattributed;
    return chunk;
}

// ---- React Router's manifest chunk

const manifestRouteSchema = z
    .object({
        id: z.string(),
        parentId: z.string().optional(),
        path: z.string().optional(),
        index: z.boolean().optional(),
        module: z.string(),
        imports: z.array(z.string()).optional(),
    })
    .passthrough();
const routerManifestSchema = z
    .object({
        entry: z.object({ module: z.string(), imports: z.array(z.string()) }).passthrough(),
        routes: z.record(z.string(), manifestRouteSchema),
    })
    .passthrough();
export type RouterManifest = z.infer<typeof routerManifestSchema>;

/** A chunk URL as the chunk's file name, the key every source here shares. */
export const assetName = (url: string): string =>
    url
        .replace(/[?#].*$/, '')
        .split('/')
        .at(-1) ?? url;

/**
 * Parses `window.__reactRouterManifest={…}`. React Router writes JSON; the storefront-next SDK replaces each URL
 * with `(window._BUNDLE_PATH || "/") + "assets/x.js"`, which is folded back to a string. Module URLs become file names.
 */
export function parseRouterManifest(code: string): RouterManifest {
    if (!code.startsWith(ROUTER_MANIFEST_PREFIX)) throw new Error('Not a React Router manifest chunk.');
    const json = code
        .slice(ROUTER_MANIFEST_PREFIX.length)
        .trim()
        .replace(/;$/, '')
        .replace(/\(\s*window\._BUNDLE_PATH\s*\|\|\s*"[^"]*"\s*\)\s*\+\s*"/g, '"');
    const manifest = routerManifestSchema.parse(JSON.parse(json));
    manifest.entry.module = assetName(manifest.entry.module);
    manifest.entry.imports = manifest.entry.imports.map(assetName);
    for (const route of Object.values(manifest.routes)) {
        route.module = assetName(route.module);
        if (route.imports) route.imports = route.imports.map(assetName);
    }
    return manifest;
}

// ---- the inline module script React Router renders into each page

export type RenderedRoutes = { routes: { id: string; file: string }[]; entry?: string };

/**
 * React Router's `<Scripts>` renders an inline module that imports the matched routes and names them:
 * `import * as route0 from "…/root-x.js"; … window.__reactRouterRouteModules = {"root":route0,…}; import("…/entry.client-y.js");`.
 * That is the page's route branch, from the deployed site itself. Undefined when the script isn't this one.
 */
export function parseRouteModulesScript(code: string): RenderedRoutes | undefined {
    const assignment = code.match(/window\.__reactRouterRouteModules\s*=\s*\{([^}]*)\}/);
    if (!assignment || assignment.index === undefined) return undefined;
    const files = new Map(
        [...code.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s*"([^"]+)"/g)].map((item) => [item[1], assetName(item[2])])
    );
    const routes = [...assignment[1].matchAll(/"([^"]+)"\s*:\s*(\w+)/g)].flatMap((item) => {
        const file = files.get(item[2]);
        return file ? [{ id: item[1], file }] : [];
    });
    if (!routes.length) return undefined;
    const entry = code.slice(assignment.index).match(/import\(\s*"([^"]+)"\s*\)/)?.[1];
    return { routes, ...(entry ? { entry: assetName(entry) } : {}) };
}
