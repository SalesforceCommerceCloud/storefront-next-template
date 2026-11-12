import { t as version } from "./package.js";
import { a as MIN_RECOMMENDED_BYTES, o as bundleAnalysisSchema } from "./schema.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { z } from "zod";

//#region src/audit/assets.ts
/** The storefront-next-dev version, not the host CLI's: under `b2c sfnext`, oclif's config version is b2c's. */
const VERSION = version;
function packageRoot(from) {
	for (let dir = from;; dir = path.dirname(dir)) {
		if (existsSync(path.join(dir, "package.json"))) return dir;
		if (path.dirname(dir) === dir) throw new Error(`No package.json above ${from}`);
	}
}
const here = path.dirname(fileURLToPath(import.meta.url));
const root = packageRoot(here);
/**
* The directory holding the audit's runtime assets (catalog, instructions, UI). tsdown moves shared code into
* chunks at the top of `dist`, so paths relative to a module break after bundling. This resolves to `src/audit`
* when running from source (tests) and `dist/audit` when running the build.
*/
const AUDIT_ROOT = path.join(root, path.relative(root, here).split(path.sep)[0] === "src" ? "src" : "dist", "audit");

//#endregion
//#region src/audit/sanitize.ts
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
const bearer = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const secretKey = new RegExp(`\\b([\\w-]{0,64}?)(?:api[_-]?key|api[_-]?signature|access[_-]?token|token|secret|password|passwd|authorization|set-cookie|cookie|session[_-]?id|sessionid|credentials?|csrf[_-]?token|private[_-]?key)(?:[_-]?(?:access[_-]?)?(?:key|value|hash|id|token))?\\\\?["']?\\s*[:=]\\s*`, "gi");
const knownToken = /(?<![\w-])eyJ[\w-]{1,1024}\.eyJ[\w-]{1,16384}\.[\w-]*|\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}|\bwhsec_[A-Za-z0-9]{20,}|\bgh[opsru]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bnpm_[A-Za-z0-9]{36}\b|\bx(?:ox[abeprs]|app)-(?![\w-]{0,253}\.[A-Za-z])[A-Za-z0-9-]{10,}|\bsk-(?:ant|proj)-(?![\w-]{0,253}\.[A-Za-z])[\w-]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|(?<=hooks\.slack\.com\/services\/)[A-Za-z0-9/]+/g;
const pemBegin = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/;
const pemEnd = /-----END [A-Z ]{0,40}PRIVATE KEY-----/;
const pemLine = /(?:[ \t]*(?:\r?\n|(?:\\r)?\\n))*[ \t]*(?:(?:Proc-Type|DEK-Info):[^\r\n\\]*|[A-Za-z0-9+/=]{16,})/y;
const maxKeyLength = 16384;
/** Not after `@` or `~`: `@/components/header` and `~/lib` are import aliases, not files on disk. */
const absolutePath = /(?<![\w.@~-])(?:[A-Za-z]:[\\/]|\/)(?:[^\s<>'"`]+[\\/])+[^\s<>'"`,.;:]*/g;
const webUrl = /https?:\/\/[^\s<>'"`]+/gi;
/** Returns the first match at or after an index. Indexes must not decrease; reusing the last match keeps repeated searches linear. */
function finder(pattern, text) {
	const global = new RegExp(pattern.source, "g");
	let found;
	return (from) => {
		if (found === void 0 || found && found.index < from) {
			global.lastIndex = from;
			found = global.exec(text);
		}
		return found;
	};
}
/** Redacts each private key from its BEGIN line to its END line. A key without an END line before the next key
* (or within maxKeyLength) is redacted up to its last key-like line, so prose after a lone header stays. */
function redactPrivateKeys(text) {
	const nextBegin = finder(pemBegin, text);
	const nextEnd = finder(pemEnd, text);
	let out = "";
	let last = 0;
	for (let begin = nextBegin(0); begin; begin = nextBegin(last)) {
		const start = begin.index + begin[0].length;
		const end = nextEnd(start);
		const following = nextBegin(start);
		let stop = start;
		if (end && end.index - start <= maxKeyLength && (!following || following.index > end.index)) stop = end.index + end[0].length;
		else for (pemLine.lastIndex = stop; pemLine.exec(text); pemLine.lastIndex = stop) stop = pemLine.lastIndex;
		out += `${text.slice(last, begin.index)}[REDACTED]`;
		last = stop;
	}
	return out + text.slice(last);
}
const quoteAt = (text, index) => {
	if (text[index] === "\"" || text[index] === "'") return text[index];
	return text[index] === "\\" && (text[index + 1] === "\"" || text[index + 1] === "'") ? text.slice(index, index + 2) : "";
};
const lineEnd = (text, index) => {
	const end = text.indexOf("\n", index);
	return end === -1 ? text.length : end;
};
const skip = (text, index, pattern) => {
	while (index < text.length && pattern.test(text.charAt(index))) index++;
	return index;
};
const wordChar = /[^\s"',;}&\\]/;
const tokenChar = /[\w.~+/=-]/;
const schemeCredential = /[ \t]+[^\s"',;}&\\]+/y;
/**
* Reads the value that starts at `start`: a quoted string up to its unescaped closing quote, a list or object up
* to its matching bracket (plus any token glued to it), an auth scheme with its credential, or one word. An
* unclosed quote or bracket takes the rest of the line. `core` is the value without its quotes.
*/
function scanValue(text, start) {
	const quote = quoteAt(text, start);
	if (quote) {
		for (let index = start + quote.length; index < text.length && text[index] !== "\n"; index += text[index] === "\\" && text[index + 1] !== "\n" ? 2 : 1) if (text.startsWith(quote, index)) return {
			end: index + quote.length,
			quote,
			core: text.slice(start + quote.length, index)
		};
	} else if (text[start] === "[" || text[start] === "{") {
		let depth = 0;
		let inQuote = "";
		for (let index = start; index < text.length && text[index] !== "\n"; index++) {
			if (inQuote) {
				if (text.startsWith(inQuote, index)) {
					index += inQuote.length - 1;
					inQuote = "";
				} else if (text[index] === "\\") index++;
				continue;
			}
			inQuote = quoteAt(text, index);
			if (inQuote) index += inQuote.length - 1;
			else if (text[index] === "[" || text[index] === "{") depth++;
			else if ((text[index] === "]" || text[index] === "}") && --depth === 0) {
				const end$1 = skip(text, index + 1, tokenChar);
				return {
					end: end$1,
					quote: "",
					core: text.slice(start, end$1)
				};
			}
		}
	} else {
		let end$1 = skip(text, start, wordChar);
		if (/^(?:Basic|Bearer|Digest|Token)$/i.test(text.slice(start, end$1))) {
			schemeCredential.lastIndex = end$1;
			if (schemeCredential.exec(text)) end$1 = schemeCredential.lastIndex;
		}
		return {
			end: end$1,
			quote: "",
			core: text.slice(start, end$1)
		};
	}
	const end = lineEnd(text, start);
	return {
		end,
		quote: "",
		core: text.slice(start, end)
	};
}
/** Values that can't be secrets: an exact placeholder, booleans and null under any name (`hasPassword: true`),
* and numbers under a page, count or limit name (`pageToken=2`). */
function keepValue(prefix, value) {
	return /^(?:\[REDACTED\]|(?:Basic|Bearer|Digest|Token) \[REDACTED\]|true|false|null|undefined)$/i.test(value) || /^-?\d+(?:\.\d+)?$/.test(value) && /page|max|min|count|limit|total|num/i.test(prefix);
}
/** Redacts the value of every secret-named assignment. Each value is read and decided on once, and the search
* resumes after it, so a value is never rewritten twice and the work stays linear. */
function redactAssignments(text) {
	let out = "";
	let last = 0;
	secretKey.lastIndex = 0;
	for (let key = secretKey.exec(text); key; key = secretKey.exec(text)) {
		const start = key.index + key[0].length;
		const { end, quote, core } = scanValue(text, start);
		if (end === start) continue;
		if (!keepValue(key[1] ?? "", core)) {
			const scheme = /^(Basic|Bearer|Digest|Token)\s+\S/i.exec(core)?.[1];
			out += `${text.slice(last, start)}${quote}${scheme ? `${scheme} ` : ""}[REDACTED]${quote}`;
			last = end;
		}
		secretKey.lastIndex = end;
	}
	return out + text.slice(last);
}
function sanitizeUrl(value) {
	const parsed = new URL(value);
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must use https (or http with --allow-http)");
	parsed.username = "";
	parsed.password = "";
	for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, "[REDACTED]");
	parsed.hash = "";
	return parsed.toString();
}
function sanitizeText(value) {
	const urls = [];
	let sanitized = redactPrivateKeys(value.replaceAll("\0", "")).replace(knownToken, "[REDACTED]").replace(webUrl, (url) => {
		try {
			urls.push(sanitizeUrl(url));
			return `\u0000URL${urls.length - 1}\u0000`;
		} catch {
			return "[REDACTED_URL]";
		}
	});
	sanitized = redactAssignments(sanitized.replace(bearer, "Bearer [REDACTED]")).replace(absolutePath, "[REDACTED_PATH]");
	return sanitized.replace(/\u0000URL(\d+)\u0000/g, (match, index) => urls[Number(index)] ?? match);
}
function sanitizeJsonValue(value, key) {
	if (typeof value === "string") {
		if (key === "pointer" && value.startsWith("/")) return value.split("/").map((token, index) => index === 0 ? "" : sanitizeText(token)).join("/");
		return sanitizeText(value);
	}
	if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeJsonValue(child, childKey)]));
	return value;
}

//#endregion
//#region src/audit/guidance.ts
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
const GUIDANCE = [
	"go",
	"go-with-fixes",
	"no-go"
];
/** Launch guidance from the known findings: critical blocks launch, high or medium needs fixes. */
function guidanceFor(evaluations) {
	const severities = new Set(evaluations.filter((item) => item.disposition === "finding").map((item) => item.severity));
	if (severities.has("critical")) return "no-go";
	return severities.has("high") || severities.has("medium") ? "go-with-fixes" : "go";
}

//#endregion
//#region src/audit/runs.ts
const RUNS_DIR = "runs";
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
/** `2026-10-14T10:26:00.123Z` → `2026-10-14T10-26-00Z`, safe as a folder name. */
function runIdFor(startedAt) {
	return startedAt.replace(/\.\d+Z$/, "Z").replaceAll(":", "-");
}
function runDir(workspace, id) {
	if (!RUN_ID.test(id)) throw new Error(`Invalid run id: ${id}`);
	return path.join(workspace, RUNS_DIR, id);
}
/** Run ids in the workspace, newest first. */
async function listRuns(workspace) {
	let entries;
	try {
		entries = await readdir(path.join(workspace, RUNS_DIR), { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	return entries.filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name)).map((entry) => entry.name).sort().reverse();
}
/** The latest run's folder; throws when the workspace has no runs yet. */
async function latestRunDir(workspace) {
	const [latest] = await listRuns(workspace);
	if (!latest) throw new Error(`${workspace} has no audit runs; run prepare first`);
	return runDir(workspace, latest);
}

//#endregion
//#region src/audit/results.ts
/** Archive file name of the per-page Lighthouse HTML report. When present it is
* recorded in `artifacts` as `{ available: true }` and served by the dashboard
* server rather than embedded. ui/src/panels/Performance.tsx repeats this name. */
const LIGHTHOUSE_REPORT = "report-mobile-cold.html";
/** The workspace's prepared.json, written by `prepare` and read by `finalize` and the dashboard server. */
const preparedSchema = z.object({
	schemaVersion: z.literal("1.0"),
	run: z.object({
		id: z.string().regex(RUN_ID),
		generatedAt: z.string().datetime(),
		toolVersion: z.string(),
		playhouseVersion: z.string().optional()
	}).strict(),
	project: z.object({
		root: z.string(),
		packageName: z.string().optional()
	}).strict(),
	instructions: z.string().optional(),
	pages: z.array(z.object({
		label: z.string(),
		url: z.string(),
		archiveDir: z.string()
	}).strict()),
	pageFailures: z.array(z.object({
		label: z.string(),
		url: z.string(),
		error: z.string()
	}).strict()).optional(),
	expectedPages: z.array(z.string()).optional(),
	coverage: z.array(z.object({
		page: z.string(),
		status: z.literal("missing"),
		note: z.string()
	}).strict()).optional().default([]),
	rules: z.array(z.object({
		ruleId: z.string(),
		title: z.string(),
		file: z.string(),
		data: z.string().optional(),
		output: z.string()
	}).strict()),
	decidedFindings: z.array(z.object({
		ruleId: z.string(),
		title: z.string(),
		severity: z.string(),
		summary: z.string()
	}).strict())
}).strict();
function parsePrepared(value) {
	const parsed = preparedSchema.safeParse(value);
	if (!parsed.success) throw new Error(`prepared.json is invalid: ${parsed.error.message}`);
	return parsed.data;
}
const evidenceSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("source"),
		file: z.string(),
		line: z.number().int().positive().optional(),
		excerpt: z.string().optional()
	}),
	z.object({
		type: z.literal("playhouse"),
		page: z.string(),
		artifact: z.string(),
		pointer: z.string().optional(),
		value: z.union([
			z.string(),
			z.number(),
			z.boolean()
		]).optional()
	}),
	z.object({
		type: z.literal("manual"),
		description: z.string(),
		location: z.string().optional()
	})
]);
/** The one rule whose evaluation may carry a `waterfall`: the per-page server request graph drawn on the Performance tab. */
const WATERFALL_RULE_ID = "performance/server-request-waterfall";
const waterfallStepSchema = z.object({
	id: z.string().regex(/^[a-z0-9-]+$/),
	kind: z.enum([
		"middleware",
		"loader",
		"api",
		"render"
	]),
	label: z.string().min(1),
	service: z.enum([
		"scapi",
		"slas",
		"ocapi",
		"einstein",
		"data-store",
		"other"
	]).optional(),
	source: z.object({
		file: z.string(),
		line: z.number().int().positive().optional()
	}).strict(),
	after: z.array(z.string()).default([]),
	blocking: z.boolean(),
	conditional: z.string().optional(),
	note: z.string().optional(),
	critical: z.boolean().optional(),
	opportunity: z.enum([
		"parallelize",
		"scapi-hook",
		"stream"
	]).optional()
}).strict();
const waterfallSchema = z.object({ pages: z.array(z.object({
	page: z.string(),
	route: z.string(),
	summary: z.string(),
	steps: z.array(waterfallStepSchema).min(1).max(60)
}).strict()) }).strict();
/** The one rule whose evaluation may carry `recommendations`: the AI's suggestions in the Bundle size view. */
const RECOMMENDATIONS_RULE_ID = "performance/reduce-javascript-on-load";
const RECOMMENDATION_CHANGES = [
	"lazy-component",
	"dynamic-import",
	"narrower-import",
	"replace",
	"remove"
];
/** Changes that keep the code but load it later, so they need a trigger. */
const DEFERRING_CHANGES = new Set(["lazy-component", "dynamic-import"]);
const recommendationSchema = z.object({
	pages: z.array(z.string()).min(1),
	title: z.string().min(1).max(140),
	change: z.enum(RECOMMENDATION_CHANGES),
	target: z.string().min(1),
	trigger: z.enum([
		"interaction",
		"visible",
		"navigation",
		"idle"
	]).optional(),
	how: z.string().min(1).max(1200),
	files: z.array(z.object({
		file: z.string(),
		line: z.number().int().positive().optional()
	}).strict()).min(1).max(10),
	savings: z.array(z.object({
		page: z.string(),
		bytes: z.number().int().nonnegative(),
		upTo: z.boolean()
	}).strict()).optional()
}).strict();
const recommendationsSchema = z.array(recommendationSchema).max(30);
const SEVERITY_ORDER = [
	"critical",
	"high",
	"medium",
	"low",
	"info"
];
const evaluationSchema = z.object({
	ruleId: z.string(),
	disposition: z.enum([
		"pass",
		"finding",
		"not-applicable",
		"not-verified"
	]),
	title: z.string(),
	description: z.string().optional(),
	severity: z.enum(SEVERITY_ORDER).optional(),
	summary: z.string(),
	remediation: z.string().optional(),
	evidence: z.array(evidenceSchema),
	method: z.enum(["script", "ai"]).optional(),
	waterfall: waterfallSchema.optional(),
	recommendations: recommendationsSchema.optional()
}).superRefine((value, context) => {
	if (value.disposition === "finding" && value.evidence.length === 0) context.addIssue({
		code: "custom",
		message: "finding requires evidence",
		path: ["evidence"]
	});
});
const guidanceSchema = z.enum(GUIDANCE);
const auditResultSchema = z.object({
	schemaVersion: z.literal("1.0"),
	run: z.object({
		id: z.string(),
		generatedAt: z.string(),
		toolVersion: z.string()
	}),
	project: z.object({ name: z.string().optional() }),
	pages: z.array(z.object({
		label: z.string(),
		url: z.string(),
		playhouse: z.object({
			archiveDir: z.string(),
			version: z.string(),
			lighthouseVersion: z.string(),
			artifacts: z.record(z.string(), z.json())
		})
	})),
	catalog: z.object({
		categories: z.array(z.object({
			id: z.string(),
			title: z.string(),
			ruleIds: z.array(z.string())
		})),
		ruleIds: z.array(z.string())
	}),
	evaluations: z.array(evaluationSchema),
	observations: z.array(z.object({
		title: z.string(),
		category: z.string().optional(),
		summary: z.string(),
		evidence: z.array(evidenceSchema)
	})).default([]),
	coverage: z.array(z.object({
		category: z.string().optional(),
		ruleId: z.string().optional(),
		page: z.string().optional(),
		status: z.enum([
			"covered",
			"partial",
			"missing"
		]),
		note: z.string()
	})),
	summary: z.object({
		guidance: guidanceSchema,
		narrative: z.string(),
		highlights: z.array(z.string()).max(6).default([])
	}).optional(),
	bundle: bundleAnalysisSchema.optional()
});
function validateEvidence(evidence, archiveFiles) {
	if (evidence.type === "source" && (evidence.file.split(/[\\/]/).includes("..") || pathIsAbsolute(evidence.file))) throw new Error(`Unsafe source evidence file: ${evidence.file}`);
	if (evidence.type === "playhouse") {
		const files = archiveFiles.get(evidence.page);
		if (!files) throw new Error(`Unknown Playhouse evidence page: ${evidence.page}`);
		if (!files.has(evidence.artifact)) throw new Error(`Unknown Playhouse evidence artifact for ${evidence.page}: ${evidence.artifact}`);
	}
}
/** A waterfall belongs only to its rule, names captured pages once each, and is an acyclic graph of known steps. */
function validateWaterfall(evaluation, pageLabels) {
	if (!evaluation.waterfall) return;
	if (evaluation.ruleId !== WATERFALL_RULE_ID) throw new Error(`waterfall is only supported on ${WATERFALL_RULE_ID}`);
	const seenPages = /* @__PURE__ */ new Set();
	for (const entry of evaluation.waterfall.pages) {
		if (!pageLabels.has(entry.page)) throw new Error(`Unknown waterfall page: ${entry.page}`);
		if (seenPages.has(entry.page)) throw new Error(`Duplicate waterfall page: ${entry.page}`);
		seenPages.add(entry.page);
		const steps = /* @__PURE__ */ new Map();
		for (const step of entry.steps) {
			if (steps.has(step.id)) throw new Error(`Duplicate waterfall step on ${entry.page}: ${step.id}`);
			steps.set(step.id, step);
			validateEvidence({
				type: "source",
				file: step.source.file
			}, /* @__PURE__ */ new Map());
		}
		for (const step of entry.steps) {
			for (const id of step.after) if (!steps.has(id)) throw new Error(`Waterfall step ${step.id} on ${entry.page} waits on unknown step: ${id}`);
			if (step.opportunity === "stream" && (!step.blocking || step.critical)) throw new Error(`Waterfall step ${step.id} on ${entry.page} can only suggest streaming when it is awaited and not critical`);
			if ((step.opportunity === "parallelize" || step.opportunity === "scapi-hook") && !step.after.length) throw new Error(`Waterfall step ${step.id} on ${entry.page} suggests ${step.opportunity} but waits on nothing`);
		}
		const done = /* @__PURE__ */ new Set();
		const visiting = /* @__PURE__ */ new Set();
		const visit = (id) => {
			if (done.has(id)) return;
			if (visiting.has(id)) throw new Error(`Waterfall on ${entry.page} has a cycle through step: ${id}`);
			visiting.add(id);
			for (const next of steps.get(id)?.after ?? []) visit(next);
			visiting.delete(id);
			done.add(id);
		};
		for (const id of steps.keys()) visit(id);
	}
}
/**
* Recommendations belong only to their rule, and each names a candidate or a package of every page it lists in the
* bundle analysis, whose bytes it takes. Without `bundle` (re-validating a finished result) only the rule, pages and
* files are checked.
*/
function validateRecommendations(evaluation, pageLabels, bundle) {
	if (!evaluation.recommendations) return;
	if (evaluation.ruleId !== RECOMMENDATIONS_RULE_ID) throw new Error(`recommendations is only supported on ${RECOMMENDATIONS_RULE_ID}`);
	const seen = /* @__PURE__ */ new Set();
	for (const item of evaluation.recommendations) {
		const label = `${item.change} ${item.target}`;
		if (seen.has(label)) throw new Error(`Duplicate recommendation: ${label}`);
		seen.add(label);
		if (new Set(item.pages).size !== item.pages.length) throw new Error(`Recommendation ${label} lists a page twice`);
		for (const page of item.pages) if (!pageLabels.has(page)) throw new Error(`Unknown recommendation page: ${page}`);
		for (const file of item.files) validateEvidence({
			type: "source",
			file: file.file
		}, /* @__PURE__ */ new Map());
		const deferring = DEFERRING_CHANGES.has(item.change);
		if (deferring !== Boolean(item.trigger)) throw new Error(`Recommendation ${label} ${deferring ? "needs a trigger" : "only defers code with lazy-component or dynamic-import, so it takes no trigger"}`);
		if (!bundle) continue;
		item.savings = item.pages.map((page) => {
			const local = bundle.pages.find((entry) => entry.page === page)?.local;
			const candidate = local?.candidates.find((entry) => entry.target === item.target);
			const owner = local?.packages.find((entry) => entry.name === item.target && entry.kind !== "build");
			if (candidate) {
				const file = item.files.find((entry) => entry.file === candidate.importer.file);
				if (file && candidate.importer.line) file.line ??= candidate.importer.line;
				return {
					page,
					bytes: candidate.savedBytes,
					upTo: !deferring
				};
			}
			if (owner) return deferring && owner.deferrableBytes !== void 0 ? {
				page,
				bytes: owner.deferrableBytes,
				upTo: false
			} : {
				page,
				bytes: owner.bytes,
				upTo: true
			};
			throw new Error(`Recommendation ${label}: ${item.target} is not a candidate or package of ${page} in bundle/analysis.json`);
		});
		const most = Math.max(...item.savings.map((entry) => entry.bytes));
		if (most < MIN_RECOMMENDED_BYTES) throw new Error(`Recommendation ${label} saves at most ${Math.round(most / 1024)} KiB on its pages, below the ${MIN_RECOMMENDED_BYTES / 1024} KiB worth recommending; leave it out`);
	}
}
/** `archiveFiles` defaults to the artifacts embedded in `input.pages`. */
function validateAuditResult(input, catalog, archiveFiles) {
	const result = auditResultSchema.parse(input);
	assertUniquePageLabels(result.pages);
	if (!catalog && result.evaluations.some((evaluation) => evaluation.disposition === "finding" && !evaluation.severity)) throw new Error("finding requires severity");
	const declaredRules = result.catalog.categories.flatMap((category) => category.ruleIds);
	if (new Set(declaredRules).size !== declaredRules.length || declaredRules.slice().sort().join("\n") !== result.catalog.ruleIds.slice().sort().join("\n")) throw new Error("Catalog categories and ruleIds are inconsistent");
	for (const category of result.catalog.categories) for (const ruleId of category.ruleIds) if (!ruleId.startsWith(`${category.id}/`)) throw new Error(`Catalog rule ${ruleId} is not in category ${category.id}`);
	if (catalog) {
		const known = new Set(catalog.ruleIds);
		const categories = new Set(catalog.categories.map((category) => category.id));
		const pages = archiveFiles ?? new Map(result.pages.map((page) => [page.label, new Set(Object.keys(page.playhouse.artifacts))]));
		const severityByRule = new Map(catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule.severity])));
		const evaluated = /* @__PURE__ */ new Set();
		for (const evaluation of result.evaluations) {
			if (!known.has(evaluation.ruleId)) throw new Error(`Unknown rule id: ${evaluation.ruleId}`);
			if (evaluated.has(evaluation.ruleId)) throw new Error(`Duplicate evaluation: ${evaluation.ruleId}`);
			if (evaluation.disposition === "finding") {
				const ceiling = severityByRule.get(evaluation.ruleId);
				if (!ceiling) throw new Error(`Rule ${evaluation.ruleId} has no category in the catalog`);
				const supplied = evaluation.severity;
				evaluation.severity = supplied && SEVERITY_ORDER.indexOf(supplied) > SEVERITY_ORDER.indexOf(ceiling) ? supplied : ceiling;
			}
			evaluated.add(evaluation.ruleId);
		}
		for (const ruleId of catalog.ruleIds) if (!evaluated.has(ruleId)) result.evaluations.push({
			ruleId,
			disposition: "not-verified",
			title: ruleId,
			summary: "No evaluation was supplied.",
			evidence: []
		});
		for (const evaluation of result.evaluations) for (const evidence of evaluation.evidence) validateEvidence(evidence, pages);
		for (const observation of result.observations) for (const evidence of observation.evidence) validateEvidence(evidence, pages);
		for (const item of result.coverage) {
			if (item.ruleId && !known.has(item.ruleId)) throw new Error(`Unknown coverage rule id: ${item.ruleId}`);
			if (item.category && !categories.has(item.category)) throw new Error(`Unknown coverage category: ${item.category}`);
		}
		result.summary = {
			guidance: guidanceFor(result.evaluations),
			narrative: result.summary?.narrative ?? "",
			highlights: result.summary?.highlights ?? []
		};
		result.evaluations.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
		result.coverage.sort((a, b) => `${a.category ?? ""}/${a.ruleId ?? ""}/${a.page ?? ""}`.localeCompare(`${b.category ?? ""}/${b.ruleId ?? ""}/${b.page ?? ""}`));
	}
	const pageLabels = new Set(archiveFiles ? archiveFiles.keys() : result.pages.map((page) => page.label));
	for (const evaluation of result.evaluations) {
		validateWaterfall(evaluation, pageLabels);
		validateRecommendations(evaluation, pageLabels);
	}
	for (const page of result.pages) {
		page.url = sanitizeUrl(page.url);
		page.playhouse.archiveDir = "[PLAYHOUSE_ARCHIVE]";
		page.playhouse.artifacts = sanitizeJson(page.playhouse.artifacts);
	}
	for (const evaluation of result.evaluations) {
		evaluation.title = sanitizeText(evaluation.title);
		evaluation.summary = sanitizeText(evaluation.summary);
		if (evaluation.remediation) evaluation.remediation = sanitizeText(evaluation.remediation);
		for (const evidence of evaluation.evidence) sanitizeEvidence(evidence);
		for (const entry of evaluation.waterfall?.pages ?? []) {
			entry.route = sanitizeText(entry.route);
			entry.summary = sanitizeText(entry.summary);
			for (const step of entry.steps) {
				step.label = sanitizeText(step.label);
				if (step.conditional) step.conditional = sanitizeText(step.conditional);
				if (step.note) step.note = sanitizeText(step.note);
			}
		}
		for (const item of evaluation.recommendations ?? []) {
			item.title = sanitizeText(item.title);
			item.how = sanitizeText(item.how);
		}
	}
	if (result.bundle) result.bundle = bundleAnalysisSchema.parse(sanitizeJson(result.bundle));
	for (const observation of result.observations) {
		observation.title = sanitizeText(observation.title);
		observation.summary = sanitizeText(observation.summary);
		for (const evidence of observation.evidence) sanitizeEvidence(evidence);
	}
	for (const item of result.coverage) item.note = sanitizeText(item.note);
	if (result.summary) {
		result.summary.narrative = sanitizeText(result.summary.narrative);
		result.summary.highlights = result.summary.highlights.map(sanitizeText);
	}
	return result;
}
function assertUniquePageLabels(pages) {
	const labels = /* @__PURE__ */ new Set();
	for (const { label } of pages) {
		if (!/^[a-z][a-z0-9-]{0,63}$/.test(label)) throw new Error(`Invalid page label: ${label}`);
		if (labels.has(label)) throw new Error(`Duplicate page label: ${label}`);
		labels.add(label);
	}
}
function pathIsAbsolute(value) {
	return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}
