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
import { readFile, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AUDIT_ROOT } from './assets';

const metadataSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
    title: z.string().min(1),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    appliesTo: z.array(z.string()).default([]),
    inputs: z.array(z.string()).min(1),
});
const requiredSections = ['Intent', 'Inspect', 'Evaluate', 'Evidence', 'Remediation', 'Examples'];

export type AuditRule = z.infer<typeof metadataSchema> & { file: string; instructions: string };
export type AuditCategory = { id: string; title: string; file: string; guidance: string; rules: AuditRule[] };
export type AuditCatalog = { categories: AuditCategory[]; ruleIds: string[] };

function frontmatter(markdown: string, file: string): { metadata: unknown; body: string } {
    const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: missing YAML frontmatter`);
    return { metadata: parseYaml(match[1] ?? ''), body: match[2] ?? '' };
}

export async function discoverCatalog(categoriesDir: string): Promise<AuditCatalog> {
    const entries = (await readdir(categoriesDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    const seen = new Set<string>();
    const categories: AuditCategory[] = [];
    for (const entry of entries) {
        const categoryFile = path.join(categoriesDir, entry.name, 'CATEGORY.md');
        const guidance = await readFile(categoryFile, 'utf8');
        const title = guidance.match(/^#\s+(.+)$/m)?.[1]?.trim();
        if (!title) throw new Error(`${categoryFile}: missing category title`);
        const rulesDir = path.join(categoriesDir, entry.name, 'rules');
        let discoveredRules: Dirent[];
        try {
            discoveredRules = await readdir(rulesDir, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            discoveredRules = [];
        }
        const ruleEntries = discoveredRules
            .filter((rule) => rule.isFile() && rule.name.endsWith('.md'))
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
        const rules: AuditRule[] = [];
        for (const ruleEntry of ruleEntries) {
            const file = path.join(rulesDir, ruleEntry.name);
            const { metadata, body } = frontmatter(await readFile(file, 'utf8'), file);
            const parsed = metadataSchema.parse(metadata);
            const expected = `${entry.name}/${ruleEntry.name.slice(0, -3)}`;
            if (parsed.id !== expected) throw new Error(`${file}: id must be ${expected}`);
            if (seen.has(parsed.id)) throw new Error(`${file}: duplicate rule id ${parsed.id}`);
            for (const section of requiredSections) {
                if (!new RegExp(`^## ${section}\\s*$`, 'm').test(body))
                    throw new Error(`${file}: missing ## ${section}`);
            }
            seen.add(parsed.id);
            rules.push({ ...parsed, file, instructions: body.trim() });
        }
        categories.push({ id: entry.name, title, file: categoryFile, guidance, rules });
    }
    return { categories, ruleIds: [...seen].sort() };
}

export function defaultCategoriesDir(): string {
    return path.join(AUDIT_ROOT, 'catalog', 'categories');
}
