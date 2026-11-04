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
import { access, appendFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import Progress from '../commands/audit/progress';
import { appendEvent, deriveStatus, endsRun, readEvents, type StoredProgressEvent } from './events';

// A bare config: the verb needs none, and loading the package's would scan every command.
const progress = (args: string[]) =>
    new Progress(args, { runHook: () => Promise.resolve({ successes: [], failures: [] }) } as never).run();

/** A workspace with an older and a latest run. */
async function workspaceWithRuns() {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'sfnext-progress-'));
    for (const id of ['2026-10-01T09-00-00Z', '2026-10-02T09-00-00Z'])
        await mkdir(path.join(workspace, 'runs', id), { recursive: true });
    return { workspace, latest: path.join(workspace, 'runs', '2026-10-02T09-00-00Z') };
}

describe('the progress verb', () => {
    it('appends a validated, stamped event to the latest run log', async () => {
        const { workspace, latest } = await workspaceWithRuns();
        await progress([
            '--workspace',
            workspace,
            '--event',
            JSON.stringify({ type: 'log', level: 'info', message: 'hello' }),
        ]);
        expect(await readEvents(path.join(workspace, 'runs', '2026-10-01T09-00-00Z', 'events.ndjson'))).toEqual([]);
        const events = await readEvents(path.join(latest, 'events.ndjson'));
        expect(events.length).toBe(1);
        expect(events[0]?.type).toBe('log');
        expect(events[0]).toMatchObject({ message: 'hello' });
        expect(events[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('rejects a malformed event and writes nothing', async () => {
        const { workspace, latest } = await workspaceWithRuns();
        await expect(
            progress(['--workspace', workspace, '--event', JSON.stringify({ type: 'nonsense' })])
        ).rejects.toThrow();
        expect(await readEvents(path.join(latest, 'events.ndjson'))).toEqual([]);
    });

    it('rejects run events, which only prepare and finalize write', async () => {
        const { workspace, latest } = await workspaceWithRuns();
        for (const event of [
            { type: 'run.error', message: 'agent: analysis failed' },
            { type: 'run.complete' },
            { type: 'run.start', runId: 'x', startedAt: '2026-10-02T09:00:00Z' },
        ])
            await expect(progress(['--workspace', workspace, '--event', JSON.stringify(event)])).rejects.toThrow(
                new RegExp(`cannot be ${event.type.replace('.', '\\.')}`)
            );
        expect(await readEvents(path.join(latest, 'events.ndjson'))).toEqual([]);
    });

    it('does not create the --events folder for a rejected event', async () => {
        const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'sfnext-progress-')), 'new');
        for (const event of [{ type: 'run.complete' }, { type: 'nonsense' }])
            await expect(
                progress(['--events', path.join(dir, 'events.ndjson'), '--event', JSON.stringify(event)])
            ).rejects.toThrow();
        await expect(access(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('fails before the workspace has a run', async () => {
        const workspace = await mkdtemp(path.join(os.tmpdir(), 'sfnext-progress-'));
        await expect(
            progress([
                '--workspace',
                workspace,
                '--event',
                JSON.stringify({ type: 'log', level: 'info', message: 'hello' }),
            ])
        ).rejects.toThrow(/no audit runs/);
    });
});

describe('the event log', () => {
    it('sanitizes secrets and URLs in event text', async () => {
        const workspace = await mkdtemp(path.join(os.tmpdir(), 'sfnext-progress-'));
        const file = path.join(workspace, 'events.ndjson');
        await appendEvent(file, {
            type: 'finding',
            id: 'x',
            severity: 'critical',
            title: 'token=supersecret at https://site.example/?api_key=leak',
            category: 'security',
            source: '/Users/alice/private/app.ts',
        });
        const raw = await readFile(file, 'utf8');
        expect(raw).not.toMatch(/supersecret/);
        expect(raw).not.toMatch(/leak/);
        expect(raw).not.toMatch(/\/Users\/alice\/private/);
        expect(raw).toMatch(/\[REDACTED/);
    });

    it('skips a partially written trailing line', async () => {
        const workspace = await mkdtemp(path.join(os.tmpdir(), 'sfnext-progress-'));
        const file = path.join(workspace, 'events.ndjson');
        await appendEvent(file, { type: 'stage.start', stageId: 'home' });
        await appendFile(file, '{"type":"log","level":"info","mess'); // torn write, no newline
        const events = await readEvents(file);
        expect(events.length).toBe(1);
        expect(events[0]?.type).toBe('stage.start');
    });
});

describe('deriveStatus', () => {
    it('tracks preparing → running → complete', async () => {
        expect(deriveStatus([])).toBe('preparing');
        const running = await readEvents(path.join(import.meta.dirname, '__fixtures__', 'progress', 'events.ndjson'));
        expect(deriveStatus(running)).toBe('running');
        expect(deriveStatus([...running, { type: 'run.complete', scores: [], at: '2026-09-27T16:31:00.000Z' }])).toBe(
            'complete'
        );
    });

    it('resumes a failed finalize when it is run again, but not a failed prepare', () => {
        const at = '2026-09-27T16:31:00.000Z';
        const start = (runId: string): StoredProgressEvent => ({
            type: 'run.start',
            runId,
            startedAt: at,
            plan: [],
            at,
        });
        const finalizeError: StoredProgressEvent = {
            type: 'run.error',
            message: 'finalize failed',
            stageId: 'analyze',
            at,
        };
        const failed: StoredProgressEvent[] = [
            start('a'),
            { type: 'stage.start', stageId: 'analyze', at },
            finalizeError,
        ];
        expect(deriveStatus(failed)).toBe('error');
        // The stream stays open for the fixed finalize.
        expect(endsRun(finalizeError)).toBe(false);
        // finalize was fixed and run again.
        const resumed: StoredProgressEvent[] = [...failed, { type: 'stage.complete', stageId: 'analyze', at }];
        expect(deriveStatus(resumed)).toBe('running');
        const complete: StoredProgressEvent = { type: 'run.complete', scores: [], at };
        expect(deriveStatus([...resumed, complete])).toBe('complete');
        expect(endsRun(complete)).toBe(true);

        // prepare failed: progress the agent reports afterwards doesn't bring the run back.
        const prepareError: StoredProgressEvent = { type: 'run.error', message: 'prepare failed', at };
        expect(endsRun(prepareError)).toBe(true);
        expect(
            deriveStatus([start('a'), prepareError, { type: 'log', level: 'info', message: 'still here', at }])
        ).toBe('error');

        // A log shared with --events: only the latest run counts.
        expect(deriveStatus([start('a'), complete, start('b')])).toBe('running');
        expect(deriveStatus([start('a'), prepareError, start('b'), { type: 'stage.start', stageId: 'home', at }])).toBe(
            'running'
        );
    });
});
