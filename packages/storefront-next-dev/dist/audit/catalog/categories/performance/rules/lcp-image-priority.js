import { a as kib, i as isImage, n as bytesDuring, o as readImageRun, r as fileName, s as withoutQuery, t as MIN_SAVINGS_BYTES } from "../../../../../images.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/lcp-image-priority.ts
/** Delays shorter than this aren't worth a suggestion. */
const MIN_DELAY_MS = 100;
const LCP_GOOD_MS = 2500;
const HIGH = new Set(["High", "VeryHigh"]);
const issueSchema = z.object({
	check: z.enum([
		"not-in-html",
		"lazy",
		"low-priority",
		"preload-mismatch",
		"competing-images",
		"bandwidth",
		"render-blocking"
	]),
	detail: z.string(),
	artifact: z.string(),
	pointer: z.string()
}).strict();
const dataSchema = z.object({
	cell: z.string(),
	pages: z.array(z.object({
		page: z.string(),
		lcpMs: z.number().nullable(),
		image: z.object({
			url: z.string(),
			entry: z.number(),
			bytes: z.number(),
			startMs: z.number(),
			loadMs: z.number(),
			initialPriority: z.string().nullable(),
			priority: z.string().nullable(),
			initiator: z.string().nullable(),
			preloaded: z.boolean(),
			concurrentImageBytes: z.number(),
			concurrentScriptBytes: z.number(),
			imageDelayMs: z.number()
		}).strict().nullable(),
		issues: z.array(issueSchema)
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
/** The `{value}` of one of Lighthouse's LCP discovery checks, or undefined when it wasn't reported. */
function discovery(run$1, check) {
	for (const item of run$1.lhr.audits["lcp-discovery-insight"]?.details?.items ?? []) {
		const value = item.items?.[check]?.value;
		if (typeof value === "boolean") return value;
	}
}
function checkPage(run$1) {
	if (!run$1.lcpUrl) return {
		page: run$1.page,
		lcpMs: run$1.lcpMs,
		image: null,
		issues: []
	};
	const index = run$1.entries.findIndex((entry) => entry.request.url === run$1.lcpUrl);
	const lcp = run$1.entries[index];
	if (!lcp || lcp._requestTime === void 0) return { reason: "The LCP image request was not found in the median run HAR." };
	const har = (entry, path$1 = "") => ({
		artifact: run$1.harArtifact,
		pointer: `/log/entries/${entry}${path$1}`
	});
	const lighthouse = (id) => ({
		artifact: run$1.lighthouseArtifact,
		pointer: `/audits/${id}`
	});
	const issues = [];
	const name = fileName(lcp.request.url);
	if (discovery(run$1, "requestDiscoverable") === false || lcp._initiator_type === "script") issues.push({
		check: "not-in-html",
		detail: `The LCP image ${name} is requested by JavaScript instead of being in the HTML, so the browser finds it late.`,
		...lighthouse("lcp-discovery-insight")
	});
	if (discovery(run$1, "eagerlyLoaded") === false) issues.push({
		check: "lazy",
		detail: `The LCP image ${name} uses loading="lazy", which waits for layout before downloading it.`,
		...lighthouse("lcp-discovery-insight")
	});
	const initial = lcp._initialPriority ?? null;
	if (initial && !HIGH.has(initial)) issues.push({
		check: "low-priority",
		detail: `The LCP image ${name} starts at ${initial} priority${lcp._priority && lcp._priority !== initial ? ` and is raised to ${lcp._priority} only after layout` : ""}; it has no fetchpriority="high".`,
		...har(index)
	});
	const path = withoutQuery(lcp.request.url);
	const mismatch = run$1.entries.findIndex((entry) => entry.request._isLinkPreload && entry.request.url !== lcp.request.url && withoutQuery(entry.request.url) === path);
	if (mismatch >= 0) issues.push({
		check: "preload-mismatch",
		detail: `The page preloads ${name} at a different size from the one shown, so it downloads twice (${run$1.entries[mismatch].request.url}).`,
		...har(mismatch)
	});
	const competing = run$1.entries.flatMap((entry, at) => entry !== lcp && isImage(entry) && HIGH.has(entry._priority ?? "") && (entry._requestTime ?? Infinity) <= (lcp._requestTime ?? -Infinity) && (entry.response.bodySize ?? 0) >= MIN_SAVINGS_BYTES ? [at] : []);
	if (competing.length) issues.push({
		check: "competing-images",
		detail: `${competing.length} other image${competing.length === 1 ? "" : "s"} at High priority start before the LCP image: ${competing.slice(0, 3).map((at) => `${fileName(run$1.entries[at].request.url)} (${kib(run$1.entries[at].response.bodySize ?? 0)})`).join(", ")}.`,
		...har(competing[0])
	});
	const start = lcp._requestTime;
	const end = start + lcp.time / 1e3;
	const during = run$1.entries.map((entry, at) => ({
		entry,
		at,
		bytes: entry === lcp ? 0 : bytesDuring(entry, start, end)
	}));
	const total = during.reduce((sum, item) => sum + item.bytes, lcp.response.bodySize ?? 0);
	const images = during.filter((item) => item.bytes > 0 && isImage(item.entry)).slice().sort((a, b) => b.bytes - a.bytes);
	const imageBytes = images.reduce((sum, item) => sum + item.bytes, 0);
	const scriptBytes = during.filter((item) => item.entry._resourceType === "script").reduce((sum, item) => sum + item.bytes, 0);
	const imageDelayMs = total > 0 ? Math.round(lcp.time * imageBytes / total) : 0;
	if (imageDelayMs >= MIN_DELAY_MS) issues.push({
		check: "bandwidth",
		detail: `Other images download ${kib(imageBytes)} while the ${kib(lcp.response.bodySize ?? 0)} LCP image loads, delaying it by about ${imageDelayMs} ms; the largest is ${fileName(images[0].entry.request.url)} (${kib(images[0].bytes)} during the LCP download).`,
		...har(images[0].at)
	});
	const blocking = run$1.lhr.audits["render-blocking-insight"];
	const blockingMs = blocking?.metricSavings?.LCP ?? 0;
	if (blockingMs >= MIN_DELAY_MS) {
		const urls = (blocking?.details?.items ?? []).map((item) => fileName(item.url));
		issues.push({
			check: "render-blocking",
			detail: `${urls.length} render-blocking request${urls.length === 1 ? "" : "s"} (${urls.slice(0, 3).join(", ")}) delay the LCP by about ${Math.round(blockingMs)} ms.`,
			...lighthouse("render-blocking-insight")
		});
	}
	return {
		page: run$1.page,
		lcpMs: run$1.lcpMs,
		image: {
			url: lcp.request.url,
			entry: index,
			bytes: lcp.response.bodySize ?? 0,
			startMs: run$1.startMs(lcp),
			loadMs: Math.round(lcp.time),
			initialPriority: initial,
			priority: lcp._priority ?? null,
			initiator: lcp._initiator_type ?? null,
			preloaded: Boolean(lcp.request._isLinkPreload),
			concurrentImageBytes: imageBytes,
			concurrentScriptBytes: scriptBytes,
			imageDelayMs
		},
		issues
	};
}
const run = async ({ pages, playhouse }) => {
	const data = {
		cell: "mobile-cold",
		pages: [],
		skipped: []
	};
	const harArtifacts = /* @__PURE__ */ new Map();
	for (const page of pages) {
		const imageRun = await readImageRun(playhouse, page.label);
		if ("reason" in imageRun) {
			data.skipped.push({
				page: page.label,
				reason: imageRun.reason
			});
			continue;
		}
		const result = checkPage(imageRun);
		if ("reason" in result) {
			data.skipped.push({
				page: page.label,
				reason: result.reason
			});
			continue;
		}
		data.pages.push(result);
		harArtifacts.set(page.label, imageRun.harArtifact);
	}
	if (!data.pages.length) return { data };
	const withImage = data.pages.filter((item) => item.image);
	const failing = withImage.filter((item) => item.issues.length);
	const text = data.pages.filter((item) => !item.image).map((item) => item.page);
	const textNote = text.length ? ` The LCP element is text on ${text.join(", ")}.` : "";
	if (!failing.length) return {
		data,
		decision: {
			status: "pass",
			summary: withImage.length ? `The LCP image on ${withImage.map((item) => item.page).join(", ")} is in the HTML, starts at High priority, isn't lazy-loaded and has no image competing for bandwidth.${textNote}` : `The LCP element is text on every measured page (${text.join(", ")}), so there is no LCP image to prioritize.`,
			evidence: withImage.length ? withImage.flatMap((item) => {
				const image = item.image;
				const artifact = harArtifacts.get(item.page);
				if (!image || !artifact) return [];
				return [{
					type: "playhouse",
					page: item.page,
					artifact,
					pointer: `/log/entries/${image.entry}`,
					value: `${fileName(image.url)}: ${image.initialPriority ?? "unknown"} priority, ${image.preloaded ? "preloaded" : `found by the ${image.initiator ?? "parser"}`}, ${kib(image.bytes)} in ${image.loadMs} ms`
				}];
			}) : data.pages.map((item) => ({
				type: "playhouse",
				page: item.page,
				artifact: "summary-lcp.json",
				value: "LCP element is text"
			}))
		}
	};
	return {
		data,
		decision: {
			status: "fail",
			severity: failing.some((item) => (item.lcpMs ?? 0) > LCP_GOOD_MS) ? "high" : "medium",
			summary: failing.map((item) => `${item.page} (LCP ${item.lcpMs === null ? "unknown" : `${Math.round(item.lcpMs)} ms`}): ${item.issues.map((issue) => issue.detail).join(" ")}`).join(" ") + textNote,
			evidence: failing.flatMap((item) => item.issues.map((issue) => ({
				type: "playhouse",
				page: item.page,
				artifact: issue.artifact,
				pointer: issue.pointer,
				value: issue.detail
			})))
		}
	};
};
var lcp_image_priority_default = run;

//#endregion
export { dataSchema, lcp_image_priority_default as default };