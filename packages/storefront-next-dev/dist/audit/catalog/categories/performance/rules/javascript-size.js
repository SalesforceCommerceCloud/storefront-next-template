import { t as readLivePage } from "../../../../../live.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/javascript-size.ts
const BUDGET_BYTES = 14e5;
const HIGH_BYTES = 27e5;
const LARGEST = 10;
const pageSchema = z.object({
	page: z.string(),
	lighthouseArtifact: z.string(),
	scripts: z.number().int(),
	decodedBytes: z.number(),
	transferBytes: z.number(),
	beforeLoad: z.object({
		scripts: z.number().int(),
		decodedBytes: z.number()
	}).strict(),
	afterLoad: z.object({
		scripts: z.number().int(),
		decodedBytes: z.number()
	}).strict(),
	largest: z.array(z.object({
		file: z.string(),
		item: z.number().int(),
		decodedBytes: z.number(),
		transferBytes: z.number()
	}).strict())
}).strict();
const dataSchema = z.object({
	budget: z.number(),
	pages: z.array(pageSchema),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;
function measured(live) {
	const sum = (scripts) => scripts.reduce((total, script) => total + script.decodedBytes, 0);
	const before = live.scripts.filter((script) => script.beforeLoad);
	const after = live.scripts.filter((script) => !script.beforeLoad);
	return {
		page: live.page,
		lighthouseArtifact: live.lighthouseArtifact,
		scripts: live.scripts.length,
		decodedBytes: sum(live.scripts),
		transferBytes: live.scripts.reduce((total, script) => total + script.transferBytes, 0),
		beforeLoad: {
			scripts: before.length,
			decodedBytes: sum(before)
		},
		afterLoad: {
			scripts: after.length,
			decodedBytes: sum(after)
		},
		largest: live.scripts.slice().sort((a, b) => b.decodedBytes - a.decodedBytes).slice(0, LARGEST).map(({ file, item, decodedBytes, transferBytes }) => ({
			file,
			item,
			decodedBytes,
			transferBytes
		}))
	};
}
const totalEvidence = (page) => ({
	type: "playhouse",
	page: page.page,
	artifact: page.lighthouseArtifact,
	pointer: "/audits/network-requests/details/items",
	value: `${mb(page.decodedBytes)} first-party JavaScript (${kib(page.transferBytes)} transferred) in ${page.scripts} scripts, ${page.beforeLoad.scripts} before load (budget ${mb(BUDGET_BYTES)})`
});
/** Measured on the live site only: the local build may be built from other code, so it never adds to these numbers. */
async function javascriptSize({ pages, playhouse }) {
	const data = {
		budget: BUDGET_BYTES,
		pages: [],
		skipped: []
	};
	for (const { label } of pages) {
		const live = await readLivePage(playhouse, label);
		if ("reason" in live) {
			data.skipped.push({
				page: label,
				reason: live.reason
			});
			continue;
		}
		if (!live.scripts.length) {
			data.skipped.push({
				page: label,
				reason: "The run loaded no scripts from its own bundle path (mobify/bundle)."
			});
			continue;
		}
		data.pages.push(measured(live));
	}
	if (!data.pages.length) return { data };
	const over = data.pages.filter((page) => page.decodedBytes > BUDGET_BYTES);
	const list = data.pages.map((page) => `${page.page} ${mb(page.decodedBytes)}`).join(", ");
	if (!over.length) return {
		data,
		decision: {
			status: "pass",
			summary: `First-party JavaScript is within ${mb(BUDGET_BYTES)} on every measured page (${list}).`,
			evidence: data.pages.map(totalEvidence)
		}
	};
	return {
		data,
		decision: {
			status: "fail",
			severity: over.some((page) => page.decodedBytes >= HIGH_BYTES) ? "high" : "medium",
			summary: `First-party JavaScript is over ${mb(BUDGET_BYTES)} on ${over.map((page) => `${page.page} (${mb(page.decodedBytes)} in ${page.scripts} scripts)`).join("; ")}.`,
			evidence: over.flatMap((page) => [totalEvidence(page), ...page.largest.slice(0, 3).map((script) => ({
				type: "playhouse",
				page: page.page,
				artifact: page.lighthouseArtifact,
				pointer: `/audits/network-requests/details/items/${script.item}/resourceSize`,
				value: `${script.file} ${kib(script.decodedBytes)}`
			}))])
		}
	};
}

//#endregion
export { dataSchema, javascriptSize as default };