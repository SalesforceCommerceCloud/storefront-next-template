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
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverCatalog } from './catalog';

const SECTIONS = ['Intent', 'Inspect', 'Evaluate', 'Evidence', 'Remediation', 'Examples'];
const rule = (id: string, sections = SECTIONS) =>
    `---\nid: ${id}\ntitle: A rule\nseverity: low\ninputs: [summary.json]\n---\n${sections.map((section) => `## ${section}\n`).join('')}`;

/** A categories directory: each category maps to its CATEGORY.md and rule files (`rules` itself may be a file). */
async function categories(tree: Record<string, { guidance?: string; rules?: Record<string, string> | string }>) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sfnext-catalog-'));
    await writeFile(path.join(dir, 'README.md'), 'not a category');
    for (const [id, { guidance = `# ${id}\n`, rules }] of Object.entries(tree)) {
        await mkdir(path.join(dir, id));
        await writeFile(path.join(dir, id, 'CATEGORY.md'), guidance);
        if (typeof rules === 'string') await writeFile(path.join(dir, id, 'rules'), rules);
        else if (rules) {
            await mkdir(path.join(dir, id, 'rules'));
            for (const [name, text] of Object.entries(rules)) await writeFile(path.join(dir, id, 'rules', name), text);
        }
    }
    return dir;
}

describe('discoverCatalog', () => {
    it('allows a category without rules and ignores non-markdown rule files', async () => {
        const dir = await categories({
            seo: {},
            perf: { rules: { 'b.md': rule('perf/b'), 'a.md': rule('perf/a'), 'a.ts': 'export {}' } },
        });
        const catalog = await discoverCatalog(dir);
        expect(catalog.categories.map((category) => [category.id, category.rules.map((item) => item.id)])).toEqual([
            ['perf', ['perf/a', 'perf/b']],
            ['seo', []],
        ]);
        expect(catalog.categories[0]?.rules[0]).toMatchObject({
            appliesTo: [],
            instructions: expect.stringMatching(/^## Intent/),
        });
    });

    it.each([
        ['a category without a title', { perf: { guidance: 'no heading' } }, /CATEGORY\.md: missing category title$/],
        ['a rules path that is a file', { perf: { rules: 'oops' } }, /ENOTDIR/],
        [
            'a rule without frontmatter',
            { perf: { rules: { 'a.md': '## Intent\n' } } },
            /a\.md: missing YAML frontmatter$/,
        ],
        [
            'a rule id that does not match its path',
            { perf: { rules: { 'a.md': rule('perf/b') } } },
            /a\.md: id must be perf\/a$/,
        ],
        [
            'a rule missing a section',
            { perf: { rules: { 'a.md': rule('perf/a', SECTIONS.slice(0, 5)) } } },
            /a\.md: missing ## Examples$/,
        ],
    ])('rejects %s', async (_case, tree, error) => {
        await expect(discoverCatalog(await categories(tree))).rejects.toThrow(error);
    });
});
