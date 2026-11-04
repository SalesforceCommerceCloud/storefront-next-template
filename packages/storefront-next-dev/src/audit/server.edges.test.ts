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
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLE_VISUALIZER } from './bundle/schema';
import { createApp, startServer } from './server';

const RUN = '2026-10-02T09-00-00Z';
const AT = '2026-10-02T09:00:00.000Z';
const runStart = `${JSON.stringify({ type: 'run.start', runId: RUN, startedAt: AT, plan: [], at: AT })}\n`;
const runComplete = `${JSON.stringify({ type: 'run.complete', at: AT })}\n`;

/** A workspace with one run folder holding `files`. */
async function workspace(files: Record<string, string>): Promise<{ dir: string; run: string }> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sfnext-server-edges-'));
    const run = path.join(dir, 'runs', RUN);
    await mkdir(run, { recursive: true });
    for (const [name, text] of Object.entries(files)) await writeFile(path.join(run, name), text);
    return { dir, run };
}

const status = async (app: ReturnType<typeof createApp>, query = '') =>
    (await app.request(`/api/status${query}`)).json();

describe('audit server edges', () => {
    it('derives run status from the event log and the result file', async () => {
        const preparing = await workspace({});
        expect(await status(createApp({ workspace: preparing.dir }))).toEqual({
            status: 'preparing',
            phase: 'preparing',
            runId: RUN,
        });
        const lone = await workspace({ 'audit-result.json': '{}' });
        expect((await status(createApp({ workspace: lone.dir }))).status).toBe('complete');
        // run.complete without a readable result still reports running.
        const unfinished = await workspace({ 'events.ndjson': runStart + runComplete });
        expect((await status(createApp({ workspace: unfinished.dir }))).status).toBe('running');
        expect(await status(createApp({ workspace: unfinished.dir }), '?run=2026-01-01T00-00-00Z')).toEqual({
            status: 'preparing',
            phase: 'preparing',
        });
        const empty = await mkdtemp(path.join(os.tmpdir(), 'sfnext-server-empty-'));
        expect((await status(createApp({ workspace: empty }))).runId).toBeUndefined();
    });

    it('serves a lone result only for the latest run, and has no run history', async () => {
        const { run } = await workspace({ 'audit-result.json': JSON.stringify({ ok: true }) });
        const app = createApp({ input: path.join(run, 'audit-result.json') });
        expect(await (await app.request('/api/audit')).json()).toEqual({ ok: true });
        expect((await app.request(`/api/audit?run=${RUN}`)).status).toBe(404);
        expect(await (await app.request('/api/runs')).json()).toEqual([]);
        expect((await app.request(`/api/runs/${RUN}`, { method: 'DELETE' })).status).toBe(404);
        expect((await app.request('/api/events')).status).toBe(409);
        const nothing = createApp({});
        expect((await nothing.request('/api/audit')).status).toBe(404);
        expect((await nothing.request('/api/pages/home/report')).status).toBe(404);
        expect((await nothing.request('/api/bundle/visualizer')).status).toBe(404);
    });

    it('rejects deleting a run id that is malformed or absent', async () => {
        const { dir } = await workspace({});
        const app = createApp({ workspace: dir });
        expect((await app.request('/api/runs/not-a-run', { method: 'DELETE' })).status).toBe(404);
        expect((await app.request('/api/runs/2026-01-01T00-00-00Z', { method: 'DELETE' })).status).toBe(404);
    });

    it('409s for an incomplete audit', async () => {
        const { dir } = await workspace({ 'events.ndjson': runStart });
        const app = createApp({ workspace: dir });
        expect((await app.request('/api/audit')).status).toBe(409);
        expect((await app.request('/api/bundle/visualizer')).status).toBe(409);
    });

    it('serves the bundle visualizer report under a CSP sandbox', async () => {
        const { dir, run } = await workspace({ 'audit-result.json': '{}' });
        const app = createApp({ workspace: dir });
        expect((await app.request('/api/bundle/visualizer')).status).toBe(404);
        expect((await app.request('/api/pages/home/report')).status).toBe(404);
        await mkdir(path.dirname(path.join(run, BUNDLE_VISUALIZER)), { recursive: true });
        await writeFile(path.join(run, BUNDLE_VISUALIZER), '<p>treemap</p>');
        const response = await app.request('/api/bundle/visualizer');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts/);
        expect(await response.text()).toBe('<p>treemap</p>');
    });

    it('serves UI assets with an index.html fallback', async () => {
        const uiDir = await mkdtemp(path.join(os.tmpdir(), 'sfnext-server-ui-'));
        await writeFile(path.join(uiDir, 'index.html'), '<div id="root"></div>');
        await writeFile(path.join(uiDir, 'app.js'), 'run()');
        const app = createApp({ uiDir });
        expect(await (await app.request('/app.js')).text()).toBe('run()');
        expect(await (await app.request('/runs/latest')).text()).toBe('<div id="root"></div>');
    });

    it('starts on a free port and reports a busy one', async () => {
        const blocker = createServer();
        const port = await new Promise<number>((resolve) =>
            blocker.listen(0, '127.0.0.1', () => resolve((blocker.address() as { port: number }).port))
        );
        try {
            await expect(startServer({ port, host: '127.0.0.1' })).rejects.toThrow(
                `Port ${port} is in use; pass --port <n> to use another one`
            );
        } finally {
            blocker.close();
        }
        const { run } = await workspace({ 'audit-result.json': '{"ok":1}' });
        const server = await startServer({ port: 0, host: '127.0.0.1', input: path.join(run, 'audit-result.json') });
        try {
            expect(server.url).toBe('http://127.0.0.1:0');
        } finally {
            server.close();
        }
    });
});
