import { z } from "zod";

//#region src/audit/rule-helpers/images.ts
/**
* Image rules read the mobile cold-cache median run: its own HAR and Lighthouse result, so request timings line up with
* the LCP that `summary-lcp.json` reports for that run.
*/
const CELL = {
	formFactor: "mobile",
	cacheState: "cold"
};
/** Savings smaller than this aren't worth a suggestion. */
const MIN_SAVINGS_BYTES = 10 * 1024;
const lcpSummarySchema = z.object({ cells: z.array(z.object({
	formFactor: z.string(),
	cacheState: z.string(),
	median: z.object({
		runId: z.string(),
		lcp: z.number().nullable().optional(),
		breakdown: z.record(z.string(), z.number().nullable()).nullable().optional(),
		resource: z.object({ url: z.string() }).passthrough().nullable().optional()
	}).passthrough().nullable().optional()
}).passthrough()) }).passthrough();
const entrySchema = z.object({
	_requestTime: z.number().optional(),
	_priority: z.string().optional(),
	_initialPriority: z.string().optional(),
	_resourceType: z.string().optional(),
	_initiator_type: z.string().optional(),
	_renderBlocking: z.string().optional(),
	time: z.number(),
	request: z.object({
		url: z.string(),
		_isLinkPreload: z.boolean().optional()
	}).passthrough(),
	response: z.object({
		status: z.number(),
		bodySize: z.number().optional(),
		content: z.object({
			size: z.number().optional(),
			mimeType: z.string().optional()
		}).passthrough().optional()
	}).passthrough()
}).passthrough();
const harSchema = z.object({ log: z.object({ entries: z.array(entrySchema) }).passthrough() }).passthrough();
const rectSchema = z.object({
	top: z.number(),
	width: z.number(),
	height: z.number()
}).passthrough();
const nodeSchema = z.object({
	path: z.string().optional(),
	selector: z.string().optional(),
	nodeLabel: z.string().optional(),
	snippet: z.string().optional(),
	boundingRect: rectSchema.optional()
}).passthrough();
const tableItem = z.record(z.string(), z.unknown());
const audit = (details) => z.object({
	score: z.number().nullable().optional(),
	numericValue: z.number().optional(),
	metricSavings: z.record(z.string(), z.number()).optional(),
	details: details.optional()
}).passthrough().optional();
const lhrSchema = z.object({
	configSettings: z.object({ screenEmulation: z.object({
		deviceScaleFactor: z.number(),
		height: z.number()
	}).passthrough() }).passthrough(),
	audits: z.object({
		"image-delivery-insight": audit(z.object({ items: z.array(z.object({
			url: z.string(),
			totalBytes: z.number(),
			wastedBytes: z.number(),
			node: nodeSchema.optional(),
			subItems: z.object({ items: z.array(z.object({
				reason: z.string(),
				wastedBytes: z.number()
			}).passthrough()) }).passthrough().optional()
		}).passthrough()).optional() }).passthrough()),
		"lcp-discovery-insight": audit(z.object({ items: z.array(tableItem).optional() }).passthrough()),
		"unsized-images": audit(z.object({ items: z.array(z.object({
			url: z.string().optional(),
			node: nodeSchema.optional()
		}).passthrough()).optional() }).passthrough()),
		"cls-culprits-insight": audit(z.object({ items: z.array(tableItem).optional() }).passthrough()),
		"render-blocking-insight": audit(z.object({ items: z.array(z.object({ url: z.string() }).passthrough()).optional() }).passthrough()),
		"cumulative-layout-shift": audit(z.unknown())
	}).passthrough()
}).passthrough();
/** The mobile cold-cache median run of one page, or why it can't be read. */
async function readImageRun(playhouse, page) {
	const median = (await playhouse.readJson(page, "summary-lcp.json", lcpSummarySchema))?.cells.find((cell) => cell.formFactor === CELL.formFactor && cell.cacheState === CELL.cacheState)?.median;
	if (!median) return { reason: "summary-lcp.json has no mobile cold-cache median run." };
	const harArtifact = `runs/${median.runId}/network.har`;
	const lighthouseArtifact = `runs/${median.runId}/lhr.json`;
	const [har, lhr] = await Promise.all([playhouse.readJson(page, harArtifact, harSchema), playhouse.readJson(page, lighthouseArtifact, lhrSchema)]);
	if (!har || !lhr) return { reason: `The median run's ${har ? "Lighthouse result" : "HAR"} was not archived.` };
	const entries = har.log.entries;
	const origin = Math.min(...entries.map((entry) => entry._requestTime ?? Infinity));
	return {
		page,
		runId: median.runId,
		harArtifact,
		lighthouseArtifact,
		entries,
		lhr,
		dpr: lhr.configSettings.screenEmulation.deviceScaleFactor,
		viewportHeight: lhr.configSettings.screenEmulation.height,
		lcpMs: median.lcp ?? null,
		lcpBreakdown: median.breakdown ?? {},
		lcpUrl: median.resource?.url ?? null,
		startMs: (entry) => entry._requestTime === void 0 || !Number.isFinite(origin) ? NaN : Math.round((entry._requestTime - origin) * 1e3)
	};
}
const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;
/** Bytes an entry downloaded during [start, end] seconds, assuming it downloaded at an even rate. */
function bytesDuring(entry, start, end) {
	const from = entry._requestTime;
	const bytes = entry.response.bodySize ?? 0;
	if (from === void 0 || bytes <= 0) return 0;
	const to = from + entry.time / 1e3;
	const overlap = Math.min(to, end) - Math.max(from, start);
	return overlap > 0 ? Math.round(bytes * overlap / Math.max(to - from, .001)) : 0;
}
const isImage = (entry) => entry._resourceType === "image" || (entry.response.content?.mimeType ?? "").startsWith("image/");
/** A URL's file name without its query, for readable summaries. */
function fileName(url) {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
	} catch {
		return url;
	}
}
/** URL without its query string, to match the same image requested at different sizes. */
function withoutQuery(url) {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return url;
	}
}

//#endregion
export { kib as a, isImage as i, bytesDuring as n, readImageRun as o, fileName as r, withoutQuery as s, MIN_SAVINGS_BYTES as t };