import "../../../../../har.js";
import { i as kib } from "../../../../../document-size.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/render-blocking-font-size.ts
const BUDGET = 75 * 1024;
const CELL = "mobile-cold";
/** Fonts listed per failing page, in the summary and as evidence. */
const MAX_FILES = 4;
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
const fontSchema = z.object({
	url: z.string(),
	bytes: z.number(),
	requestMs: z.number(),
	preloaded: z.boolean(),
	renderBlocking: z.boolean(),
	thirdParty: z.boolean(),
	entry: z.number()
}).strict();
const pageSchema = z.object({
	page: z.string(),
	url: z.string(),
	lighthouseArtifact: z.string(),
	lcpMs: z.number(),
	loadMs: z.number().nullable(),
	renderBlockingBytes: z.number(),
	laterBytes: z.number(),
	fonts: z.array(fontSchema)
}).strict();
const dataSchema = z.object({
	cell: z.string(),
	budget: z.number(),
	pages: z.array(pageSchema),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const finite = (value) => typeof value === "number" && Number.isFinite(value);
/** The median mobile cold-cache run, so the fonts come from the same run as the page's reported metrics. */
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
/** Every font one page downloaded in its median mobile cold-cache run, each URL once, marked render-blocking when preloaded or requested before both LCP and the load event. */
async function measurePage(playhouse, page) {
	const lighthouseArtifact = `runs/${await medianRun(playhouse, page)}/lhr.json`;
	const lhr = await playhouse.readJson(page, lighthouseArtifact, lhrSchema);
	if (!lhr) return { reason: `${lighthouseArtifact} is missing.` };
	const network = lhr.audits["network-requests"]?.details;
	const requests = network?.items;
	const metrics = lhr.audits.metrics?.details?.items?.[0];
	if (!requests) return { reason: "The Lighthouse result has no network-requests audit." };
	const lcpMs = metrics?.observedLargestContentfulPaint;
	if (!finite(lcpMs)) return { reason: "The Lighthouse result has no observed LCP." };
	const networkStart = network.debugData?.networkStartTimeTs;
	const navigationStart = metrics?.observedNavigationStartTs;
	const offsetMs = finite(networkStart) && finite(navigationStart) ? (networkStart - navigationStart) / 1e3 : 0;
	const loadMs = metrics?.observedLoad;
	const cutoffMs = finite(loadMs) ? Math.min(lcpMs, loadMs) : lcpMs;
	const document = requests.find((request) => request.resourceType === "Document");
	const fonts = /* @__PURE__ */ new Map();
	for (const [entry, request] of requests.entries()) {
		if (request.resourceType !== "Font" || !finite(request.resourceSize) || request.resourceSize <= 0) continue;
		if (finite(request.statusCode) && request.statusCode >= 400) continue;
		if (!finite(request.rendererStartTime)) return { reason: `The font request ${request.url} has no start time.` };
		const requestMs = Math.round(request.rendererStartTime + offsetMs);
		const preloaded = request.isLinkPreload === true;
		const known = fonts.get(request.url);
		if (known) {
			if (requestMs < known.requestMs) Object.assign(known, {
				requestMs,
				entry
			});
			known.preloaded ||= preloaded;
			known.renderBlocking = known.preloaded || known.requestMs < cutoffMs;
			continue;
		}
		const thirdParty = !document ? false : document.entity && request.entity ? request.entity !== document.entity : host(request.url) !== host(document.url);
		fonts.set(request.url, {
			url: request.url,
			bytes: request.resourceSize,
			requestMs,
			preloaded,
			renderBlocking: preloaded || requestMs < cutoffMs,
			thirdParty,
			entry
		});
	}
	const list = [...fonts.values()];
	const total = (items) => items.reduce((sum, font) => sum + font.bytes, 0);
	return {
		page,
		url: document?.url ?? "",
		lighthouseArtifact,
		lcpMs: Math.round(lcpMs),
		loadMs: finite(loadMs) ? Math.round(loadMs) : null,
		renderBlockingBytes: total(list.filter((font) => font.renderBlocking)),
		laterBytes: total(list.filter((font) => !font.renderBlocking)),
		fonts: list
	};
}
/** A size, marked "just over" when it would otherwise read the same as the budget it exceeds. */
const shown = (bytes) => bytes > BUDGET && kib(bytes) === kib(BUDGET) ? `just over ${kib(BUDGET)}` : kib(bytes);
function fileName(url) {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").at(-1) || url);
	} catch {
		return url;
	}
}
const why = (font, lcpMs) => font.preloaded ? "preloaded" : `requested at ${font.requestMs} ms, before LCP at ${lcpMs} ms`;
const blocking = (size) => size.fonts.filter((font) => font.renderBlocking).slice().sort((a, b) => b.bytes - a.bytes);
const pageTotal = (size) => {
	const count = blocking(size).length;
	return count ? `${shown(size.renderBlockingBytes)} in ${count} file${count === 1 ? "" : "s"}` : "no render-blocking fonts";
};
/** "pdp (96 KiB: inter.woff2 48 KiB, playfair.woff2 48 KiB third-party)". */
function breakdown(size) {
	const fonts = blocking(size);
	const files = fonts.slice(0, MAX_FILES).map((font) => `${fileName(font.url)} ${kib(font.bytes)}${font.thirdParty ? " third-party" : ""}`);
	if (fonts.length > MAX_FILES) files.push(`+${fonts.length - MAX_FILES} more`);
	return `${size.page} (${shown(size.renderBlockingBytes)}: ${files.join(", ")})`;
}
var render_blocking_font_size_default = (async ({ pages, playhouse }) => {
	const data = {
		cell: CELL,
		budget: BUDGET,
		pages: [],
		skipped: []
	};
	for (const page of pages) {
		const size = await measurePage(playhouse, page.label);
		if ("reason" in size) data.skipped.push({
			page: page.label,
			reason: size.reason
		});
		else data.pages.push(size);
	}
	if (!data.pages.length) return { data };
	const over = data.pages.filter((size) => size.renderBlockingBytes > BUDGET);
	if (!over.length) return {
		data,
		decision: {
			status: "pass",
			summary: `Render-blocking fonts are within ${kib(BUDGET)} on every measured page (${data.pages.map((size) => `${size.page} ${pageTotal(size)}`).join(", ")}).`,
			evidence: data.pages.map((size) => ({
				type: "playhouse",
				page: size.page,
				artifact: size.lighthouseArtifact,
				pointer: "/audits/network-requests/details/items",
				value: `Render-blocking fonts: ${pageTotal(size)} (budget ${kib(BUDGET)})`
			}))
		}
	};
	return {
		data,
		decision: {
			status: "fail",
			summary: `Render-blocking fonts are over ${kib(BUDGET)} on ${over.map(breakdown).join("; ")}.`,
			evidence: over.flatMap((size) => blocking(size).slice(0, MAX_FILES).map((font) => ({
				type: "playhouse",
				page: size.page,
				artifact: size.lighthouseArtifact,
				pointer: `/audits/network-requests/details/items/${font.entry}/resourceSize`,
				value: `${fileName(font.url)} ${kib(font.bytes)}${font.thirdParty ? ", third-party" : ""}, ${why(font, size.lcpMs)}`
			})))
		}
	};
});

//#endregion
export { dataSchema, render_blocking_font_size_default as default };