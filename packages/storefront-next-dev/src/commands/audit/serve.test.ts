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
import { spawn } from 'node:child_process';
import Serve from './serve';
import { startServer } from '../../audit/server';

vi.mock('../../audit/server', () => ({
    startServer: vi.fn(() => Promise.resolve({ url: 'http://localhost:8787', close: () => {} })),
}));
vi.mock('node:child_process', () => ({
    spawn: vi.fn(() => ({ unref: () => {} })),
}));

/** Stands in for the command's `log`. */
const log = vi.fn();

function command(flags: Record<string, unknown>): Serve {
    const cmd = new Serve([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({ flags, args: {}, argv: [], raw: [], metadata: {} });
    vi.spyOn(cmd, 'log').mockImplementation(log);
    return cmd;
}

describe('audit serve command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('serves .site-audit in the project directory by default and opens the browser', async () => {
        const cmd = command({ 'project-directory': '/project', port: 8787, open: true });

        await cmd.run();

        expect(startServer).toHaveBeenCalledWith({
            workspace: path.resolve(path.join('/project', '.site-audit')),
            uiDir: undefined,
            port: 8787,
        });
        expect(log).toHaveBeenCalledWith('Site audit dashboard: http://localhost:8787');
        expect(spawn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(['http://localhost:8787']);
    });

    it('serves a lone --input file, resolved, with --ui and --port, and --no-open skips the browser', async () => {
        const cmd = command({
            'project-directory': '/project',
            input: 'results/audit-result.json',
            ui: 'built-ui',
            port: 9000,
            open: false,
        });

        await cmd.run();

        expect(startServer).toHaveBeenCalledWith({
            input: path.resolve('results/audit-result.json'),
            uiDir: path.resolve('built-ui'),
            port: 9000,
        });
        expect(spawn).not.toHaveBeenCalled();
    });

    it('serves an explicit --workspace', async () => {
        const cmd = command({ 'project-directory': '/project', workspace: '/ws', port: 8787, open: false });

        await cmd.run();

        expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ workspace: path.resolve('/ws') }));
    });

    it('makes --workspace and --input exclusive', () => {
        expect(Serve.flags.workspace.exclusive).toEqual(['input']);
        expect(Serve.flags.input.exclusive).toEqual(['workspace']);
        expect(Serve.hidden).toBe(true);
    });
});
