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
import { access, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { deriveStatus, endsRun, readEvents, type RunStatus } from './events';
import { z } from 'zod';
import { AUDIT_ROOT } from './assets';
import { BUNDLE_VISUALIZER } from './bundle/schema';
import { LIGHTHOUSE_REPORT, preparedSchema } from './results';
import { RUN_ID, listRuns, runDir } from './runs';

/**
 * The dashboard serves either an audit workspace or one finished
 * audit-result.json. For a workspace, every route reads one run's folder: the
 * run named by `?run=<id>`, else the latest. The live screen tails the latest
 * run's event log over /api/events (SSE).
 */
export interface ServeOptions {
    workspace?: string;
    /** A finished audit-result.json, served on its own (no run history). */
    input?: string;
    /** Directory holding the built UI (dist/ui). Defaults to sibling of this module. */
    uiDir?: string;
    port?: number;
    host?: string;
}

const defaultUiDir = path.join(AUDIT_ROOT, 'ui');
const POLL_MS = 500;

async function fileExists(file: string): Promise<boolean> {
    try {
        await access(file, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

// Only the page list matters here, so the rest of prepared.json isn't checked.
const preparedPagesSchema = z.object({ pages: preparedSchema.shape.pages });

/** Absolute archive directory for `label`, from the run's prepared.json
 * (undefined when it is missing, unreadable, or has no such page). */
async function preparedArchiveDir(run: string, label: string): Promise<string | undefined> {
    const preparedPath = path.join(run, 'prepared.json');
    if (!(await fileExists(preparedPath))) return undefined;
    let raw: unknown;
    try {
        raw = JSON.parse(await readFile(preparedPath, 'utf8'));
    } catch {
        return undefined;
    }
    const prepared = preparedPagesSchema.safeParse(raw);
    const page = prepared.success ? prepared.data.pages.find((item) => item.label === label) : undefined;
    return page && path.resolve(run, page.archiveDir);
}

interface Run {
    id?: string;
    dir: string;
    resultPath: string;
    /** Absent for a lone audit-result.json, which has no event log. */
    eventsFile?: string;
}

/** A run reports `complete` only once run.complete has landed and the result file is actually readable. */
async function statusOf(run: Run): Promise<RunStatus> {
    if (!run.eventsFile || !(await fileExists(run.eventsFile)))
        return (await fileExists(run.resultPath)) ? 'complete' : 'preparing';
    const derived = deriveStatus(await readEvents(run.eventsFile));
    if (derived === 'complete' && !(await fileExists(run.resultPath))) return 'running';
    return derived;
}

export function createApp(options: ServeOptions): Hono {
    const uiDir = options.uiDir ?? defaultUiDir;
    const app = new Hono();

    /** The run `id` names (the latest when absent); undefined when there is no such run. */
    const findRun = async (id?: string): Promise<Run | undefined> => {
        if (!options.workspace) {
            if (id || !options.input) return undefined;
            return { dir: path.dirname(options.input), resultPath: options.input };
        }
        const runs = await listRuns(options.workspace);
        const runId = id ?? runs[0];
        if (!runId || !runs.includes(runId)) return undefined;
        const dir = runDir(options.workspace, runId);
        return {
            id: runId,
            dir,
            resultPath: path.join(dir, 'audit-result.json'),
            eventsFile: path.join(dir, 'events.ndjson'),
        };
    };
    const requestedRun = (context: { req: { query: (name: string) => string | undefined } }) =>
        findRun(context.req.query('run'));

    app.get('/api/status', async (context) => {
        const run = await requestedRun(context);
        const status = run ? await statusOf(run) : 'preparing';
        return context.json({ status, phase: status, runId: run?.id });
    });

    // Newest first. A lone audit-result.json has no run history.
    app.get('/api/runs', async (context) => {
        const { workspace } = options;
        if (!workspace) return context.json([]);
        const runs = await Promise.all(
            (await listRuns(workspace)).map(async (id) => ({
                id,
                complete: await fileExists(path.join(runDir(workspace, id), 'audit-result.json')),
            }))
        );
        return context.json(runs);
    });

    // Deleting a run removes its folder and everything in it. The latest run may still be in progress, so it stays.
    app.delete('/api/runs/:id', async (context) => {
        const id = context.req.param('id');
        if (!options.workspace || !RUN_ID.test(id)) return context.json({ error: 'No such run.' }, 404);
        const runs = await listRuns(options.workspace);
        if (!runs.includes(id)) return context.json({ error: 'No such run.' }, 404);
        if (id === runs[0]) return context.json({ error: 'The latest run cannot be deleted.' }, 409);
        await rm(runDir(options.workspace, id), { recursive: true, force: true });
        return context.body(null, 204);
    });

    // Server-sent events: replay the whole log, then stream new events as the
    // audit appends them. Small file, single local reader → a poll loop is the
    // simplest robust tail across platforms.
    // The stream follows the latest run when it connects, waiting for the first one in a new workspace.
    app.get('/api/events', (context) => {
        if (!options.workspace) return context.json({ error: 'This server is not watching a run.' }, 409);
        return streamSSE(context, async (stream) => {
            let closed = false;
            stream.onAbort(() => {
                closed = true;
            });
            let eventsFile: string | undefined;
            let sent = 0;
            while (!closed) {
                eventsFile ??= (await findRun())?.eventsFile;
                const events = eventsFile ? await readEvents(eventsFile) : [];
                for (; sent < events.length; sent++) {
                    // Default (unnamed) SSE events so the browser can consume them all
                    // through EventSource.onmessage; the type lives inside the payload.
                    await stream.writeSSE({ data: JSON.stringify(events[sent]) });
                    // The server decides when the run is over and says so with a named `end` event, so the browser
                    // stops instead of reconnecting. A failed finalize keeps the stream open for the fixed one.
                    if (endsRun(events[sent])) {
                        await stream.writeSSE({ event: 'end', data: '' });
                        closed = true;
                        break;
                    }
                }
                if (closed) break;
                await stream.sleep(POLL_MS);
            }
        });
    });

    app.get('/api/audit', async (context) => {
        const run = await requestedRun(context);
        if (!run) return context.json({ error: 'No such run.' }, 404);
        if ((await statusOf(run)) !== 'complete') return context.json({ error: 'Audit is not complete.' }, 409);
        return context.json(JSON.parse(await readFile(run.resultPath, 'utf8')));
    });

    // The page's Lighthouse HTML report, straight from its Playhouse archive.
    // audit-result.json scrubs archive paths, so resolve them from the
    // run's prepared.json. The report is a script-rendered page from the
    // audited run, so it is served under a CSP sandbox (opaque origin): it can
    // run its own JS but can't reach the dashboard or its API.
    app.get('/api/pages/:label/report', async (context) => {
        const run = await requestedRun(context);
        if (!run) return context.json({ error: 'No such run.' }, 404);
        if ((await statusOf(run)) !== 'complete') return context.json({ error: 'Audit is not complete.' }, 409);
        const archiveDir = await preparedArchiveDir(run.dir, context.req.param('label'));
        const report = archiveDir && path.join(archiveDir, LIGHTHOUSE_REPORT);
        if (!report || !(await fileExists(report)))
            return context.json({ error: 'No Lighthouse report for this page.' }, 404);
        context.header('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');
        return context.html(await readFile(report, 'utf8'));
    });

    // The build's rollup-plugin-visualizer report, copied into the run by prepare. Script-rendered like the
    // Lighthouse report, so it gets the same sandbox.
    app.get('/api/bundle/visualizer', async (context) => {
        const run = await requestedRun(context);
        if (!run) return context.json({ error: 'No such run.' }, 404);
        if ((await statusOf(run)) !== 'complete') return context.json({ error: 'Audit is not complete.' }, 409);
        const report = path.join(run.dir, BUNDLE_VISUALIZER);
        if (!(await fileExists(report)))
            return context.json({ error: 'This run has no bundle visualizer report.' }, 404);
        context.header('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');
        return context.html(await readFile(report, 'utf8'));
    });

    // Static assets, then SPA fallback to index.html for client-side routing.
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), uiDir) || '.' }));
    app.get('/*', serveStatic({ path: path.relative(process.cwd(), path.join(uiDir, 'index.html')) }));

    return app;
}

export async function startServer(options: ServeOptions): Promise<{ url: string; close: () => void }> {
    const app = createApp(options);
    const port = options.port ?? 8787;
    const host = options.host ?? 'localhost';
    // Report the URL only once the server is listening, and a busy port as a usable error instead of a crash.
    const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
        const listening = serve({ fetch: app.fetch, port, hostname: host }, () => {
            listening.off('error', fail);
            resolve(listening);
        });
        function fail(error: NodeJS.ErrnoException) {
            reject(
                error.code === 'EADDRINUSE'
                    ? new Error(`Port ${port} is in use; pass --port <n> to use another one`)
                    : error
            );
        }
        listening.once('error', fail);
    });
    return { url: `http://${host}:${port}`, close: () => server.close() };
}
