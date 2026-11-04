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
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AuditCatalog } from './catalog';
import { prepareRuleResults, readPreparedRuleResults, resultPathForRule } from './preparation';

const RULE = {
    id: 'perf/a',
    title: 'A',
    severity: 'low' as const,
    appliesTo: [],
    inputs: ['summary.json'],
    file: 'a.md',
    instructions: '',
};
const catalog: AuditCatalog = {
    categories: [{ id: 'perf', title: 'Perf', file: 'CATEGORY.md', guidance: '', rules: [RULE] }],
    ruleIds: ['perf/a'],
};
/** A companion module that needs no imports: a pass-through `dataSchema` and a result echoing what it was given. */
const COMPANION = `const parse = (value) => value;
export const dataSchema = { parse, safeParse: (value) => ({ success: true, data: value }) };
export default ({ rule, pages, bundle }) => ({ data: { rule: rule.id, pages: pages.length, bundle: bundle ?? null } });`;

async function companions(files: Record<string, string>): Promise<{ root: string; workspaceRoot: string }> {
    const base = await mkdtemp(path.join(os.tmpdir(), 'sfnext-companions-'));
    const root = path.join(base, 'categories');
    const workspaceRoot = path.join(base, 'workspace');
    await mkdir(workspaceRoot);
    await mkdir(root);
    for (const [name, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(root, name)), { recursive: true });
        await writeFile(path.join(root, name), text);
    }
    return { root, workspaceRoot };
}
const prepare = (root: string, workspaceRoot: string, bundle?: unknown) =>
    prepareRuleResults({
        catalog,
        pages: [],
        workspaceRoot,
        companionRoot: root,
        ...(bundle ? { bundle } : {}),
    } as never);

describe('rule script discovery', () => {
    it('finds nothing without a companion root and skips non-category entries', async () => {
        const { root, workspaceRoot } = await companions({
            'notes.md': '',
            'Bad_Name/rules/a.js': COMPANION,
            'seo/CATEGORY.md': '',
            'perf/rules/a.test.ts': '',
            'perf/rules/a.d.ts': '',
            'perf/rules/README.md': '',
        });
        expect(await prepare(path.join(root, 'missing'), workspaceRoot)).toEqual([]);
        expect(await prepare(root, workspaceRoot)).toEqual([]);
    });

    it('runs a companion with the bundle and writes its result once', async () => {
        const { root, workspaceRoot } = await companions({ 'perf/rules/a.js': COMPANION });
        const [output] = await prepare(root, workspaceRoot, { routes: [] });
        expect(output).toEqual({
            reference: { ruleId: 'perf/a', path: resultPathForRule('perf/a') },
            result: { data: { rule: 'perf/a', pages: 0, bundle: { routes: [] } } },
        });
        expect(await readPreparedRuleResults(workspaceRoot, ['perf/a', 'perf/b'])).toEqual([output]);
        await expect(prepare(root, workspaceRoot)).rejects.toThrow(/EEXIST/);
    });

    it.each([
        ['an invalid companion filename', { 'perf/rules/A.js': COMPANION }, 'Invalid companion filename: A.js'],
        [
            'a module without dataSchema',
            { 'perf/rules/a.js': 'export default () => ({ data: {} });' },
            'Companion for perf/a must export dataSchema and a default function',
        ],
    ])('rejects %s', async (_case, files, error) => {
        const { root, workspaceRoot } = await companions(files);
        await expect(prepare(root, workspaceRoot)).rejects.toThrow(error);
    });

    it('rejects a symlinked rules directory and skips a symlinked companion', async () => {
        const linkedDir = await companions({ 'real/a.js': COMPANION });
        await mkdir(path.join(linkedDir.root, 'perf'));
        await symlink(path.join(linkedDir.root, 'real'), path.join(linkedDir.root, 'perf', 'rules'));
        await expect(prepare(linkedDir.root, linkedDir.workspaceRoot)).rejects.toThrow(
            'Companion rules directory must not be a symlink: perf'
        );
        const linkedFile = await companions({ 'perf/rules/b.txt': COMPANION });
        await symlink(
            path.join(linkedFile.root, 'perf', 'rules', 'b.txt'),
            path.join(linkedFile.root, 'perf', 'rules', 'a.js')
        );
        // A symlink is not a file entry, so it is skipped before the path check.
        expect(await prepare(linkedFile.root, linkedFile.workspaceRoot)).toEqual([]);
    });
});

describe('readPreparedRuleResults', () => {
    it('rejects a symlinked or invalid result, and a workspace that is a file', async () => {
        const { root, workspaceRoot } = await companions({});
        const file = path.join(workspaceRoot, resultPathForRule('perf/a'));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, '{"data":{},"extra":1}');
        await expect(readPreparedRuleResults(workspaceRoot, ['perf/a'])).rejects.toThrow(
            /^results\/categories\/perf\/rules\/a\.json is invalid:/
        );
        await writeFile(path.join(root, 'b.json'), '{"data":{}}');
        await symlink(path.join(root, 'b.json'), path.join(path.dirname(file), 'b.json'));
        await expect(readPreparedRuleResults(workspaceRoot, ['perf/b'])).rejects.toThrow(
            'Unsafe prepared result path: results/categories/perf/rules/b.json'
        );
        // Windows reports a path through a file as missing, not ENOTDIR.
        const throughFile = readPreparedRuleResults(path.join(root, 'b.json'), ['perf/a']);
        if (process.platform === 'win32') await expect(throughFile).resolves.toEqual([]);
        else await expect(throughFile).rejects.toThrow(/ENOTDIR/);
    });
});
