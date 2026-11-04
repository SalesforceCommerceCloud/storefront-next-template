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
import Finalize from './finalize';
import { finalize } from '../../audit/audit';

vi.mock('../../audit/audit', () => ({
    finalize: vi.fn(() => Promise.resolve('/project/.site-audit/runs/2026-09-16T00-00-00Z/audit-result.json')),
}));

/** Stands in for the command's `log`. */
const log = vi.fn();

function command(flags: Record<string, unknown>): Finalize {
    const cmd = new Finalize([], {} as never);
    vi.spyOn(cmd as any, 'parse').mockResolvedValue({ flags, args: {}, argv: [], raw: [], metadata: {} });
    vi.spyOn(cmd, 'log').mockImplementation(log);
    return cmd;
}

describe('audit finalize command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('defaults the workspace to .site-audit in the project directory', async () => {
        const cmd = command({ 'project-directory': '/project' });

        await cmd.run();

        expect(finalize).toHaveBeenCalledWith({
            workspace: path.resolve(path.join('/project', '.site-audit')),
            categories: undefined,
            events: undefined,
        });
        expect(log).toHaveBeenCalledWith('/project/.site-audit/runs/2026-09-16T00-00-00Z/audit-result.json');
    });

    it('passes --workspace, --categories and --events through', async () => {
        const cmd = command({
            'project-directory': '/project',
            workspace: 'relative/workspace',
            categories: '/categories',
            events: '/events.ndjson',
        });

        await cmd.run();

        expect(finalize).toHaveBeenCalledWith({
            workspace: path.resolve('relative/workspace'),
            categories: '/categories',
            events: '/events.ndjson',
        });
    });

    it('is hidden', () => {
        expect(Finalize.hidden).toBe(true);
    });
});
