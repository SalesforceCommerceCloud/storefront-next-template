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
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCategoriesDir, discoverCatalog, type AuditCatalog, type AuditRule } from './catalog';

const ruleIn = (catalog: AuditCatalog, id: string): AuditRule | undefined =>
    catalog.categories.flatMap((category) => category.rules).find((item) => item.id === id);

describe('catalog', () => {
    it('discovers sorted categories, and validates rule sections', async () => {
        const catalog = await discoverCatalog(defaultCategoriesDir());
        const rule = (id: string) => ruleIn(catalog, id);
        expect(catalog.categories.map((category) => category.id)).toEqual([
            'best-practices',
            'performance',
            'security',
            'seo',
        ]);
        expect(catalog.ruleIds).toContain('performance/lcp-budget');
        const runtime = rule('security/csp-runtime-compatibility');
        expect(runtime?.severity).toBe('medium');
        expect(runtime?.instructions).toMatch(/sourceStatus/);
        expect(runtime?.instructions).toMatch(/container\/tag owner/i);
        expect(runtime?.instructions).toMatch(/ownership is unresolved/i);
        expect(catalog.ruleIds).not.toContain('security/security-headers');
        for (const id of ['performance/third-party-cost', 'performance/responsive-images'])
            expect(catalog.ruleIds, id).not.toContain(id);
        // Script-decided header rules read only the HAR.
        for (const [id, severity] of [
            ['security/content-security-policy', 'high'],
            ['security/browser-hardening-headers', 'medium'],
            ['performance/content-encoding', 'high'],
            ['performance/cache-control', 'medium'],
        ]) {
            expect(rule(id)?.severity, id).toBe(severity);
            expect(rule(id)?.inputs, id).toEqual(['playhouse.network-har']);
        }
        for (const id of [
            'performance/lcp-budget',
            'performance/tbt-budget',
            'performance/cls-budget',
            'performance/ttfb-budget',
        ])
            expect(rule(id)?.inputs, id).toEqual(['playhouse.summary']);
        expect(catalog.ruleIds).toContain('security/strict-transport-security');
    });

    it('defaults to the catalog beside the audit source, as a plain path', () => {
        expect(defaultCategoriesDir()).toBe(path.join(import.meta.dirname, 'catalog', 'categories'));
        expect(defaultCategoriesDir()).not.toMatch(/%[0-9A-F]{2}/i);
    });

    it('names every rule by its path, and gives every rule script a rule', async () => {
        const root = defaultCategoriesDir();
        const catalog = await discoverCatalog(root);
        for (const category of catalog.categories) {
            for (const rule of category.rules) {
                expect(rule.file).toBe(path.join(root, category.id, 'rules', `${rule.id.split('/')[1]}.md`));
                expect(rule.id.startsWith(`${category.id}/`), rule.id).toBe(true);
            }
            const files = await readdir(path.join(root, category.id, 'rules'));
            const scripts = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
            for (const script of scripts) expect(files, script).toContain(script.replace(/\.ts$/, '.md'));
        }
    });
});
