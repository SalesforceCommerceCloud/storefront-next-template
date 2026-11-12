import { _ as GUIDANCE, v as sanitizeJsonValue } from "./results.js";
import { appendFile, readFile } from "node:fs/promises";
import { z } from "zod";

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
export { progressEventSchema as a, latestRunEvents as i, deriveStatus as n, readEvents as o, endsRun as r, appendEvent as t };