function sanitizeJson(value) {
	return sanitizeJsonValue(value);
}
function sanitizeJsonPointer(pointer) {
	if (!pointer.startsWith("/")) return sanitizeText(pointer);
	return pointer.split("/").map((token, index) => index === 0 ? "" : sanitizeText(token)).join("/");
}
function sanitizeEvidence(evidence) {
	if (evidence.type === "source" && evidence.excerpt) evidence.excerpt = sanitizeText(evidence.excerpt);
	else if (evidence.type === "manual") {
		evidence.description = sanitizeText(evidence.description);
		if (evidence.location) evidence.location = sanitizeText(evidence.location);
	} else if (evidence.type === "playhouse") {
		if (evidence.pointer) evidence.pointer = sanitizeJsonPointer(evidence.pointer);
		if (typeof evidence.value === "string") evidence.value = sanitizeText(evidence.value);
	}
}

//#endregion
export { VERSION as S, GUIDANCE as _, evidenceSchema as a, sanitizeUrl as b, validateAuditResult as c, validateWaterfall as d, RUN_ID as f, runIdFor as g, runDir as h, evaluationSchema as i, validateEvidence as l, listRuns as m, SEVERITY_ORDER as n, parsePrepared as o, latestRunDir as p, auditResultSchema as r, preparedSchema as s, LIGHTHOUSE_REPORT as t, validateRecommendations as u, sanitizeJsonValue as v, AUDIT_ROOT as x, sanitizeText as y };