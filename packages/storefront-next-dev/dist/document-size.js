import { c as matchDocument, l as normalizedUrl, n as REPRESENTATIVE_CELL } from "./har.js";
import { z } from "zod";

//#region src/audit/rule-helpers/document-size.ts
const scriptIndexSchema = z.object({ observations: z.array(z.object({
	runId: z.string(),
	runKind: z.string(),
	formFactor: z.string(),
	cacheState: z.string(),
	url: z.string(),
	body: z.object({
		status: z.string(),
		sha256: z.string().optional()
	}).passthrough()
}).passthrough()) }).passthrough();
const lhrSchema = z.object({ audits: z.object({ "dom-size-insight": z.object({ details: z.object({ items: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough().optional() }).passthrough().optional() }).passthrough() }).passthrough();
/** What an inline `<script>` in the HTML holds, from its text. */
function inlinePart(text) {
	if (text.includes("__reactRouterContext.streamController.enqueue(")) return "pageData";
	if (text.includes("window.__APP_CONFIG__")) return "appConfig";
	return "otherScripts";
}
const pageSizeSchema = z.object({
	page: z.string(),
	url: z.string(),
	htmlBytes: z.number(),
	transferBytes: z.number().nullable(),
	pageDataBytes: z.number().nullable(),
	appConfigBytes: z.number().nullable(),
	otherScriptBytes: z.number().nullable(),
	markupBytes: z.number().nullable(),
	scripts: z.object({
		pageData: z.array(z.string()),
		appConfig: z.array(z.string()),
		other: z.array(z.string())
	}).strict(),
	appConfigSections: z.record(z.string(), z.number()).nullable(),
	elements: z.number().nullable(),
	domDepth: z.number().nullable(),
	harArtifact: z.string(),
	harEntry: z.number(),
	lighthouseArtifact: z.string().nullable()
}).strict();
const documentSizeDataSchema = z.object({
	cell: z.string(),
	budget: z.number(),
	pages: z.array(pageSizeSchema),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const numeric = (value) => {
	const inner = value?.value;
	return typeof inner === "number" && Number.isFinite(inner) ? inner : null;
};
/** Top-level sections of a `window.__APP_CONFIG__ = {...};` script by serialized size, largest first. */
function configSections(text) {
	const json = text.slice(text.indexOf("=") + 1).trim().replace(/;$/, "");
	try {
		const config = JSON.parse(json);
		if (!config || typeof config !== "object" || Array.isArray(config)) return null;
		const sizes = Object.entries(config).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value) ?? "")]);
		return Object.fromEntries(sizes.slice().sort((a, b) => b[1] - a[1]));
	} catch {
		return null;
	}
}
/** Measures one page's HTML from its mobile cold-cache HAR, archived inline scripts and Lighthouse result. */
async function measurePage(playhouse, page) {
	const match = await matchDocument(playhouse, page, REPRESENTATIVE_CELL);
	if ("reason" in match) return { reason: match.reason };
	const response = match.document.entry.response;
	const htmlBytes = response.content?.size;
	if (typeof htmlBytes !== "number" || htmlBytes <= 0) return { reason: "The HAR records no decoded size for the HTML document." };
	const transfer = response.bodySize;
	const runs = ((await playhouse.readJson(page, "scripts/index.json", scriptIndexSchema))?.observations ?? []).filter((item) => item.runKind === "measurement" && `${item.formFactor}-${item.cacheState}` === REPRESENTATIVE_CELL);
	const runId = runs.map((item) => item.runId).slice().sort()[0];
	const documentUrl = normalizedUrl(match.finalUrl);
	const inline = runs.filter((item) => item.runId === runId && normalizedUrl(item.url) === documentUrl && item.body.status === "captured" && item.body.sha256);
	const bytes = {
		pageData: 0,
		appConfig: 0,
		otherScripts: 0
	};
	let appConfigSections = null;
	const scripts = {
		pageData: [],
		appConfig: [],
		other: []
	};
	for (const item of inline) {
		const artifact = `scripts/${item.body.sha256}.js`;
		const text = await playhouse.readText(page, artifact);
		if (text === void 0) continue;
		const part = inlinePart(text);
		const size = Buffer.byteLength(text);
		bytes[part] += size;
		scripts[part === "otherScripts" ? "other" : part].push({
			artifact,
			size
		});
		if (part === "appConfig") appConfigSections ??= configSections(text);
	}
	const measured = inline.length > 0;
	const inlineTotal = bytes.pageData + bytes.appConfig + bytes.otherScripts;
	const lighthouseArtifact = runId ? `runs/${runId}/lhr.json` : null;
	const lhr = lighthouseArtifact ? await playhouse.readJson(page, lighthouseArtifact, lhrSchema) : void 0;
	const statistics = lhr?.audits["dom-size-insight"]?.details?.items ?? [];
	const statistic = (name) => numeric(statistics.find((item) => item.statistic === name)?.value);
	const largestFirst = (items) => items.slice().sort((a, b) => b.size - a.size).map((item) => item.artifact);
	return {
		page,
		url: match.finalUrl,
		htmlBytes,
		transferBytes: typeof transfer === "number" && transfer > 0 ? transfer : null,
		pageDataBytes: measured ? bytes.pageData : null,
		appConfigBytes: measured ? bytes.appConfig : null,
		otherScriptBytes: measured ? bytes.otherScripts : null,
		markupBytes: measured ? Math.max(0, htmlBytes - inlineTotal) : null,
		scripts: {
			pageData: largestFirst(scripts.pageData),
			appConfig: largestFirst(scripts.appConfig),
			other: largestFirst(scripts.other)
		},
		appConfigSections,
		elements: lhr ? statistic("Total elements") : null,
		domDepth: lhr ? statistic("DOM depth") : null,
		harArtifact: match.harArtifact,
		harEntry: match.document.index,
		lighthouseArtifact: lhr ? lighthouseArtifact : null
	};
}
const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;
const count = (value) => value.toLocaleString("en-US");
/** "297 KiB page data, 15 KiB app config, 9 KiB other inline scripts, 181 KiB markup", or "" when no scripts were archived. */
function htmlBreakdown(size) {
	if (size.markupBytes === null) return "";
	return [
		`${kib(size.pageDataBytes ?? 0)} page data`,
		`${kib(size.appConfigBytes ?? 0)} app config`,
		`${kib(size.otherScriptBytes ?? 0)} other inline scripts`,
		`${kib(size.markupBytes)} markup`
	].join(", ");
}
/** A measured value, marked "just over" when it would otherwise read the same as the budget it exceeds. */
const shown = (measure, value) => {
	const text = measure.format(value);
	return value > measure.budget && text === measure.format(measure.budget) ? `just over ${text}` : text;
};
const evidenceFor = (measure, size, value) => {
	const source = measure.evidence(size, value) ?? {
		artifact: size.harArtifact,
		pointer: `/log/entries/${size.harEntry}/response/content/size`
	};
	return {
		type: "playhouse",
		page: size.page,
		...source,
		value: `${measure.label} ${shown(measure, value)} (budget ${measure.format(measure.budget)})`
	};
};
/**
* A rule script that checks one measurement of each page's HTML against a budget. It passes when every measured page is
* within budget. A page over budget fails the rule, or, when `decideFailures` is false, leaves it undecided with the
* measurements as data so the agent can trace the cause.
*/
function documentSizeRule(measure) {
	return async ({ pages, playhouse }) => {
		const data = {
			cell: REPRESENTATIVE_CELL,
			budget: measure.budget,
			pages: [],
			skipped: []
		};
		const measured = [];
		for (const page of pages) {
			const size = await measurePage(playhouse, page.label);
			if ("reason" in size) {
				data.skipped.push({
					page: page.label,
					reason: size.reason
				});
				continue;
			}
			data.pages.push(size);
			const value = measure.value(size);
			if (value === null) data.skipped.push({
				page: page.label,
				reason: `No ${measure.label.toLowerCase()} measurement was archived.`
			});
			else measured.push({
				size,
				value
			});
		}
		if (!measured.length) return { data };
		const over = measured.filter((item) => item.value > measure.budget);
		const list = (items) => items.map((item) => `${item.size.page} ${shown(measure, item.value)}`).join(", ");
		if (!over.length) return {
			data,
			decision: {
				status: "pass",
				summary: `${measure.label} is within ${measure.format(measure.budget)} on every measured page (${list(measured)}).`,
				evidence: measured.map((item) => evidenceFor(measure, item.size, item.value))
			}
		};
		if (!measure.decideFailures) return { data };
		return {
			data,
			decision: {
				status: "fail",
				summary: `${measure.label} is over ${measure.format(measure.budget)} on ${over.map((item) => {
					const breakdown = htmlBreakdown(item.size);
					return `${item.size.page} (${shown(measure, item.value)}${breakdown ? `: ${breakdown}` : ""})`;
				}).join("; ")}.`,
				evidence: over.map((item) => {
					const evidence = evidenceFor(measure, item.size, item.value);
					const breakdown = htmlBreakdown(item.size);
					return breakdown ? {
						...evidence,
						value: `${evidence.value}: ${breakdown}`
					} : evidence;
				})
			}
		};
	};
}

//#endregion
export { measurePage as a, kib as i, documentSizeDataSchema as n, documentSizeRule as r, count as t };