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
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import Progress from './progress';
import { appendEvent } from '../../audit/events';
import { latestRunDir } from '../../audit/runs';

vi.mock('node:fs/promises', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:fs/promises')>()),
    mkdir: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../../audit/events', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../audit/events')>()),
    appendEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../audit/runs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../audit/runs')>()),
    latestRunDir: vi.fn((workspace: string) => Promise.resolve(path.join(workspace, 'runs', '2026-09-16T00-00-00Z'))),
}));

const LOG = { type: 'log', level: 'info', message: 'Checking SEO rules' };

function command(flags: Record<string, unknown>): Progress {
    const cmd = new Progress([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({ flags, args: {}, argv: [], raw: [], metadata: {} });
    return cmd;
}

describe('audit progress command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('appends to the latest run of .site-audit in the project directory by default', async () => {
        await command({ 'project-directory': '/project', event: JSON.stringify(LOG) }).run();

        const workspace = path.resolve(path.join('/project', '.site-audit'));
        const eventsFile = path.join(workspace, 'runs', '2026-09-16T00-00-00Z', 'events.ndjson');
        expect(latestRunDir).toHaveBeenCalledWith(workspace);
        expect(mkdir).toHaveBeenCalledWith(path.dirname(eventsFile), { recursive: true });
        expect(appendEvent).toHaveBeenCalledWith(eventsFile, expect.objectContaining(LOG));
    });

    it('uses --workspace for the latest run', async () => {
        await command({ 'project-directory': '/project', workspace: '/ws', event: JSON.stringify(LOG) }).run();

        expect(latestRunDir).toHaveBeenCalledWith(path.resolve('/ws'));
    });

    it('appends to --events, resolved, without looking up a run', async () => {
        await command({
            'project-directory': '/project',
            events: 'shared/events.ndjson',
            event: JSON.stringify(LOG),
        }).run();

        expect(latestRunDir).not.toHaveBeenCalled();
        expect(appendEvent).toHaveBeenCalledWith(path.resolve('shared/events.ndjson'), expect.objectContaining(LOG));
    });

    it('rejects an event that is not JSON', async () => {
        await expect(command({ 'project-directory': '/project', event: 'nope' }).run()).rejects.toThrow(
            '--event must be a JSON object'
        );
        expect(appendEvent).not.toHaveBeenCalled();
    });

    it('rejects the run events that only prepare and finalize write', async () => {
        for (const type of ['run.start', 'run.error', 'run.complete'])
            await expect(
                command({ 'project-directory': '/project', event: JSON.stringify({ type }) }).run(),
                type
            ).rejects.toThrow(`--event cannot be ${type}`);
        expect(appendEvent).not.toHaveBeenCalled();
    });

    it('rejects an invalid event before creating the events folder', async () => {
        await expect(
            command({ 'project-directory': '/project', events: '/x/events.ndjson', event: '{"type":"bogus"}' }).run()
        ).rejects.toThrow();
        expect(mkdir).not.toHaveBeenCalled();
        expect(appendEvent).not.toHaveBeenCalled();
    });

    it('is hidden', () => {
        expect(Progress.hidden).toBe(true);
    });
});
