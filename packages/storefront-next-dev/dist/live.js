import path from "node:path";
import { z } from "zod";
import { decode } from "@jridgewell/sourcemap-codec";
import { ImportType, init, parse } from "es-module-lexer";

//#region src/audit/bundle/parse.ts
const visualizerSchema = z.object({
	version: z.number(),
	nodeParts: z.record(z.string(), z.object({
		renderedLength: z.number(),
		metaUid: z.string()
	}).passthrough()),
	nodeMetas: z.record(z.string(), z.object({
		id: z.string(),
		moduleParts: z.record(z.string(), z.string()),
		imported: z.array(z.object({
			uid: z.string(),
			dynamic: z.boolean().optional()
		}).passthrough()),
		isEntry: z.boolean().nullable().optional()
	}).passthrough())
}).passthrough();
/** Data versions this parser has been checked against. */
const VISUALIZER_VERSIONS = new Set([2]);
/** Rollup's virtual modules (`\0vite/preload-helper`) have no file; they're bundler runtime. */
const isVirtual = (id) => id.startsWith("\0") && !id.slice(1).startsWith("/");
/**
* The visualizer writes ids relative to the project root when they're inside it (`/src/root.tsx`) and absolute
* otherwise (a hoisted `node_modules`). An id is relative when its first segment is an entry of the project root.
*/
function moduleIdResolver(projectRoot, rootEntries) {
	return (raw) => {
		const id = (raw.startsWith("\0") ? raw.slice(1) : raw).replace(/\?.*$/, "");
		const first = id.split("/")[1] ?? "";
		return id.startsWith("/") && rootEntries.has(first) ? path.join(projectRoot, id) : path.resolve(id);
	};
}
function parseVisualizerHtml(html, resolveId) {
	const match = html.match(/^\s*const data = (\{.*\});\s*$/m);
	if (!match) throw new Error("The visualizer report has no embedded `const data = {…}`.");
	const data = visualizerSchema.parse(JSON.parse(match[1]));
	if (!VISUALIZER_VERSIONS.has(data.version)) throw new Error(`Unsupported visualizer data version ${data.version}.`);
	const graph = /* @__PURE__ */ new Map();
	for (const meta of Object.values(data.nodeMetas)) {
		if (isVirtual(meta.id)) continue;
		const id = resolveId(meta.id);
		const node = graph.get(id) ?? {
			id,
			static: /* @__PURE__ */ new Set(),
			dynamic: /* @__PURE__ */ new Set(),
			rendered: 0,
			entry: false,
			chunks: /* @__PURE__ */ new Set()
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
	for (const node of graph.values()) for (const target of node.dynamic) node.static.delete(target);
	return graph;
}
const sourceMapSchema = z.object({
	sources: z.array(z.string().nullable()),
	sourceRoot: z.string().optional(),
	mappings: z.string()
}).passthrough();
const PRELOAD_LIST_PREFIX = "const __vite__mapDeps=";
const ROUTER_MANIFEST_PREFIX = "window.__reactRouterManifest=";
const lexerReady = init;
/** `code` and `map` are the chunk and its `.map` (absent when the build wrote none); `assetsDir` resolves map sources. */
function parseChunk(file, code, map, assetsDir) {
	const bytes = Buffer.byteLength(code);
	const routerManifest = code.startsWith(ROUTER_MANIFEST_PREFIX);
	const imports = /* @__PURE__ */ new Set();
	const dynamicImports = /* @__PURE__ */ new Set();
	if (!routerManifest) for (const item of parse(code)[0]) {
		if (item.t === ImportType.ImportMeta || !item.n?.startsWith("./")) continue;
		(item.t === ImportType.Dynamic ? dynamicImports : imports).add(item.n.slice(2));
	}
	const lines = code.split("\n");
	const preloadList = lines[0].startsWith(PRELOAD_LIST_PREFIX) ? Buffer.byteLength(lines[0]) + (lines.length > 1 ? 1 : 0) : 0;
	const chunk = {
		file,
		bytes,
		modules: /* @__PURE__ */ new Map(),
		preloadList,
		unattributed: bytes - preloadList,
		hasMap: false,
		routerManifest,
		imports: [...imports],
		dynamicImports: [...dynamicImports].filter((item) => !imports.has(item))
	};
	if (routerManifest || map === void 0) return chunk;
	const parsed = sourceMapSchema.parse(JSON.parse(map));
	const sourceBase = path.resolve(assetsDir, parsed.sourceRoot ?? "");
	const sources = parsed.sources.map((source) => source === null || source.includes("\0") ? null : path.resolve(sourceBase, source.replace(/\?.*$/, "")));
	const decoded = decode(parsed.mappings);
	let unattributed = 0;
	const add = (source, length) => {
		const id = source === void 0 ? null : sources[source];
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
		unattributed += Buffer.byteLength(line.slice(0, segments[0][0]));
		segments.forEach((segment, k) => {
			const end = k + 1 < segments.length ? segments[k + 1][0] : line.length;
			add(segment.length >= 4 ? segment[1] : void 0, Buffer.byteLength(line.slice(segment[0], end)));
		});
	});
	chunk.hasMap = true;
	chunk.unattributed = unattributed;
	return chunk;
}
const manifestRouteSchema = z.object({
	id: z.string(),
	parentId: z.string().optional(),
	path: z.string().optional(),
	index: z.boolean().optional(),
	module: z.string(),
	imports: z.array(z.string()).optional()
}).passthrough();
const routerManifestSchema = z.object({
	entry: z.object({
		module: z.string(),
		imports: z.array(z.string())
	}).passthrough(),
	routes: z.record(z.string(), manifestRouteSchema)
}).passthrough();
/** A chunk URL as the chunk's file name, the key every source here shares. */
const assetName = (url) => url.replace(/[?#].*$/, "").split("/").at(-1) ?? url;
/**
* Parses `window.__reactRouterManifest={…}`. React Router writes JSON; the storefront-next SDK replaces each URL
* with `(window._BUNDLE_PATH || "/") + "assets/x.js"`, which is folded back to a string. Module URLs become file names.
*/
function parseRouterManifest(code) {
	if (!code.startsWith(ROUTER_MANIFEST_PREFIX)) throw new Error("Not a React Router manifest chunk.");
	const json = code.slice(29).trim().replace(/;$/, "").replace(/\(\s*window\._BUNDLE_PATH\s*\|\|\s*"[^"]*"\s*\)\s*\+\s*"/g, "\"");
	const manifest = routerManifestSchema.parse(JSON.parse(json));
	manifest.entry.module = assetName(manifest.entry.module);
	manifest.entry.imports = manifest.entry.imports.map(assetName);
	for (const route of Object.values(manifest.routes)) {
		route.module = assetName(route.module);
		if (route.imports) route.imports = route.imports.map(assetName);
	}
	return manifest;
}
/**
* React Router's `<Scripts>` renders an inline module that imports the matched routes and names them:
* `import * as route0 from "…/root-x.js"; … window.__reactRouterRouteModules = {"root":route0,…}; import("…/entry.client-y.js");`.
* That is the page's route branch, from the deployed site itself. Undefined when the script isn't this one.
*/
function parseRouteModulesScript(code) {
	const assignment = code.match(/window\.__reactRouterRouteModules\s*=\s*\{([^}]*)\}/);
	if (!assignment || assignment.index === void 0) return void 0;
	const files = new Map([...code.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s*"([^"]+)"/g)].map((item) => [item[1], assetName(item[2])]));
	const routes = [...assignment[1].matchAll(/"([^"]+)"\s*:\s*(\w+)/g)].flatMap((item) => {
		const file = files.get(item[2]);
		return file ? [{
			id: item[1],
			file
		}] : [];
	});
	if (!routes.length) return void 0;
	const entry = code.slice(assignment.index).match(/import\(\s*"([^"]+)"\s*\)/)?.[1];
	return {
		routes,
		...entry ? { entry: assetName(entry) } : {}
	};
}

