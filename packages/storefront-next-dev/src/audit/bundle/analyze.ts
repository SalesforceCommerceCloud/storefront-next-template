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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PlayhouseArtifactReader } from '../evidence';
import type { PlayhouseCollection } from '../playhouse';
import { readLivePage, type LivePage } from './live';
import {
    lexerReady,
    moduleIdResolver,
    parseChunk,
    parseRouterManifest,
    parseVisualizerHtml,
    type ModuleGraph,
    type ParsedChunk,
    type RouterManifest,
} from './parse';
import {
    BUNDLE_SCHEMA_VERSION,
    type BundleAnalysis,
    type BundleCandidate,
    type BundlePackage,
    type BundlePage,
    type LocalPage,
} from './schema';

/** An import that frees less than this isn't worth a candidate. */
export const MIN_CANDIDATE_BYTES = 10 * 1024;
const MAX_CANDIDATES = 25;
const MAX_IMPORTERS = 8;
const MAX_CHUNK_OWNERS = 3;
const MAX_CHUNKS = 10;
const MAX_PACKAGE_MODULES = 5;

export type BuildOutputs = {
    projectRoot: string;
    packageManager: string;
    durationMs: { analyze: number | null; plain: number | null };
    /** The plain build's client assets directory, when it built. */
    assetsDir: string | null;
    /** The analyze build's visualizer report, when it wrote one. */
    visualizerHtml: string | null;
    /** The report's path in the run, for the dashboard. */
    visualizer: string | null;
    notes: string[];
};

type Chunk = ParsedChunk & { assigned: Map<string, number> };
type Owner = { name: string; kind: 'npm' | 'project' | 'build'; version?: string };

type BuildModel = {
    projectRoot: string;
    chunks: Map<string, Chunk>;
    /** Reconciled minified bytes per module: from the map, else its share of the chunk's unmapped bytes. */
    moduleBytes: Map<string, number>;
    manifest: RouterManifest | null;
    manifestFile: string | null;
    graph: ModuleGraph | null;
    attribution: {
        modules: number;
        unmappedModules: number;
        preloadLists: number;
        routerManifest: number;
        glue: number;
    };
    owner: (id: string) => Owner;
    display: (id: string) => string;
};

