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
import { access, appendFile, cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { describe, it, expect } from 'vitest';
import { createApp } from './server';

const ARCHIVE = path.join(import.meta.dirname, '__fixtures__', 'playhouse-archive');

/** A finished run folder: prepared.json maps page labels to archives; audit-result.json sits beside it. */
async function finishedRun(dir: string, result: unknown = {}): Promise<string> {
    await mkdir(dir, { recursive: true });
    await cp(ARCHIVE, path.join(dir, 'playhouse', 'home'), { recursive: true });
    await writeFile(
        path.join(dir, 'prepared.json'),
        JSON.stringify({ pages: [{ label: 'home', url: 'https://example.com/', archiveDir: 'playhouse/home' }] })
    );
    await writeFile(path.join(dir, 'audit-result.json'), JSON.stringify(result));
    return dir;
}

const tempDir = () => mkdtemp(path.join(os.tmpdir(), 'sfnext-server-'));

async function workspace(): Promise<Hono> {
    const dir = await finishedRun(await tempDir());
    return createApp({ input: path.join(dir, 'audit-result.json') });
}

const OLDER = '2026-10-01T09-00-00Z';
const LATEST = '2026-10-02T09-00-00Z';
/** A workspace with a finished older run and a latest run that is still collecting. */
async function workspaceWithRuns(): Promise<{ dir: string; app: Hono }> {
    const dir = await tempDir();
    await finishedRun(path.join(dir, 'runs', OLDER), { run: { id: OLDER } });
    await mkdir(path.join(dir, 'runs', LATEST), { recursive: true });
    await writeFile(
        path.join(dir, 'runs', LATEST, 'events.ndjson'),
        `${JSON.stringify({ type: 'run.start', runId: LATEST, startedAt: '2026-10-02T09:00:00.000Z', plan: [], at: '2026-10-02T09:00:00.000Z' })}\n`
    );
    return { dir, app: createApp({ workspace: dir }) };
}

const AT = '2026-10-02T09:00:00.000Z';
const line = (event: Record<string, unknown>) => `${JSON.stringify({ ...event, at: AT })}\n`;

/** Reads /api/events until `done(text)` holds or the stream ends; `ended` tells which. */
async function readStream(app: Hono, done: (text: string) => boolean): Promise<{ text: string; ended: boolean }> {
    const controller = new AbortController();
    const response = await app.request('/api/events', { signal: controller.signal });
    if (!response.body) throw new Error('No event stream body');
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        for (;;) {
            const { value, done: ended } = await reader.read();
            if (ended) return { text, ended: true };
            text += value;
            if (done(text)) return { text, ended: false };
        }
    } finally {
        clearTimeout(timeout);
        controller.abort();
    }
}
const types = (text: string) =>
    [...text.matchAll(/^data: (\{.*\})$/gm)].map((match) => (JSON.parse(match[1] ?? '{}') as { type: string }).type);

