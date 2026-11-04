import "./package.js";
import { t as AUDIT_ROOT } from "./assets.js";
import "./sanitize.js";
import { i as BUNDLE_VISUALIZER } from "./schema.js";
import { b as listRuns, n as deriveStatus, o as readEvents, p as preparedSchema, r as endsRun, s as LIGHTHOUSE_REPORT, v as RUN_ID, x as runDir } from "./events.js";
import { constants } from "node:fs";
import path from "node:path";
import { access, readFile, rm } from "node:fs/promises";
import { z } from "zod";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";

//#region src/audit/server.ts
const defaultUiDir = path.join(AUDIT_ROOT, "ui");
const POLL_MS = 500;
async function fileExists(file) {
	try {
		await access(file, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
const preparedPagesSchema = z.object({ pages: preparedSchema.shape.pages });
/** Absolute archive directory for `label`, from the run's prepared.json
* (undefined when it is missing, unreadable, or has no such page). */
async function preparedArchiveDir(run, label) {
	const preparedPath = path.join(run, "prepared.json");
	if (!await fileExists(preparedPath)) return void 0;
	let raw;
	try {
		raw = JSON.parse(await readFile(preparedPath, "utf8"));
	} catch {
		return;
	}
	const prepared = preparedPagesSchema.safeParse(raw);
	const page = prepared.success ? prepared.data.pages.find((item) => item.label === label) : void 0;
	return page && path.resolve(run, page.archiveDir);
}
/** A run reports `complete` only once run.complete has landed and the result file is actually readable. */
async function statusOf(run) {
	if (!run.eventsFile || !await fileExists(run.eventsFile)) return await fileExists(run.resultPath) ? "complete" : "preparing";
	const derived = deriveStatus(await readEvents(run.eventsFile));
	if (derived === "complete" && !await fileExists(run.resultPath)) return "running";
	return derived;
}
function createApp(options) {
	const uiDir = options.uiDir ?? defaultUiDir;
	const app = new Hono();
	/** The run `id` names (the latest when absent); undefined when there is no such run. */
	const findRun = async (id) => {
		if (!options.workspace) {
			if (id || !options.input) return void 0;
			return {
				dir: path.dirname(options.input),
				resultPath: options.input
			};
		}
		const runs = await listRuns(options.workspace);
		const runId = id ?? runs[0];
		if (!runId || !runs.includes(runId)) return void 0;
		const dir = runDir(options.workspace, runId);
		return {
			id: runId,
			dir,
			resultPath: path.join(dir, "audit-result.json"),
			eventsFile: path.join(dir, "events.ndjson")
		};
	};
	const requestedRun = (context) => findRun(context.req.query("run"));
	app.get("/api/status", async (context) => {
		const run = await requestedRun(context);
		const status = run ? await statusOf(run) : "preparing";
		return context.json({
			status,
			phase: status,
			runId: run?.id
		});
	});
	app.get("/api/runs", async (context) => {
		const { workspace } = options;
		if (!workspace) return context.json([]);
		const runs = await Promise.all((await listRuns(workspace)).map(async (id) => ({
			id,
			complete: await fileExists(path.join(runDir(workspace, id), "audit-result.json"))
		})));
		return context.json(runs);
	});
	app.delete("/api/runs/:id", async (context) => {
		const id = context.req.param("id");
		if (!options.workspace || !RUN_ID.test(id)) return context.json({ error: "No such run." }, 404);
		const runs = await listRuns(options.workspace);
		if (!runs.includes(id)) return context.json({ error: "No such run." }, 404);
		if (id === runs[0]) return context.json({ error: "The latest run cannot be deleted." }, 409);
		await rm(runDir(options.workspace, id), {
			recursive: true,
			force: true
		});
		return context.body(null, 204);
	});
	app.get("/api/events", (context) => {
		if (!options.workspace) return context.json({ error: "This server is not watching a run." }, 409);
		return streamSSE(context, async (stream) => {
			let closed = false;
			stream.onAbort(() => {
				closed = true;
			});
			let eventsFile;
			let sent = 0;
			while (!closed) {
				eventsFile ??= (await findRun())?.eventsFile;
				const events = eventsFile ? await readEvents(eventsFile) : [];
				for (; sent < events.length; sent++) {
					await stream.writeSSE({ data: JSON.stringify(events[sent]) });
					if (endsRun(events[sent])) {
						await stream.writeSSE({
							event: "end",
							data: ""
						});
						closed = true;
						break;
					}
				}
				if (closed) break;
				await stream.sleep(POLL_MS);
			}
		});
	});
	app.get("/api/audit", async (context) => {
		const run = await requestedRun(context);
		if (!run) return context.json({ error: "No such run." }, 404);
		if (await statusOf(run) !== "complete") return context.json({ error: "Audit is not complete." }, 409);
		return context.json(JSON.parse(await readFile(run.resultPath, "utf8")));
	});
	app.get("/api/pages/:label/report", async (context) => {
		const run = await requestedRun(context);
		if (!run) return context.json({ error: "No such run." }, 404);
		if (await statusOf(run) !== "complete") return context.json({ error: "Audit is not complete." }, 409);
		const archiveDir = await preparedArchiveDir(run.dir, context.req.param("label"));
		const report = archiveDir && path.join(archiveDir, LIGHTHOUSE_REPORT);
		if (!report || !await fileExists(report)) return context.json({ error: "No Lighthouse report for this page." }, 404);
		context.header("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox");
		return context.html(await readFile(report, "utf8"));
	});
	app.get("/api/bundle/visualizer", async (context) => {
		const run = await requestedRun(context);
		if (!run) return context.json({ error: "No such run." }, 404);
		if (await statusOf(run) !== "complete") return context.json({ error: "Audit is not complete." }, 409);
		const report = path.join(run.dir, BUNDLE_VISUALIZER);
		if (!await fileExists(report)) return context.json({ error: "This run has no bundle visualizer report." }, 404);
		context.header("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox");
		return context.html(await readFile(report, "utf8"));
	});
	app.use("/*", serveStatic({ root: path.relative(process.cwd(), uiDir) || "." }));
	app.get("/*", serveStatic({ path: path.relative(process.cwd(), path.join(uiDir, "index.html")) }));
	return app;
}
async function startServer(options) {
	const app = createApp(options);
	const port = options.port ?? 8787;
	const host = options.host ?? "localhost";
	const server = await new Promise((resolve$1, reject) => {
		const listening = serve({
			fetch: app.fetch,
			port,
			hostname: host
		}, () => {
			listening.off("error", fail);
			resolve$1(listening);
		});
		function fail(error) {
			reject(error.code === "EADDRINUSE" ? /* @__PURE__ */ new Error(`Port ${port} is in use; pass --port <n> to use another one`) : error);
		}
		listening.once("error", fail);
	});
	return {
		url: `http://${host}:${port}`,
		close: () => server.close()
	};
}

//#endregion
export { createApp, startServer };