export async function analyzeBundle(
    outputs: BuildOutputs | null,
    pages: readonly PlayhouseCollection[],
    playhouse: PlayhouseArtifactReader
): Promise<BundleAnalysis> {
    const notes = [...(outputs?.notes ?? [])];
    let model: BuildModel | null = null;
    if (outputs?.assetsDir) {
        try {
            model = await readBuild(outputs, notes);
        } catch (error) {
            notes.push(`The build output could not be read: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const result: BundleAnalysis = {
        schemaVersion: BUNDLE_SCHEMA_VERSION,
        status: model?.graph ? 'complete' : model ? 'partial' : 'unavailable',
        notes,
        build:
            model && outputs
                ? {
                      packageManager: outputs.packageManager,
                      durationMs: outputs.durationMs,
                      visualizer: model.graph ? outputs.visualizer : null,
                      chunks: model.chunks.size,
                      withMaps: [...model.chunks.values()].filter((chunk) => chunk.hasMap).length,
                      bytes: [...model.chunks.values()].reduce((total, chunk) => total + chunk.bytes, 0),
                      attribution: model.attribution,
                  }
                : null,
        pages: [],
        skipped: [],
    };
    // One page's unreadable artifacts skip that page, not the analysis.
    for (const page of pages) {
        try {
            const live = await readLivePage(playhouse, page.label);
            if ('reason' in live) {
                result.skipped.push({ page: page.label, reason: live.reason });
                continue;
            }
            result.pages.push(analyzePage(live, page.url, model, notes));
        } catch (error) {
            result.skipped.push({ page: page.label, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return result;
}

// ---- the build

async function readBuild(outputs: BuildOutputs, notes: string[]): Promise<BuildModel> {
    await lexerReady;
    const { assetsDir, projectRoot } = outputs;
    if (!assetsDir) throw new Error('The build has no client assets directory.');
    const chunks = new Map<string, Chunk>();
    for (const file of (await readdir(assetsDir))
        .filter((name) => name.endsWith('.js'))
        .slice()
        .sort()) {
        const code = await readFile(path.join(assetsDir, file), 'utf8');
        const mapFile = path.join(assetsDir, `${file}.map`);
        const map = existsSync(mapFile) ? await readFile(mapFile, 'utf8') : undefined;
        chunks.set(file, { ...parseChunk(file, code, map, assetsDir), assigned: new Map() });
    }
    if (!chunks.size) throw new Error(`${path.relative(projectRoot, assetsDir)} has no JavaScript.`);

    const manifests = [...chunks.values()].filter((chunk) => chunk.routerManifest);
    let manifest: RouterManifest | null = null;
    const manifestFile = manifests.length === 1 ? manifests[0].file : null;
    if (manifestFile) manifest = parseRouterManifest(await readFile(path.join(assetsDir, manifestFile), 'utf8'));
    else
        notes.push(
            manifests.length
                ? `The build has ${manifests.length} React Router manifests; routes can't be read from it.`
                : "The build has no React Router manifest; routes can't be read from it."
        );

    const withoutMaps = [...chunks.values()].filter((chunk) => !chunk.hasMap && !chunk.routerManifest);
    if (withoutMaps.length)
        notes.push(`${withoutMaps.length} of ${chunks.size} chunks have no source map, so their modules aren't known.`);

    let graph: ModuleGraph | null = null;
    if (outputs.visualizerHtml) {
        const rootEntries = new Set(readdirSync(projectRoot));
        try {
            graph = parseVisualizerHtml(outputs.visualizerHtml, moduleIdResolver(projectRoot, rootEntries));
        } catch (error) {
            notes.push(
                `The visualizer report could not be read, so import suggestions are unavailable: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    if (graph) assignUnmappedModules(chunks, graph);

    const moduleBytes = new Map<string, number>();
    const attribution = { modules: 0, unmappedModules: 0, preloadLists: 0, routerManifest: 0, glue: 0 };
    for (const chunk of chunks.values()) {
        if (chunk.routerManifest) {
            attribution.routerManifest += chunk.bytes;
            continue;
        }
        let mapped = 0;
        let assigned = 0;
        for (const [id, size] of chunk.modules) {
            moduleBytes.set(id, (moduleBytes.get(id) ?? 0) + size);
            mapped += size;
        }
        for (const [id, size] of chunk.assigned) {
            moduleBytes.set(id, (moduleBytes.get(id) ?? 0) + size);
            assigned += size;
        }
        attribution.modules += mapped;
        attribution.unmappedModules += assigned;
        attribution.preloadLists += chunk.preloadList;
        attribution.glue += chunk.bytes - mapped - assigned - chunk.preloadList;
    }
    if (graph) {
        const missing = [...moduleBytes.keys()].filter((id) => !graph.has(id)).length;
        if (missing)
            notes.push(
                `${missing} modules in the build's source maps aren't in the visualizer's module graph; the two builds may differ.`
            );
    }
    const { owner, display } = ownership(projectRoot);
    return { projectRoot, chunks, moduleBytes, manifest, manifestFile, graph, attribution, owner, display };
}

/**
 * JSON modules (translations, mostly) have no mappings, so their bytes are unattributed in the map. The analyze
 * build's chunk with the same modules says which modules those bytes belong to; they're split in proportion to the
 * visualizer's pre-minification lengths, never more than the bytes left.
 */
function assignUnmappedModules(chunks: Map<string, Chunk>, graph: ModuleGraph): void {
    const byAnalyzeChunk = new Map<string, Set<string>>();
    for (const node of graph.values())
        for (const name of node.chunks) {
            const ids = byAnalyzeChunk.get(name) ?? new Set<string>();
            byAnalyzeChunk.set(name, ids.add(node.id));
        }
    const mappedSomewhere = new Set([...chunks.values()].flatMap((chunk) => [...chunk.modules.keys()]));
    for (const chunk of chunks.values()) {
        if (!chunk.modules.size || chunk.unattributed <= 0) continue;
        const overlap = new Map<string, number>();
        for (const id of chunk.modules.keys())
            for (const name of graph.get(id)?.chunks ?? []) overlap.set(name, (overlap.get(name) ?? 0) + 1);
        let best: string | undefined;
        let bestScore = 0;
        for (const [name, shared] of overlap) {
            const score = shared / (chunk.modules.size + (byAnalyzeChunk.get(name)?.size ?? 0) - shared);
            if (score > bestScore) {
                best = name;
                bestScore = score;
            }
        }
        if (!best) continue;
        const missing = [...(byAnalyzeChunk.get(best) ?? [])].filter(
            (id) => !mappedSomewhere.has(id) && (graph.get(id)?.rendered ?? 0) > 0
        );
        const rendered = missing.reduce((total, id) => total + (graph.get(id)?.rendered ?? 0), 0);
        if (!rendered) continue;
        const budget = Math.min(chunk.unattributed, rendered);
        // Largest-remainder rounding keeps the shares summing to exactly `budget`.
        const shares = missing.map((id) => {
            const exact = (budget * (graph.get(id)?.rendered ?? 0)) / rendered;
            return { id, size: Math.floor(exact), rest: exact % 1 };
        });
        let left = budget - shares.reduce((total, share) => total + share.size, 0);
        for (const share of shares.slice().sort((a, b) => b.rest - a.rest)) {
            if (left <= 0) break;
            share.size += 1;
            left -= 1;
        }
        for (const share of shares) if (share.size) chunk.assigned.set(share.id, share.size);
    }
}

/** Who owns a module, and how to show its path without the machine's directories. */
function ownership(projectRoot: string): { owner: (id: string) => Owner; display: (id: string) => string } {
    type Package = { name: string; dir: string; version?: string };
    const packages = new Map<string, Package | null>();
    const nearestPackage = (dir: string): Package | null => {
        if (packages.has(dir)) return packages.get(dir) ?? null;
        let found: Package | null = null;
        try {
            const { name, version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
            if (typeof name === 'string' && name)
                found = { name, dir, ...(typeof version === 'string' ? { version } : {}) };
        } catch {
            /* no package.json here */
        }
        const parent = path.dirname(dir);
        if (!found && parent !== dir) found = nearestPackage(parent);
        packages.set(dir, found);
        return found;
    };
    const inProject = (id: string): boolean => id.startsWith(projectRoot + path.sep);
    const afterNodeModules = (id: string): string | null => {
        const at = id.lastIndexOf(`${path.sep}node_modules${path.sep}`);
        return at < 0
            ? null
            : id
                  .slice(at + 14)
                  .split(path.sep)
                  .join('/');
    };
    const packageName = (rest: string): string => {
        const parts = rest.split('/');
        return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    };
    return {
        owner: (id) => {
            const rest = afterNodeModules(id);
            if (rest) {
                const name = packageName(rest);
                // The package's own folder: its package.json has the installed version (pnpm installs one folder per version).
                const dir =
                    id.slice(0, id.lastIndexOf(`${path.sep}node_modules${path.sep}`) + 14) +
                    name.split('/').join(path.sep);
                const version = nearestPackage(dir)?.version;
                return { name, kind: 'npm', ...(version ? { version } : {}) };
            }
            if (inProject(id)) {
                const parts = path.relative(projectRoot, id).split(path.sep);
                return { name: parts.slice(0, Math.min(parts.length, 3)).join('/'), kind: 'project' };
            }
            const pkg = nearestPackage(path.dirname(id));
            return pkg
                ? { name: pkg.name, kind: 'npm', ...(pkg.version ? { version: pkg.version } : {}) }
                : { name: 'Other', kind: 'build' };
        },
        display: (id) => {
            const rest = afterNodeModules(id);
            if (rest) return rest;
            if (inProject(id)) return path.relative(projectRoot, id).split(path.sep).join('/');
            const pkg = nearestPackage(path.dirname(id));
            return pkg ? `${pkg.name}/${path.relative(pkg.dir, id).split(path.sep).join('/')}` : path.basename(id);
        },
    };
}

// ---- one page

const BUILD_OWNERS = {
    preloadLists: 'Preload lists',
    routerManifest: 'React Router manifest',
    glue: 'Module glue',
} as const;

function analyzePage(live: LivePage, url: string, model: BuildModel | null, notes: string[]): BundlePage {
    const scripts = live.scripts;
    const sum = (items: typeof scripts, key: 'decodedBytes' | 'transferBytes'): number =>
        items.reduce((total, item) => total + item[key], 0);
    const beforeLoad = scripts.filter((script) => script.beforeLoad);
    const page: BundlePage = {
        page: live.page,
        runId: live.runId,
        lighthouseArtifact: live.lighthouseArtifact,
        observedLoadMs: live.observedLoadMs,
        live: {
            scripts: scripts.length,
            decodedBytes: sum(scripts, 'decodedBytes'),
            transferBytes: sum(scripts, 'transferBytes'),
            beforeLoad: beforeLoad.length,
            beforeLoadDecodedBytes: sum(beforeLoad, 'decodedBytes'),
            beforeLoadTransferBytes: sum(beforeLoad, 'transferBytes'),
        },
        route: live.rendered ? { ids: live.rendered.routes.map((route) => route.id), source: 'page' } : null,
        local: null,
    };
    if (!model?.manifest) return page;
    page.route = pageRoute(page.route, url, model.manifest, live.page, notes);
    if (page.route) page.local = localPage(page.route.ids, model, model.manifest, live.page, notes);
    return page;
}

/**
 * The live page's route ids when the local build has all of them (route ids are route file names, so they survive a
 * rebuild); else the local route branch whose paths match the page URL.
 */
function pageRoute(
    rendered: BundlePage['route'],
    url: string,
    manifest: RouterManifest,
    page: string,
    notes: string[]
): BundlePage['route'] {
    const missing = rendered?.ids.filter((id) => !manifest.routes[id]) ?? [];
    if (rendered && !missing.length) return rendered;
    const ids = routeForUrl(url, manifest);
    const why = rendered
        ? `the live page renders ${missing.join(', ')}, which the local build doesn't have`
        : "the live page's HTML doesn't name its routes";
    notes.push(
        `${page}: ${why}; ${ids ? `its URL matches the local route ${ids.at(-1)}, which is analyzed instead` : "no local route matches its URL, so the page isn't analyzed in the local build"}.`
    );
    return ids ? { ids, source: 'url' } : null;
}

/** The local route branch, root first, that React Router would render for a URL. */
export function routeForUrl(url: string, manifest: RouterManifest): string[] | null {
    let segments: string[];
    try {
        segments = new URL(url).pathname
            .split('/')
            .filter(Boolean)
            .map((part) => decodeURIComponent(part));
    } catch {
        return null;
    }
    let best: { ids: string[]; score: number } | null = null;
    for (const id of Object.keys(manifest.routes)) {
        const ids: string[] = [];
        for (
            let route: (typeof manifest.routes)[string] | undefined = manifest.routes[id];
            route && ids.length < 32;
            route = route.parentId ? manifest.routes[route.parentId] : undefined
        )
            ids.unshift(route.id);
        const score = matchPath(
            ids.flatMap((item) => (manifest.routes[item].path ?? '').split('/').filter(Boolean)),
            segments
        );
        if (score !== null && (!best || score > best.score || (score === best.score && ids.length > best.ids.length)))
            best = { ids, score };
    }
    return best?.ids ?? null;
}

/**
 * React Router's ranking, simplified: a static segment outranks a dynamic one, and a splat loses to any route that
 * matches without one (an index route at `/`). Null when the path doesn't match.
 */
function matchPath(pattern: readonly string[], segments: readonly string[]): number | null {
    const [part, ...rest] = pattern;
    if (part === undefined) return segments.length ? null : 0;
    if (part === '*') return -1;
    const optional = part.endsWith('?');
    const text = optional ? part.slice(0, -1) : part;
    const tail = segments.length && segmentPattern(text).test(segments[0]) ? matchPath(rest, segments.slice(1)) : null;
    const matched = tail === null ? null : tail + (text.startsWith(':') ? 3 : 10);
    const skipped = optional ? matchPath(rest, segments) : null;
    return matched === null ? skipped : skipped === null ? matched : Math.max(matched, skipped);
}
const segmentPattern = (text: string): RegExp =>
    new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^:[\w-]+/, '[^/]+')}$`, 'i');

/** What the page's routes load up front in the local build, what that code is, and the imports that pull in the most of it. */
function localPage(
    routeIds: readonly string[],
    model: BuildModel,
    manifest: RouterManifest,
    page: string,
    notes: string[]
): LocalPage {
    // React Router loads its manifest, then the entry and each route module of the branch with their static imports.
    const files = new Set<string>();
    const missing = new Set<string>();
    const add = (file: string): void => {
        if (files.has(file)) return;
        const chunk = model.chunks.get(file);
        if (!chunk) {
            missing.add(file);
            return;
        }
        files.add(file);
        for (const next of chunk.imports) add(next);
    };
    if (model.manifestFile) add(model.manifestFile);
    for (const file of [
        manifest.entry.module,
        ...manifest.entry.imports,
        ...routeIds.flatMap((id) => [manifest.routes[id].module, ...(manifest.routes[id].imports ?? [])]),
    ])
        add(file);
    if (missing.size)
        notes.push(`${page}: ${missing.size} chunks the local manifest names aren't in the build's client assets.`);
    const chunks = [...files].flatMap((file) => model.chunks.get(file) ?? []);

    // Minified bytes per module in this page's chunks, and who owns them.
    const pageBytes = new Map<string, number>();
    for (const chunk of chunks)
        for (const [id, size] of [...chunk.modules, ...chunk.assigned])
            pageBytes.set(id, (pageBytes.get(id) ?? 0) + size);
    const owners = new Map<string, BundlePackage>();
    for (const chunk of chunks)
        for (const row of chunkOwnerTable(chunk, model)) {
            const entry = owners.get(row.name) ?? {
                name: row.name,
                kind: row.kind,
                bytes: 0,
                modules: 0,
                largestModules: [],
                importers: [],
                importerCount: 0,
            };
            entry.bytes += row.bytes;
            entry.modules += row.modules;
            owners.set(row.name, entry);
        }
    const ownerModules = new Map<string, { file: string; bytes: number; version?: string }[]>();
    for (const [id, size] of pageBytes) {
        const owner = model.owner(id);
        const modules = ownerModules.get(owner.name) ?? [];
        ownerModules.set(owner.name, modules);
        modules.push({ file: model.display(id), bytes: size, ...(owner.version ? { version: owner.version } : {}) });
    }
    for (const [name, modules] of ownerModules) {
        const entry = owners.get(name);
        if (!entry) continue;
        entry.largestModules = largest(modules, MAX_PACKAGE_MODULES).map(({ file, bytes }) => ({ file, bytes }));
        const versions = [...new Set(modules.flatMap((module) => (module.version ? [module.version] : [])))]
            .slice()
            .sort();
        if (entry.kind === 'npm' && versions.length > 1) entry.versions = versions;
    }
    const local: LocalPage = {
        chunks: chunks.length,
        bytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
        largest: largest(chunks, MAX_CHUNKS).map((chunk) => ({
            file: chunk.file,
            bytes: chunk.bytes,
            owners: largest(chunkOwnerTable(chunk, model), MAX_CHUNK_OWNERS).map(({ name, bytes }) => ({
                name,
                bytes,
            })),
        })),
        packages: [...owners.values()].sort((a, b) => b.bytes - a.bytes),
        candidates: [],
    };

    const graph = model.graph;
    if (!graph) return local;
    const { roots, hydration } = rootModules(routeIds, model, manifest);
    if (!roots.size) return local;
    const reach = new Reachability(graph, roots);
    const imports = new ImportLines(model.projectRoot);
    // entry.client's own imports (react-dom/client, the router) start the app; they're never deferrable.
    const isImporter = (id: string): boolean => model.owner(id).kind === 'project' && !hydration.has(id);

    // Packages: who in the project imports them, and what making those imports lazy would free.
    for (const entry of local.packages) {
        if (entry.kind !== 'npm') continue;
        const edges: [string, string][] = [];
        for (const from of reach.reached) {
            if (!isImporter(from)) continue;
            for (const to of graph.get(from)?.static ?? [])
                if (reach.reached.has(to) && model.owner(to).name === entry.name && model.owner(to).kind === 'npm')
                    edges.push([from, to]);
        }
        if (!edges.length) continue;
        const importers = [...new Map(edges).entries()];
        entry.importerCount = importers.length;
        entry.importers = importers
            .slice(0, MAX_IMPORTERS)
            .map(([from, to]) => ({ file: model.display(from), ...imports.find(from, to, model) }));
        entry.deferrableBytes = reach.freedBy(edges, pageBytes).bytes;
    }

    // Single imports: each static edge out of a project module, by what removing it frees.
    const candidates: { from: string; to: string; freed: Freed }[] = [];
    for (const from of reach.reached) {
        if (!isImporter(from)) continue;
        for (const to of graph.get(from)?.static ?? []) {
            if (roots.has(to) || !reach.reached.has(to)) continue;
            const freed = reach.freedBy([[from, to]], pageBytes);
            if (freed.bytes >= MIN_CANDIDATE_BYTES) candidates.push({ from, to, freed });
        }
    }
    // An import inside code a larger candidate already frees, saving about as much, is the same suggestion one
    // level down (`_app → mega-menu` and `mega-menu/index → mega-menu/engine`); only the outer one is kept.
    const kept: typeof candidates = [];
    for (const candidate of candidates
        .slice()
        .sort((a, b) => b.freed.bytes - a.freed.bytes || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) {
        if (
            kept.some(
                (outer) =>
                    outer.freed.ids.has(candidate.from) &&
                    outer.freed.bytes - candidate.freed.bytes < MIN_CANDIDATE_BYTES
            )
        )
            continue;
        kept.push(candidate);
        if (kept.length === MAX_CANDIDATES) break;
    }
    // Project files that already load a module with import(): a static import elsewhere defeats that split.
    const lazyImporters = new Map<string, string[]>();
    for (const node of graph.values()) {
        if (model.owner(node.id).kind !== 'project') continue;
        for (const to of node.dynamic)
            lazyImporters.set(to, [...(lazyImporters.get(to) ?? []), model.display(node.id)]);
    }
    local.candidates = kept.map(({ from, to, freed }): BundleCandidate => {
        const lazy = lazyImporters.get(to) ?? [];
        return {
            importer: { file: model.display(from), ...imports.find(from, to, model) },
            target: model.display(to),
            package: model.owner(to).name,
            savedBytes: freed.bytes,
            savedModules: freed.ids.size,
            ...(lazy.length ? { lazyElsewhere: lazy.slice(0, MAX_IMPORTERS) } : {}),
        };
    });
    return local;
}

/**
 * The modules the page starts from, found in the build's chunks for entry.client and the route modules; `hydration`
 * is entry.client's share of them.
 */
function rootModules(
    routeIds: readonly string[],
    model: BuildModel,
    manifest: RouterManifest
): { roots: Set<string>; hydration: Set<string> } {
    const roots = new Set<string>();
    const hydration = new Set<string>();
    const files = [manifest.entry.module, ...routeIds.map((id) => manifest.routes[id].module)];
    for (const [index, file] of files.entries()) {
        const chunk = model.chunks.get(file);
        if (!chunk) continue;
        const modules = [...chunk.modules.keys(), ...chunk.assigned.keys()];
        const entries = modules.filter((id) => model.graph?.get(id)?.entry);
        // A chunk whose entry module isn't recognised keeps every module as a root: that only hides suggestions.
        for (const id of entries.length ? entries : modules) {
            roots.add(id);
            if (index === 0) hydration.add(id);
        }
    }
    return { roots, hydration };
}

function chunkOwnerTable(
    chunk: Chunk,
    model: BuildModel
): { name: string; kind: Owner['kind']; bytes: number; modules: number }[] {
    const table = new Map<string, { name: string; kind: Owner['kind']; bytes: number; modules: number }>();
    const add = (owner: Owner, size: number, modules: number): void => {
        if (size <= 0) return;
        const entry = table.get(owner.name) ?? { name: owner.name, kind: owner.kind, bytes: 0, modules: 0 };
        entry.bytes += size;
        entry.modules += modules;
        table.set(owner.name, entry);
    };
    if (chunk.routerManifest) {
        add({ name: BUILD_OWNERS.routerManifest, kind: 'build' }, chunk.bytes, 0);
        return [...table.values()];
    }
    let attributed = chunk.preloadList;
    for (const [id, size] of [...chunk.modules, ...chunk.assigned]) {
        add(model.owner(id), size, 1);
        attributed += size;
    }
    add({ name: BUILD_OWNERS.preloadLists, kind: 'build' }, chunk.preloadList, 0);
    add({ name: BUILD_OWNERS.glue, kind: 'build' }, chunk.bytes - attributed, 0);
    return [...table.values()];
}

const largest = <T extends { bytes: number }>(items: T[], count: number): T[] =>
    items
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, count);

type Freed = { bytes: number; ids: Set<string> };

/** Static reachability from the page's roots, and what removing some import edges would stop loading. */
class Reachability {
    readonly reached: Set<string>;
    constructor(
        private readonly graph: ModuleGraph,
        private readonly roots: ReadonlySet<string>
    ) {
        this.reached = this.#walk(new Set());
    }

    freedBy(edges: readonly [string, string][], moduleBytes: ReadonlyMap<string, number>): Freed {
        const remaining = this.#walk(new Set(edges.map(([from, to]) => `${from}\n${to}`)));
        const ids = new Set<string>();
        let bytes = 0;
        for (const id of this.reached)
            if (!remaining.has(id)) {
                bytes += moduleBytes.get(id) ?? 0;
                ids.add(id);
            }
        return { bytes, ids };
    }

    #walk(skip: ReadonlySet<string>): Set<string> {
        const seen = new Set<string>();
        const stack = [...this.roots];
        for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
            if (seen.has(id)) continue;
            seen.add(id);
            for (const to of this.graph.get(id)?.static ?? [])
                if (!skip.size || !skip.has(`${id}\n${to}`)) stack.push(to);
        }
        return seen;
    }
}

/** Finds the import statement in a project file that brings in a module, when exactly one does. */
class ImportLines {
    readonly #files = new Map<string, string | null>();
    constructor(private readonly projectRoot: string) {}

    find(from: string, to: string, model: BuildModel): { line?: number; excerpt?: string } {
        const text = this.#read(from);
        if (!text) return {};
        const target = model.owner(to);
        const matches: { start: number; end: number }[] = [];
        for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\1/g)) {
            const start = Math.max(text.lastIndexOf('import', match.index), text.lastIndexOf('export', match.index));
            if (start < 0 || /^(?:import|export)\s+type\b/.test(text.slice(start))) continue;
            if (this.#resolves(match[2], from, to, target)) matches.push({ start, end: match.index + match[0].length });
        }
        if (matches.length !== 1) return {};
        const { start, end } = matches[0];
        const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
        return {
            line: text.slice(0, start).split('\n').length,
            excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 157)}…` : excerpt,
        };
    }

    #resolves(specifier: string, from: string, to: string, target: Owner): boolean {
        if (target.kind === 'npm') return specifier === target.name || specifier.startsWith(`${target.name}/`);
        const bare = to.replace(/\.[cm]?[jt]sx?$/, '');
        const candidates = path.basename(bare) === 'index' ? [bare, path.dirname(bare)] : [bare];
        if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(from), specifier).replace(/\.[cm]?[jt]sx?$/, '');
            return candidates.includes(resolved);
        }
        // Path aliases (`@/components/x`, `~/lib/y`, `#app/z`): the rest of the specifier ends the target's path.
        const alias = specifier.match(/^(?:@|~|#[^/]*|src)\/(.+)$/)?.[1];
        return (
            alias !== undefined &&
            candidates.some((candidate) =>
                candidate.endsWith(
                    `${path.sep}${alias
                        .replace(/\.[cm]?[jt]sx?$/, '')
                        .split('/')
                        .join(path.sep)}`
                )
            )
        );
    }

    #read(file: string): string | null {
        if (!this.#files.has(file)) {
            let text: string | null = null;
            if (file.startsWith(this.projectRoot + path.sep) && /\.[cm]?[jt]sx?$/.test(file)) {
                try {
                    text = readFileSync(file, 'utf8');
                } catch {
                    /* deleted since the build */
                }
            }
            this.#files.set(file, text);
        }
        return this.#files.get(file) ?? null;
    }
}
