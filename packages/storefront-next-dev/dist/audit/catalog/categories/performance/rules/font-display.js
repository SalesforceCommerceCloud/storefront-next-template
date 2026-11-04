import { l as normalizedUrl } from "../../../../../har.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/font-display.ts
const FORM_FACTORS = ["mobile", "desktop"];
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const TRACE_MAX_BYTES = 256 * 1024 * 1024;
const acceptable = new Set(["swap", "optional"]);
const summarySchema = z.object({ runs: z.array(z.object({
	runId: z.string().optional(),
	formFactor: z.string().optional(),
	cacheState: z.string().optional(),
	isMedian: z.boolean().optional()
}).passthrough()).optional().default([]) }).passthrough();
const harSchema = z.object({ log: z.object({ entries: z.array(z.object({
	_resourceType: z.string().optional(),
	request: z.object({ url: z.string() }).passthrough(),
	response: z.object({ status: z.number() }).passthrough()
}).passthrough()) }).passthrough() }).passthrough();
const fontSchema = z.object({
	url: z.string(),
	display: z.string(),
	status: z.enum(["pass", "fail"]),
	event: z.number()
}).strict();
const unverifiedFontSchema = z.object({
	url: z.string(),
	entry: z.number()
}).strict();
const cellSchema = z.object({
	cell: z.enum(["mobile-cold", "desktop-cold"]),
	runId: z.string(),
	status: z.enum([
		"pass",
		"fail",
		"undecided"
	]),
	traceArtifact: z.string(),
	harArtifact: z.string(),
	fonts: z.array(fontSchema),
	unverifiedFonts: z.array(unverifiedFontSchema)
}).strict();
const dataSchema = z.object({
	pages: z.array(z.object({
		page: z.string(),
		cells: z.array(cellSchema)
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		cell: z.string(),
		reason: z.string()
	}).strict())
}).strict();
function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function traceFonts(trace) {
	const events = object(trace)?.traceEvents;
	if (!Array.isArray(events)) return void 0;
	const fonts = /* @__PURE__ */ new Map();
	for (const [event, raw] of events.entries()) {
		const item = object(raw);
		if (item?.name !== "BeginRemoteFontLoad") continue;
		const args = object(item.args);
		const url = args?.url;
		const display = args?.display;
		if (typeof url !== "string" || typeof display !== "string") continue;
		const key = normalizedUrl(url) ?? url;
		const policy = display.toLowerCase();
		const candidate = {
			url,
			display: policy,
			status: acceptable.has(policy) ? "pass" : "fail",
			event
		};
		const known = fonts.get(key);
		if (!known || known.status === "pass" && candidate.status === "fail") fonts.set(key, candidate);
	}
	return [...fonts.values()];
}
async function medianRun(playhouse, page, formFactor) {
	const runs = ((await playhouse.readJson(page, "summary.json", summarySchema))?.runs ?? []).filter((run$1) => run$1.runId && SAFE_RUN_ID.test(run$1.runId) && run$1.formFactor === formFactor && run$1.cacheState === "cold");
	return (runs.find((run$1) => run$1.isMedian) ?? runs[0])?.runId ?? `${formFactor}-cold-1`;
}
async function measureCell(playhouse, page, formFactor) {
	const cell = `${formFactor}-cold`;
	try {
		const runId = await medianRun(playhouse, page, formFactor);
		const traceArtifact = `runs/${runId}/trace.json`;
		const harArtifact = `runs/${runId}/network.har`;
		let traceText;
		let har;
		try {
			[traceText, har] = await Promise.all([playhouse.readText(page, traceArtifact, TRACE_MAX_BYTES), playhouse.readJson(page, harArtifact, harSchema)]);
		} catch {
			return {
				cell,
				reason: `${traceArtifact} could not be read or parsed safely.`
			};
		}
		if (traceText === void 0) return {
			cell,
			reason: `${traceArtifact} is missing.`
		};
		let trace;
		try {
			trace = JSON.parse(traceText);
		} catch {
			return {
				cell,
				reason: `${traceArtifact} could not be read or parsed safely.`
			};
		}
		const tracePolicies = traceFonts(trace);
		if (!tracePolicies) return {
			cell,
			reason: `${traceArtifact} has no traceEvents array.`
		};
		if (!har) return {
			cell,
			reason: `${harArtifact} is missing.`
		};
		const downloaded = /* @__PURE__ */ new Map();
		for (const [entry, item] of har.log.entries.entries()) {
			if (item._resourceType?.toLowerCase() !== "font" || item.response.status <= 0 || item.response.status >= 400) continue;
			const key = normalizedUrl(item.request.url) ?? item.request.url;
			if (!downloaded.has(key)) downloaded.set(key, {
				url: item.request.url,
				entry
			});
		}
		const fonts = tracePolicies.filter((font) => downloaded.has(normalizedUrl(font.url) ?? font.url));
		const traced = new Set(fonts.map((font) => normalizedUrl(font.url) ?? font.url));
		const unverifiedFonts = [...downloaded].flatMap(([key, item]) => traced.has(key) ? [] : [item]);
		return {
			cell,
			runId,
			status: fonts.some((font) => font.status === "fail") ? "fail" : unverifiedFonts.length ? "undecided" : "pass",
			traceArtifact,
			harArtifact,
			fonts,
			unverifiedFonts
		};
	} catch {
		return {
			cell,
			reason: `${cell} artifacts could not be read or parsed safely.`
		};
	}
}
function fileName(url) {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").at(-1) || url);
	} catch {
		return url;
	}
}
function hostName(url) {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
const run = async ({ pages, playhouse }) => {
	const data = {
		pages: [],
		skipped: []
	};
	const failures = [];
	const passEvidence = [];
	let undecided = false;
	const pageMeasurements = [];
	for (const page of pages) pageMeasurements.push({
		page,
		measured: await Promise.all(FORM_FACTORS.map((formFactor) => measureCell(playhouse, page.label, formFactor)))
	});
	for (const { page, measured } of pageMeasurements) {
		const cells = [];
		for (const result of measured) {
			if ("reason" in result) {
				data.skipped.push({
					page: page.label,
					cell: result.cell,
					reason: result.reason
				});
				undecided = true;
				continue;
			}
			cells.push(result);
			undecided ||= result.status === "undecided";
			for (const font of result.fonts) {
				const evidence = {
					type: "playhouse",
					page: page.label,
					artifact: result.traceArtifact,
					pointer: `/traceEvents/${font.event}/args/display`,
					value: `${fileName(font.url)} from ${hostName(font.url)} uses font-display: ${font.display} in ${result.cell}.`
				};
				if (font.status === "fail") failures.push({
					page: page.label,
					cell: result,
					font
				});
				else passEvidence.push(evidence);
			}
			if (!result.fonts.length) passEvidence.push({
				type: "playhouse",
				page: page.label,
				artifact: result.harArtifact,
				pointer: "/log/entries",
				value: `${result.cell} downloaded no web fonts.`
			});
		}
		data.pages.push({
			page: page.label,
			cells
		});
	}
	if (failures.length) return {
		data,
		decision: {
			status: "fail",
			severity: "medium",
			summary: failures.map(({ page, cell, font }) => `${page} ${cell.cell}: ${fileName(font.url)} from ${hostName(font.url)} uses font-display: ${font.display}.`).join(" "),
			evidence: failures.slice(0, 10).map(({ page, cell, font }) => ({
				type: "playhouse",
				page,
				artifact: cell.traceArtifact,
				pointer: `/traceEvents/${font.event}/args/display`,
				value: `${fileName(font.url)} from ${hostName(font.url)} uses font-display: ${font.display} in ${cell.cell}.`
			}))
		}
	};
	if (!data.pages.length || undecided || data.skipped.length) return { data };
	return {
		data,
		decision: {
			status: "pass",
			summary: `Every measured web font uses font-display: swap or optional on ${data.pages.map((page) => page.page).join(", ")}.`,
			evidence: passEvidence
		}
	};
};
var font_display_default = run;

//#endregion
export { dataSchema, font_display_default as default };