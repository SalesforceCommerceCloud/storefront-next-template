import { n as sanitizeText, r as sanitizeUrl, t as sanitizeJsonValue } from "./sanitize.js";
import { a as MIN_RECOMMENDED_BYTES, o as bundleAnalysisSchema } from "./schema.js";
import path from "node:path";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { z } from "zod";

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
//#region src/audit/events.ts
const severity = z.enum([
	"critical",
	"high",
	"medium",
	"low",
	"info"
]);
const guidance = z.enum(GUIDANCE);
const metric = z.object({
	key: z.string(),
	value: z.string(),
	bad: z.boolean().optional()
}).strict();
const planStage = z.object({
	id: z.string(),
	title: z.string(),
	detail: z.string().optional()
}).strict();
const progressEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("run.start"),
		runId: z.string(),
		startedAt: z.string(),
		target: z.object({
			url: z.string().optional(),
			commit: z.string().optional(),
			env: z.string().optional()
		}).strict().optional(),
		plan: z.array(planStage).default([])
	}).strict(),
	z.object({
		type: z.literal("stage.start"),
		stageId: z.string()
	}).strict(),
	z.object({
		type: z.literal("stage.complete"),
		stageId: z.string(),
		summary: z.string().optional(),
		durationMs: z.number().int().nonnegative().optional()
	}).strict(),
	z.object({
		type: z.literal("page.start"),
		pageId: z.string(),
		label: z.string(),
		url: z.string()
	}).strict(),
	z.object({
		type: z.literal("page.run"),
		pageId: z.string(),
		runIndex: z.number().int().positive(),
		total: z.number().int().positive(),
		status: z.enum([
			"running",
			"ok",
			"failed",
			"retry"
		])
	}).strict(),
	z.object({
		type: z.literal("page.complete"),
		pageId: z.string(),
		score: z.number().optional(),
		metrics: z.array(metric).default([])
	}).strict(),
	z.object({
		type: z.literal("rules.progress"),
		evaluated: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
		category: z.string().optional(),
		categoryEvaluated: z.number().int().nonnegative().optional(),
		categoryTotal: z.number().int().nonnegative().optional()
	}).strict(),
	z.object({
		type: z.literal("finding"),
		id: z.string(),
		severity,
		title: z.string(),
		category: z.string().optional(),
		source: z.string().optional(),
		ruleId: z.string().optional(),
		preliminary: z.boolean().default(true)
	}).strict(),
	z.object({
		type: z.literal("log"),
		level: z.enum([
			"info",
			"ok",
			"warn",
			"find"
		]),
		message: z.string()
	}).strict(),
	z.object({
		type: z.literal("run.complete"),
		guidance: guidance.optional(),
		scores: z.array(z.object({
			label: z.string(),
			score: z.number()
		}).strict()).default([])
	}).strict(),
	z.object({
		type: z.literal("run.error"),
		message: z.string(),
		stageId: z.string().optional()
	}).strict()
]);
/** Validate, sanitize, stamp with an arrival time, and append one event. */
async function appendEvent(file, event) {
	const validated = progressEventSchema.parse(event);
	const stored = {
		...progressEventSchema.parse(sanitizeJsonValue(validated)),
		at: (/* @__PURE__ */ new Date()).toISOString()
	};
	await appendFile(file, `${JSON.stringify(stored)}\n`);
	return stored;
}
/** Read and validate every event in the log. Tolerates a partially written
* trailing line (a concurrent append) and skips anything that fails to parse. */
async function readEvents(file) {
	let text;
	try {
		text = await readFile(file, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	const events = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (typeof parsed !== "object" || parsed === null) continue;
		const { at,...rest } = parsed;
		const result = progressEventSchema.safeParse(rest);
		if (!result.success) continue;
		events.push({
			...result.data,
			at: typeof at === "string" ? at : (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	return events;
}
/** The events of the latest run: a log passed with `--events` can hold several runs, each from its run.start. */
function latestRunEvents(events) {
	const start = events.map((event) => event.type).lastIndexOf("run.start");
	return start === -1 ? events : events.slice(start);
}
/** Derive the coarse run status from the event log for /api/status. The full
* view-model reduction lives in the client (the single reducer). */
function deriveStatus(events) {
	let status = "preparing";
	let resumable = false;
	for (const event of latestRunEvents(events)) {
		if (event.type === "run.complete") return "complete";
		if (event.type === "run.error") {
			status = "error";
			resumable = event.stageId !== void 0;
		} else if (status === "error") status = resumable ? "running" : "error";
		else if (event.type === "stage.start" || event.type === "page.start" || event.type === "run.start") status = status === "preparing" ? "running" : status;
	}
	return status;
}
/** Whether the run is over at `event`: it completed, or prepare failed. A failed finalize is not over, since it
* can be fixed and run again. */
function endsRun(event) {
	return event.type === "run.complete" || event.type === "run.error" && event.stageId === void 0;
}

//#endregion
export { runIdFor as S, validateWaterfall as _, progressEventSchema as a, listRuns as b, SEVERITY_ORDER as c, evidenceSchema as d, parsePrepared as f, validateRecommendations as g, validateEvidence as h, latestRunEvents as i, auditResultSchema as l, validateAuditResult as m, deriveStatus as n, readEvents as o, preparedSchema as p, endsRun as r, LIGHTHOUSE_REPORT as s, appendEvent as t, evaluationSchema as u, RUN_ID as v, runDir as x, latestRunDir as y };