//#endregion
//#region src/audit/bundle/live.ts
const CELL = {
	formFactor: "mobile",
	cacheState: "cold"
};
/** Storefront Next serves the app's build from this path on Managed Runtime. */
const BUNDLE_PATH = "/mobify/bundle/";
const lcpSummarySchema = z.object({ cells: z.array(z.object({
	formFactor: z.string(),
	cacheState: z.string(),
	median: z.object({ runId: z.string() }).passthrough().nullable().optional()
}).passthrough()) }).passthrough();
const requestSchema = z.object({
	url: z.string(),
	resourceType: z.string().optional(),
	statusCode: z.number().optional(),
	resourceSize: z.number().optional(),
	transferSize: z.number().optional(),
	networkRequestTime: z.number().optional()
}).passthrough();
const lhrSchema = z.object({ audits: z.object({
	"network-requests": z.object({ details: z.object({ items: z.array(requestSchema) }).passthrough().optional() }).passthrough().optional(),
	metrics: z.object({ details: z.object({ items: z.array(z.object({ observedLoad: z.number().optional() }).passthrough()) }).passthrough().optional() }).passthrough().optional()
}).passthrough() }).passthrough();
const scriptsIndexSchema = z.object({ observations: z.array(z.object({
	runId: z.string(),
	url: z.string(),
	body: z.object({ sha256: z.string() }).passthrough().nullable().optional()
}).passthrough()) }).passthrough();
/** A first-party script: served from the storefront's bundle path. */
function isFirstParty(url) {
	try {
		return new URL(url).pathname.includes(BUNDLE_PATH);
	} catch {
		return false;
	}
}
/** The page's median mobile cold-cache run's first-party scripts, or why they can't be read. */
async function readLivePage(playhouse, page) {
	const runId = (await playhouse.readJson(page, "summary-lcp.json", lcpSummarySchema))?.cells.find((cell) => cell.formFactor === CELL.formFactor && cell.cacheState === CELL.cacheState)?.median?.runId;
	if (!runId) return { reason: "summary-lcp.json has no mobile cold-cache median run." };
	const lighthouseArtifact = `runs/${runId}/lhr.json`;
	const lhr = await playhouse.readJson(page, lighthouseArtifact, lhrSchema);
	const items = lhr?.audits["network-requests"]?.details?.items;
	if (!items) return { reason: `${lighthouseArtifact} has no network-requests audit.` };
	const load = lhr.audits.metrics?.details?.items[0]?.observedLoad;
	const observedLoadMs = typeof load === "number" && load > 0 ? load : null;
	const scripts = items.flatMap((request, item) => {
		if (request.resourceType !== "Script" || (request.statusCode ?? 200) >= 400 || !isFirstParty(request.url)) return [];
		const startMs = request.networkRequestTime ?? null;
		return [{
			url: request.url,
			file: assetName(request.url),
			item,
			decodedBytes: request.resourceSize ?? 0,
			transferBytes: request.transferSize ?? 0,
			startMs,
			beforeLoad: observedLoadMs === null || startMs !== null && startMs <= observedLoadMs
		}];
	});
	const rendered = await readRenderedRoutes(playhouse, page, runId);
	return {
		page,
		runId,
		lighthouseArtifact,
		observedLoadMs,
		scripts,
		...rendered ? { rendered } : {}
	};
}
/** The route branch from React Router's inline script in the run's HTML, when Playhouse archived it. */
async function readRenderedRoutes(playhouse, page, runId) {
	const index = await playhouse.readJson(page, "scripts/index.json", scriptsIndexSchema);
	const seen = /* @__PURE__ */ new Set();
	for (const observation of index?.observations ?? []) {
		const sha = observation.body?.sha256;
		if (observation.runId !== runId || !sha || !/^[a-f0-9]{64}$/.test(sha) || seen.has(sha) || /\.m?js(?:[?#]|$)/.test(observation.url)) continue;
		seen.add(sha);
		const code = await playhouse.readText(page, `scripts/${sha}.js`);
		const rendered = code === void 0 ? void 0 : parseRouteModulesScript(code);
		if (rendered) return rendered;
	}
}

//#endregion
export { parseRouterManifest as a, parseChunk as i, lexerReady as n, parseVisualizerHtml as o, moduleIdResolver as r, readLivePage as t };