describe('audit server', () => {
    it('lists runs newest first and serves an older run by id', async () => {
        const { app } = await workspaceWithRuns();
        expect(await (await app.request('/api/runs')).json()).toEqual([
            { id: LATEST, complete: false },
            { id: OLDER, complete: true },
        ]);
        expect(await (await app.request('/api/status')).json()).toEqual({
            status: 'running',
            phase: 'running',
            runId: LATEST,
        });
        // The latest run is still in progress.
        expect((await app.request('/api/audit')).status).toBe(409);
        expect(await (await app.request(`/api/audit?run=${OLDER}`)).json()).toEqual({ run: { id: OLDER } });
        expect((await app.request(`/api/pages/home/report?run=${OLDER}`)).status).toBe(200);
        for (const id of ['2026-10-03T09-00-00Z', '..', 'runs'])
            expect((await app.request(`/api/audit?run=${id}`)).status, id).toBe(404);
    });

    it('deletes an older run folder but never the latest run', async () => {
        const { dir, app } = await workspaceWithRuns();
        expect((await app.request(`/api/runs/${LATEST}`, { method: 'DELETE' })).status).toBe(409);
        expect((await app.request('/api/runs/..', { method: 'DELETE' })).status).toBe(404);
        expect((await app.request(`/api/runs/${OLDER}`, { method: 'DELETE' })).status).toBe(204);
        await expect(access(path.join(dir, 'runs', OLDER))).rejects.toThrow(/ENOENT/);
        await access(path.join(dir, 'runs', LATEST));
        expect(await (await app.request('/api/runs')).json()).toEqual([{ id: LATEST, complete: false }]);
    });

    it('serves the page Lighthouse report from its archive under a CSP sandbox', async () => {
        const response = await (await workspace()).request('/api/pages/home/report');
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toMatch(/^text\/html/);
        expect(response.headers.get('content-security-policy')).toBe(
            'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox'
        );
        expect(await response.text()).toMatch(/Fixture report/);
    });

    it('404s for unknown pages; traversal never reaches an archive', async () => {
        const app = await workspace();
        for (const label of ['plp', '..%2F..%2Fetc', '..%2Fhome'])
            expect((await app.request(`/api/pages/${label}/report`)).status, label).toBe(404);
        // Dot segments are normalized out of the URL before routing, so they never reach the report route.
        for (const label of ['..', '%2E%2E'])
            expect(await (await app.request(`/api/pages/${label}/report`)).text(), label).not.toMatch(/Fixture report/);
    });

    it('404s when the result has no prepared.json beside it', async () => {
        const dir = await tempDir();
        await writeFile(path.join(dir, 'audit-result.json'), '{}');
        const app = createApp({ input: path.join(dir, 'audit-result.json') });
        expect((await app.request('/api/pages/home/report')).status).toBe(404);
    });

    it('404s when prepared.json is malformed', async () => {
        const dir = await tempDir();
        await writeFile(path.join(dir, 'audit-result.json'), '{}');
        const app = createApp({ input: path.join(dir, 'audit-result.json') });
        for (const contents of ['{ not json', JSON.stringify({ pages: [{ label: 'home' }] })]) {
            await writeFile(path.join(dir, 'prepared.json'), contents);
            expect((await app.request('/api/pages/home/report')).status, contents).toBe(404);
        }
    });

    it('409s for the report until the audit is complete', async () => {
        const dir = await tempDir();
        const app = createApp({ input: path.join(dir, 'audit-result.json') });
        expect((await app.request('/api/pages/home/report')).status).toBe(409);
    });

    it('the event stream goes on after a failed finalize and ends once the run completes', async () => {
        const { dir, app } = await workspaceWithRuns();
        const events = path.join(dir, 'runs', LATEST, 'events.ndjson');
        await appendFile(events, line({ type: 'run.error', message: 'finalize failed', stageId: 'analyze' }));
        // The failed finalize doesn't end the stream: it waits for the fixed one.
        const failed = await readStream(app, (text) => types(text).includes('run.error'));
        expect(failed.ended).toBe(false);
        expect(failed.text).not.toMatch(/^event: end$/m);

        // A second failure, then the fixed finalize, reach a tab that is still connected.
        const pending = readStream(app, () => false);
        await appendFile(events, line({ type: 'run.error', message: 'failed again', stageId: 'analyze' }));
        await appendFile(
            events,
            line({ type: 'stage.complete', stageId: 'analyze' }) + line({ type: 'run.complete', scores: [] })
        );
        const { text, ended } = await pending;
        expect(ended).toBe(true);
        expect(types(text)).toEqual(['run.start', 'run.error', 'run.error', 'stage.complete', 'run.complete']);
        expect(text).toMatch(/^event: end$/m);
    });

    it('the event stream ends when prepare fails', async () => {
        const { dir, app } = await workspaceWithRuns();
        await appendFile(
            path.join(dir, 'runs', LATEST, 'events.ndjson'),
            line({ type: 'run.error', message: 'prepare failed' })
        );
        const { text, ended } = await readStream(app, () => false);
        expect(ended).toBe(true);
        expect(types(text)).toEqual(['run.start', 'run.error']);
        expect(text).toMatch(/^event: end$/m);
    });
});
