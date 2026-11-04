import "../../../../../har.js";
import { i as kib } from "../../../../../document-size.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/third-party-fonts.ts
const CELL = "mobile-cold";
/** Requests listed per failing page, in the summary and as evidence. */
const MAX_ITEMS = 4;
const summarySchema = z.object({ runs: z.array(z.object({
	runId: z.string().optional(),
	formFactor: z.string().optional(),
	cacheState: z.string().optional(),
	isMedian: z.boolean().optional()
}).passthrough()).optional().default([]) }).passthrough();
const requestSchema = z.object({
	url: z.string(),
	resourceType: z.string().nullish(),
	statusCode: z.number().nullish(),
	rendererStartTime: z.number().nullish(),
	resourceSize: z.number().nullish(),
	isLinkPreload: z.boolean().nullish(),
	entity: z.string().nullish()
}).passthrough();
const lhrSchema = z.object({ audits: z.object({
	"network-requests": z.object({ details: z.object({
		items: z.array(requestSchema).optional(),
		debugData: z.object({ networkStartTimeTs: z.number().nullish() }).passthrough().optional()
	}).passthrough().optional() }).passthrough().optional(),
	metrics: z.object({ details: z.object({ items: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough().optional() }).passthrough().optional()
}).passthrough() }).passthrough();
const harSchema = z.object({ log: z.object({ entries: z.array(z.object({
	request: z.object({ url: z.string() }).passthrough(),
	_initiator: z.unknown().optional()
}).passthrough()) }).passthrough() }).passthrough();
const itemSchema = z.object({
	kind: z.enum(["font", "stylesheet"]),
	url: z.string(),
	host: z.string(),
	bytes: z.number(),
	requestMs: z.number(),
	preloaded: z.boolean(),
	renderBlocking: z.boolean(),
	stylesheet: z.string().nullable(),
	entry: z.number()
}).strict();
const pageSchema = z.object({
	page: z.string(),
	url: z.string(),
	lighthouseArtifact: z.string(),
	harArtifact: z.string().nullable(),
	lcpMs: z.number(),
	loadMs: z.number().nullable(),
	firstPartyFonts: z.number(),
	items: z.array(itemSchema)
}).strict();
const dataSchema = z.object({
	cell: z.string(),
	pages: z.array(pageSchema),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const finite = (value) => typeof value === "number" && Number.isFinite(value);
/** The median mobile cold-cache run, so the requests come from the same run as the page's reported metrics. */
async function medianRun(playhouse, page) {
	const runs = ((await playhouse.readJson(page, "summary.json", summarySchema))?.runs ?? []).filter((run) => run.runId && `${run.formFactor}-${run.cacheState}` === CELL);
	return (runs.find((run) => run.isMedian) ?? runs[0])?.runId ?? `${CELL}-1`;
}
function host(url) {
	try {
		return new URL(url).host;
	} catch {
		return;
	}
}
/** Third-party fonts and font stylesheets one page requested in its median mobile cold-cache run, each URL once. */
async function measurePage(playhouse, page) {
	const run = await medianRun(playhouse, page);
	const lighthouseArtifact = `runs/${run}/lhr.json`;
	const lhr = await playhouse.readJson(page, lighthouseArtifact, lhrSchema);
	if (!lhr) return { reason: `${lighthouseArtifact} is missing.` };
	const network = lhr.audits["network-requests"]?.details;
	const requests = network?.items;
	const metrics = lhr.audits.metrics?.details?.items?.[0];
	if (!requests) return { reason: "The Lighthouse result has no network-requests audit." };
	const lcpMs = metrics?.observedLargestContentfulPaint;
	if (!finite(lcpMs)) return { reason: "The Lighthouse result has no observed LCP." };
	const document = requests.find((request) => request.resourceType === "Document");
	if (!document) return { reason: "The Lighthouse result has no document request to tell first- from third-party." };
	const networkStart = network.debugData?.networkStartTimeTs;
	const navigationStart = metrics?.observedNavigationStartTs;
	const offsetMs = finite(networkStart) && finite(navigationStart) ? (networkStart - navigationStart) / 1e3 : 0;
	const loadMs = metrics?.observedLoad;
	const cutoffMs = finite(loadMs) ? Math.min(lcpMs, loadMs) : lcpMs;
	const harArtifact = `runs/${run}/network.har`;
	const har = await playhouse.readJson(page, harArtifact, harSchema);
	const initiators = /* @__PURE__ */ new Map();
	for (const entry of har?.log.entries ?? []) if (typeof entry._initiator === "string" && !initiators.has(entry.request.url)) initiators.set(entry.request.url, entry._initiator);
	const stylesheets = new Set(requests.filter((request) => request.resourceType === "Stylesheet").map((request) => request.url));
	const stylesheetOf = (url) => {
		const initiator = initiators.get(url);
		return initiator && stylesheets.has(initiator) ? initiator : null;
	};
	const thirdParty = (request) => document.entity && request.entity ? request.entity !== document.entity : host(request.url) !== host(document.url);
	const found = /* @__PURE__ */ new Map();
	let firstPartyFonts = 0;
	const ok = (request) => !(finite(request.statusCode) && request.statusCode >= 400);
	for (const [entry, request] of requests.entries()) {
		if (request.resourceType !== "Font" || !ok(request)) continue;
		if (!thirdParty(request)) {
			firstPartyFonts++;
			continue;
		}
		if (!finite(request.rendererStartTime)) return { reason: `The font request ${request.url} has no start time.` };
		const requestMs = Math.round(request.rendererStartTime + offsetMs);
		const preloaded = request.isLinkPreload === true;
		const known = found.get(request.url);
		if (known) {
			if (requestMs < known.requestMs) Object.assign(known, {
				requestMs,
				entry
			});
			known.preloaded ||= preloaded;
			known.renderBlocking = known.preloaded || known.requestMs < cutoffMs;
			continue;
		}
		found.set(request.url, {
			kind: "font",
			url: request.url,
			host: host(request.url) ?? request.url,
			bytes: finite(request.resourceSize) ? request.resourceSize : 0,
			requestMs,
			preloaded,
			renderBlocking: preloaded || requestMs < cutoffMs,
			stylesheet: stylesheetOf(request.url),
			entry
		});
	}
	const fontList = [...found.values()];
	const fontSources = new Set(fontList.flatMap((font) => font.stylesheet ?? []));
	const fontEntities = new Set(fontList.flatMap((font) => requests[font.entry]?.entity ?? []));
	for (const [entry, request] of requests.entries()) {
		if (request.resourceType !== "Stylesheet" || !ok(request) || !thirdParty(request) || found.has(request.url)) continue;
		if (!(fontSources.has(request.url) || !har && request.entity && fontEntities.has(request.entity))) continue;
		if (!finite(request.rendererStartTime)) continue;
		const requestMs = Math.round(request.rendererStartTime + offsetMs);
		const preloaded = request.isLinkPreload === true;
		found.set(request.url, {
			kind: "stylesheet",
			url: request.url,
			host: host(request.url) ?? request.url,
			bytes: finite(request.resourceSize) ? request.resourceSize : 0,
			requestMs,
			preloaded,
			renderBlocking: preloaded || requestMs < cutoffMs,
			stylesheet: stylesheetOf(request.url),
			entry
		});
	}
	return {
		page,
		url: document.url,
		lighthouseArtifact,
		harArtifact: har ? harArtifact : null,
		lcpMs: Math.round(lcpMs),
		loadMs: finite(loadMs) ? Math.round(loadMs) : null,
		firstPartyFonts,
		items: [...found.values()].sort((a, b) => a.requestMs - b.requestMs)
	};
}
function fileName(url) {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").at(-1) || url);
	} catch {
		return url;
	}
}
/** "fonts.googleapis.com/css2?family=Inter" for a stylesheet, "inter-latin.woff2 48 KiB" for a font. */
function label(item) {
	if (item.kind === "font") return item.bytes > 0 ? `${fileName(item.url)} ${kib(item.bytes)}` : fileName(item.url);
	try {
		const url = new URL(item.url);
		return `${url.host}${url.pathname}${url.search.split("&")[0]}`;
	} catch {
		return item.url;
	}
}
/** A stylesheet by file name on the page's own host ("app.css"), by host and path elsewhere ("fonts.googleapis.com/css2"). */
function sheetName(url, size) {
	try {
		const parsed = new URL(url);
		return parsed.host === host(size.url) ? fileName(url) : `${parsed.host}${parsed.pathname}`;
	} catch {
		return url;
	}
}
/** "imported by app.css" for a stylesheet, "loaded by fonts.googleapis.com/css2" for a font; empty when the HAR doesn't say. */
function source(item, size) {
	if (!item.stylesheet) return "";
	return `${item.kind === "stylesheet" ? "imported by" : "loaded by"} ${sheetName(item.stylesheet, size)}`;
}
function why(item, size) {
	const from = source(item, size);
	return `${item.preloaded ? "preloaded" : `requested at ${item.requestMs} ms, before LCP at ${size.lcpMs} ms`}${from ? `, ${from}` : ""}`;
}
const blocking = (size) => size.items.filter((item) => item.renderBlocking);
/** "home (fonts.googleapis.com/css2?family=Inter imported by app.css; inter-latin.woff2 48 KiB from fonts.gstatic.com)". */
function breakdown(size) {
	const items = blocking(size);
	const shown = items.slice(0, MAX_ITEMS).map((item) => item.kind === "font" ? `${label(item)} from ${item.host}` : [label(item), source(item, size)].filter(Boolean).join(" "));
	if (items.length > MAX_ITEMS) shown.push(`+${items.length - MAX_ITEMS} more`);
	return `${size.page} (${shown.join("; ")})`;
}
function passDetail(size) {
	const later = size.items.filter((item) => item.kind === "font").length;
	const own = `${size.firstPartyFonts} first-party font${size.firstPartyFonts === 1 ? "" : "s"}`;
	return `${size.page} ${own}${later ? `, ${later} third-party after LCP or load` : ""}`;
}
var third_party_fonts_default = (async ({ pages, playhouse }) => {
	const data = {
		cell: CELL,
		pages: [],
		skipped: []
	};
	const measured = await Promise.all(pages.map((page) => measurePage(playhouse, page.label)));
	for (const [index, size] of measured.entries()) if ("reason" in size) data.skipped.push({
		page: pages[index].label,
		reason: size.reason
	});
	else data.pages.push(size);
	if (!data.pages.length) return { data };
	const failing = data.pages.filter((size) => blocking(size).length);
	if (!failing.length) return {
		data,
		decision: {
			status: "pass",
			summary: `No measured page loads fonts from another origin before LCP (${data.pages.map(passDetail).join(", ")}).`,
			evidence: data.pages.map((size) => ({
				type: "playhouse",
				page: size.page,
				artifact: size.lighthouseArtifact,
				pointer: "/audits/network-requests/details/items",
				value: `Third-party fonts before LCP: none (${passDetail(size)})`
			}))
		}
	};
	return {
		data,
		decision: {
			status: "fail",
			summary: `Fonts load from another origin before LCP on ${failing.map(breakdown).join("; ")}.`,
			evidence: failing.flatMap((size) => blocking(size).slice(0, MAX_ITEMS).map((item) => ({
				type: "playhouse",
				page: size.page,
				artifact: size.lighthouseArtifact,
				pointer: `/audits/network-requests/details/items/${item.entry}/url`,
				value: `${item.kind === "font" ? "Font" : "Font stylesheet"} ${label(item)} from ${item.host}, ${why(item, size)}`
			})))
		}
	};
});

//#endregion
export { dataSchema, third_party_fonts_default as default };