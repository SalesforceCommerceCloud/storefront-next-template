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
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { AUDIT_ROOT, VERSION } from './assets';
import { finalize, prepare } from './audit';

const FIXTURE_ARCHIVE = path.join(import.meta.dirname, '__fixtures__', 'playhouse-archive');
const RUN_ID = '2026-09-16T00-00-00Z';
const temp = (prefix: string) => mkdtemp(path.join(os.tmpdir(), prefix));

async function project(): Promise<string> {
    const root = await temp('sfnext-audit-unit-project-');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'store' }));
    return root;
}

const rule = (ruleId: string) => ({
    ruleId,
    title: ruleId,
    file: `${ruleId.split('/')[1]}.md`,
    output: `ai-analysis/categories/${ruleId}.json`,
});

/** A workspace with one run, one page and the given AI rules; `files` are written into the run. */
async function workspaceWith(rules: string[], files: Record<string, unknown>): Promise<string> {
    const workspace = await temp('sfnext-audit-unit-');
    const run = path.join(workspace, 'runs', RUN_ID);
    await cp(FIXTURE_ARCHIVE, path.join(run, 'playhouse', 'archive'), { recursive: true });
    const prepared = {
        schemaVersion: '1.0',
        run: { id: RUN_ID, generatedAt: '2026-09-16T00:00:00.000Z', toolVersion: VERSION, playhouseVersion: '1.0.0' },
        project: { root: '/tmp/store', packageName: 'store' },
        pages: [{ label: 'home', url: 'https://example.com/', archiveDir: 'playhouse/archive' }],
        pageFailures: [],
        expectedPages: ['home'],
        coverage: [],
        rules: rules.map(rule),
        decidedFindings: [],
    };
    await writeFile(path.join(run, 'prepared.json'), JSON.stringify(prepared));
    for (const [file, value] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(run, file)), { recursive: true });
        await writeFile(path.join(run, file), typeof value === 'string' ? value : JSON.stringify(value));
    }
    return workspace;
}

describe('audit assets', () => {
    it('reports the package version and resolves the source audit folder', () => {
        expect(VERSION).toBe(pkg.version);
        expect(AUDIT_ROOT).toBe(path.resolve(import.meta.dirname));
    });
});

describe('prepare', () => {
    it.each([
        [{ urls: ['https://shop.test/'] }, '--url must use label=https://…'],
        [{ urls: ['home=ftp://shop.test/'] }, 'URL must use http(s)'],
        [{ urls: ['home=https://user:pw@shop.test/'] }, 'URL credentials are not allowed'],
        [{ urls: ['home=http://shop.test/'] }, 'HTTP requires explicit --allow-http'],
        [{ urls: ['Home=https://shop.test/'] }, 'Invalid page label: Home'],
        [{ urls: ['home=https://shop.test/', 'home=https://shop.test/a'] }, 'Duplicate page label: home'],
        [{ archives: ['home=relative/archive'] }, '--archive must use label=/absolute/archive'],
        [{ archives: ['home=/abs/archive'] }, '--archive home requires a matching --url home=https://…'],
    ])('rejects %j', async (options, message) => {
        const root = await project();
        await expect(
            prepare({ project: root, workspace: path.join(root, 'out'), build: false, ...options })
        ).rejects.toThrow(message);
    });

    it('writes prepared.json pointing at the evaluate-rule instructions', async () => {
        const root = await project();
        const preparedPath = await prepare({
            project: root,
            workspace: path.join(root, 'out'),
            build: false,
            expectedPages: [],
            allowHttp: true,
        });
        const prepared = JSON.parse(await readFile(preparedPath, 'utf8')) as { instructions: string };
        expect(path.basename(prepared.instructions)).toBe('evaluate-rule.md');
        expect(existsSync(prepared.instructions)).toBe(true);
        const analysis = JSON.parse(
            await readFile(path.join(path.dirname(preparedPath), 'bundle', 'analysis.json'), 'utf8')
        ) as { status: string };
        expect(analysis.status).toBeTypeOf('string');
    });
});

describe('finalize', () => {
    const pass = (ruleId: string, extra: Record<string, unknown> = {}) => ({
        ruleId,
        disposition: 'pass',
        summary: 'checked',
        evidence: [{ type: 'playhouse', page: 'home', artifact: 'summary.json' }],
        ...extra,
    });

    it.each([
        [
            'a file outside the rules folders',
            [],
            { 'ai-analysis/categories/seo/notes.json': {} },
            /seo\/notes\.json: unexpected file/,
        ],
        [
            'a rule that is not in the catalog',
            [],
            { 'ai-analysis/categories/seo/rules/nope.json': pass('seo/nope') },
            /seo\/nope is not a rule in prepared\.json/,
        ],
        [
            'recommendations without a bundle analysis',
            ['performance/reduce-javascript-on-load'],
            {
                'ai-analysis/categories/performance/rules/reduce-javascript-on-load.json': pass(
                    'performance/reduce-javascript-on-load',
                    {
                        recommendations: [
                            {
                                pages: ['home'],
                                title: 'Load the map later',
                                change: 'remove',
                                target: 'map',
                                how: 'Remove it.',
                                files: [{ file: 'src/map.tsx' }],
                            },
                        ],
                    }
                ),
            },
            /recommendations need the run's bundle\/analysis\.json/,
        ],
        ['an invalid bundle analysis', [], { 'bundle/analysis.json': { status: 'nope' } }, /^bundle\/analysis\.json:/],
        [
            'summary evidence for an unknown artifact',
            [],
            {
                'ai-analysis/summary.json': {
                    narrative: 'x',
                    observations: [
                        {
                            title: 'x',
                            summary: 'x',
                            evidence: [{ type: 'playhouse', page: 'home', artifact: 'nope.json' }],
                        },
                    ],
                },
            },
            /ai-analysis\/summary\.json:/,
        ],
        ['a prepared rule missing from the catalog', ['seo/gone'], {}, /not in the catalog: seo\/gone/],
    ])('rejects %s', async (_name, rules, files, pattern) => {
        const workspace = await workspaceWith(rules, files);
        await expect(finalize({ workspace })).rejects.toThrow(pattern);
    });
});
