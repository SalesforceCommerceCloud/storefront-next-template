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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Prepare from './prepare';
import { prepare } from '../../audit/audit';
import { preparedAttributes } from '../../audit/telemetry';

vi.mock('../../audit/audit', () => ({
    prepare: vi.fn(() => Promise.resolve('/project/.site-audit/runs/2026-09-16T00-00-00Z/prepared.json')),
}));

vi.mock('../../audit/telemetry', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../audit/telemetry')>()),
    preparedAttributes: vi.fn(() => Promise.resolve({ pagesCollected: 3 })),
}));

function command(flags: Record<string, unknown>): Prepare {
    const cmd = new Prepare([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({ flags, args: {}, argv: [], raw: [], metadata: {} });
    return cmd;
}

describe('audit prepare command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('maps every flag to its prepare option and prints the prepared.json path', async () => {
        const cmd = command({
            'project-directory': '/project',
            url: ['home=https://example.com/', 'plp=https://example.com/shoes'],
            archive: ['home=/archives/home'],
            'expected-page': ['home', 'plp'],
            workspace: '/elsewhere',
            runs: 3,
            'allow-http': true,
            categories: '/categories',
            events: '/events.ndjson',
            build: false,
        });
        const log = vi.spyOn(cmd, 'log').mockImplementation(() => {});

        await cmd.run();

        expect(prepare).toHaveBeenCalledWith({
            urls: ['home=https://example.com/', 'plp=https://example.com/shoes'],
            archives: ['home=/archives/home'],
            expectedPages: ['home', 'plp'],
            project: '/project',
            workspace: '/elsewhere',
            runs: 3,
            allowHttp: true,
            categories: '/categories',
            events: '/events.ndjson',
            build: false,
        });
        expect(log).toHaveBeenCalledWith('/project/.site-audit/runs/2026-09-16T00-00-00Z/prepared.json');
    });

    it('leaves the workspace to prepare, which defaults it from the project directory', async () => {
        const cmd = command({
            'project-directory': '/project',
            url: ['home=https://example.com/'],
            runs: 1,
            build: true,
        });
        vi.spyOn(cmd, 'log').mockImplementation(() => {});

        await cmd.run();

        expect(prepare).toHaveBeenCalledWith(
            expect.objectContaining({ project: '/project', workspace: undefined, runs: 1, build: true })
        );
    });

    it('tracks AUDIT_PREPARED before printing the prepared.json path', async () => {
        const cmd = command({
            'project-directory': '/project',
            url: ['home=https://example.com/'],
            runs: 1,
            build: true,
        });
        const log = vi.spyOn(cmd, 'log').mockImplementation(() => {});
        const track = vi.spyOn(cmd as any, 'track').mockResolvedValue(undefined);

        await cmd.run();

        expect(track).toHaveBeenCalledWith('AUDIT_PREPARED', expect.any(Function));
        expect(track.mock.invocationCallOrder[0]).toBeLessThan(log.mock.invocationCallOrder[0]);

        // The attributes come from the prepared.json that prepare wrote, with the run's own options.
        await expect((track.mock.calls[0][1] as () => Promise<unknown>)()).resolves.toEqual({ pagesCollected: 3 });
        expect(preparedAttributes).toHaveBeenCalledWith(
            '/project/.site-audit/runs/2026-09-16T00-00-00Z/prepared.json',
            { runs: 1, build: true }
        );
    });

    it('is hidden', () => {
        expect(Prepare.hidden).toBe(true);
    });
});
