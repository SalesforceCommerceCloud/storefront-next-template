import { z } from "zod";

//#region src/audit/rule-helpers/har.ts
const headerSchema = z.object({
	name: z.string(),
	value: z.string()
}).passthrough();
const entrySchema = z.object({
	request: z.object({ url: z.string() }).passthrough(),
	response: z.object({
		status: z.number(),
		headers: z.array(headerSchema),
		content: z.object({
			size: z.number().optional(),
			mimeType: z.string().optional()
		}).passthrough().optional()
	}).passthrough()
}).passthrough();
const harSchema = z.object({ log: z.object({ entries: z.array(entrySchema) }).passthrough() }).passthrough();
const networkSchema = z.object({ document: z.object({ url: z.string() }).passthrough() }).passthrough();
/** Header rules read the same cell as the metric budgets. */
const REPRESENTATIVE_CELL = "mobile-cold";
function headerValues(entry, name) {
	const wanted = name.toLowerCase();
	return entry.response.headers.flatMap((item, index) => item.name.toLowerCase() === wanted ? [{
		value: item.value,
		index
	}] : []);
}
/** A header's combined value (repeated headers joined with ", ", as HTTP defines), or null when absent. */
function header(entry, name) {
	const values = headerValues(entry, name);
	return values.length ? values.map((item) => item.value).join(", ") : null;
}
/** Comma-separated header tokens, lowercased. */
function tokens(value) {
	return (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}
function normalizedUrl(value) {
	try {
		const url = new URL(value);
		url.hash = "";
		return url.toString();
	} catch {
		return;
	}
}
/** Finds the final document response of one Playhouse cell in its HAR, using `network-<cell>.json` for the document URL. */
async function matchDocument(playhouse, page, cell) {
	const harArtifact = `network-${cell}.har`;
	const [har, network] = await Promise.all([playhouse.readJson(page, harArtifact, harSchema), playhouse.readJson(page, `network-${cell}.json`, networkSchema)]);
	const finalUrl = network?.document.url ?? null;
	if (!har || !finalUrl) return {
		harArtifact,
		finalUrl,
		reason: "The HAR or final document identity was unavailable."
	};
	const expected = normalizedUrl(finalUrl);
	const index = har.log.entries.map((entry) => normalizedUrl(entry.request.url)).lastIndexOf(expected);
	if (index < 0) return {
		harArtifact,
		finalUrl,
		reason: "The final document response could not be matched in the HAR."
	};
	return {
		harArtifact,
		finalUrl,
		entries: har.log.entries,
		document: {
			entry: har.log.entries[index],
			index
		}
	};
}
/** Successful (200) responses served from the document's own host; third-party responses are not graded. */
function sameHostResponses(match) {
	const host = new URL(match.finalUrl).host;
	return match.entries.flatMap((entry, index) => {
		try {
			return entry.response.status === 200 && new URL(entry.request.url).host === host ? [{
				entry,
				index
			}] : [];
		} catch {
			return [];
		}
	});
}
function resourceKind(entry) {
	const type = (entry.response.content?.mimeType || header(entry, "content-type") || "").split(";")[0].trim().toLowerCase();
	if (type === "text/html" || type === "application/xhtml+xml") return "html";
	if (type.includes("javascript") || type.includes("ecmascript")) return "js";
	if (type === "text/css") return "css";
	if (type.startsWith("image/")) return "image";
	if (type.startsWith("font/") || type.includes("font-")) return "font";
	return "other";
}
/** `Cache-Control` directives, lowercased, with their values (`max-age=60` → `max-age` → `60`). */
function cacheControl(entry) {
	return new Map(tokens(header(entry, "cache-control")).map((item) => {
		const [name, ...value] = item.split("=");
		return [name.trim(), value.join("=").trim().replace(/^"|"$/g, "")];
	}));
}
const COMPRESSED_ENCODINGS = [
	"br",
	"gzip",
	"zstd"
];
const harRuleDataSchema = z.object({
	cell: z.string(),
	checked: z.array(z.object({
		page: z.string(),
		url: z.string(),
		responses: z.number()
	}).strict()),
	failures: z.array(z.object({
		page: z.string(),
		url: z.string(),
		entry: z.number(),
		reasons: z.array(z.string()),
		headers: z.record(z.string(), z.string().nullable())
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const MAX_FAILURE_EVIDENCE = 10;
/**
* A rule script that runs `check` on each page's representative HAR. It fails when any response fails, passes when every
* checked response passes, and leaves the rule undecided when no page could be checked or no response was eligible.
* `passed` completes the pass summary ("All 12 <subject> checked on home <passed>.").
*/
function harRule(subject, check, passed = "passed") {
	return async ({ pages, playhouse }) => {
		const data = {
			cell: REPRESENTATIVE_CELL,
			checked: [],
			failures: [],
			skipped: []
		};
		const documents = [];
		for (const page of pages) {
			const match = await matchDocument(playhouse, page.label, REPRESENTATIVE_CELL);
			if ("reason" in match) {
				data.skipped.push({
					page: page.label,
					reason: match.reason
				});
				continue;
			}
			const result = check(match);
			data.checked.push({
				page: page.label,
				url: match.finalUrl,
				responses: result.responses
			});
			data.failures.push(...result.failures.map((failure) => ({
				page: page.label,
				url: failure.entry.entry.request.url,
				entry: failure.entry.index,
				reasons: failure.reasons,
				headers: failure.headers
			})));
			documents.push({
				type: "playhouse",
				page: page.label,
				artifact: match.harArtifact,
				pointer: `/log/entries/${match.document.index}/request/url`,
				value: match.finalUrl
			});
		}
		const responses = data.checked.reduce((total, item) => total + item.responses, 0);
		if (!responses) return { data };
		const pageList = data.checked.map((item) => item.page).join(", ");
		if (!data.failures.length) return {
			data,
			decision: {
				status: "pass",
				summary: `All ${responses} ${subject} checked on ${pageList} ${passed}.`,
				evidence: documents
			}
		};
		const harArtifact = `network-${REPRESENTATIVE_CELL}.har`;
		const reasons = [...new Set(data.failures.flatMap((failure) => failure.reasons))];
		return {
			data,
			decision: {
				status: "fail",
				summary: `${data.failures.length} of ${responses} ${subject} failed: ${reasons.slice(0, 3).join(" ")}${reasons.length > 3 ? ` (+${reasons.length - 3} more)` : ""}`,
				evidence: data.failures.slice(0, MAX_FAILURE_EVIDENCE).map((failure) => ({
					type: "playhouse",
					page: failure.page,
					artifact: harArtifact,
					pointer: `/log/entries/${failure.entry}/response/headers`,
					value: `${failure.url}: ${failure.reasons.join(" ")}`
				}))
			}
		};
	};
}

//#endregion
export { harRuleDataSchema as a, matchDocument as c, sameHostResponses as d, tokens as f, harRule as i, normalizedUrl as l, REPRESENTATIVE_CELL as n, header as o, cacheControl as r, headerValues as s, COMPRESSED_ENCODINGS as t, resourceKind as u };