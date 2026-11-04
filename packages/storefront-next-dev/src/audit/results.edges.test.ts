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
import { describe, expect, it } from 'vitest';
import type { AuditCatalog } from './catalog';
import {
    RECOMMENDATIONS_RULE_ID,
    WATERFALL_RULE_ID,
    auditResultJsonSchema,
    validateAuditResult,
    validateRecommendations,
} from './results';

const PAGE = {
    label: 'home',
    url: 'https://shop.test/?token=secret',
    playhouse: {
        archiveDir: '/Users/me/archive',
        version: '1',
        lighthouseVersion: '13',
        artifacts: { 'summary.json': {} },
    },
};
const RULES = ['seo/title', WATERFALL_RULE_ID, RECOMMENDATIONS_RULE_ID];
const base = {
    schemaVersion: '1.0',
    run: { id: 'fixture', generatedAt: '2026-09-16T00:00:00.000Z', toolVersion: '0.2.0' },
    project: {},
    pages: [PAGE],
    catalog: {
        categories: [
            { id: 'seo', title: 'SEO', ruleIds: ['seo/title'] },
            { id: 'performance', title: 'Performance', ruleIds: RULES.slice(1) },
        ],
        ruleIds: RULES,
    },
    evaluations: [],
    observations: [],
    coverage: [],
};
const catalog = {
    categories: [
        { id: 'seo', rules: [{ id: 'seo/title', severity: 'medium' }] },
        { id: 'performance', rules: [] },
    ],
    ruleIds: RULES,
} as unknown as AuditCatalog;
const evaluation = (extra: Record<string, unknown> = {}) => ({
    ruleId: 'seo/title',
    disposition: 'pass',
    title: 'Title',
    summary: 'Fine.',
    evidence: [],
    ...extra,
});
const step = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'loader',
    label: `Load ${id}`,
    source: { file: 'src/routes/_index.tsx' },
    blocking: true,
    ...extra,
});
const recommendation = (extra: Record<string, unknown> = {}) => ({
    pages: ['home'],
    title: 'Load the map later',
    change: 'replace',
    target: 'leaflet',
    how: 'Use a static image.',
    files: [{ file: 'src/map.tsx' }],
    ...extra,
});

describe('validateAuditResult edges', () => {
    it.each<[string, Record<string, unknown>, AuditCatalog | undefined, string]>([
        [
            'a finding without severity and no catalog',
            { evaluations: [evaluation({ disposition: 'finding', evidence: [{ type: 'manual', description: 'x' }] })] },
            undefined,
            'finding requires severity',
        ],
        [
            'a catalog rule outside its category',
            { catalog: { categories: [{ id: 'seo', title: 'SEO', ruleIds: ['perf/x'] }], ruleIds: ['perf/x'] } },
            undefined,
            'Catalog rule perf/x is not in category seo',
        ],
        [
            'an unknown rule',
            { evaluations: [evaluation({ ruleId: 'seo/other' })] },
            catalog,
            'Unknown rule id: seo/other',
        ],
        [
            'a duplicate evaluation',
            { evaluations: [evaluation(), evaluation()] },
            catalog,
            'Duplicate evaluation: seo/title',
        ],
        [
            'a finding for a rule with no category',
            {
                evaluations: [
                    evaluation({
                        ruleId: WATERFALL_RULE_ID,
                        disposition: 'finding',
                        evidence: [{ type: 'manual', description: 'x' }],
                    }),
                ],
            },
            catalog,
            `Rule ${WATERFALL_RULE_ID} has no category in the catalog`,
        ],
        [
            'dangling observation evidence',
            {
                observations: [
                    {
                        title: 'o',
                        summary: 's',
                        evidence: [{ type: 'playhouse', page: 'plp', artifact: 'summary.json' }],
                    },
                ],
            },
            catalog,
            'plp',
        ],
        [
            'an unknown coverage rule',
            { coverage: [{ ruleId: 'seo/other', status: 'missing', note: '' }] },
            catalog,
            'Unknown coverage rule id: seo/other',
        ],
        [
            'an unknown coverage category',
            { coverage: [{ category: 'a11y', status: 'missing', note: '' }] },
            catalog,
            'Unknown coverage category: a11y',
        ],
        [
            'a duplicate waterfall page',
            {
                evaluations: [
                    evaluation({
                        ruleId: WATERFALL_RULE_ID,
                        waterfall: {
                            pages: [
                                { page: 'home', route: '/', summary: '', steps: [step('a')] },
                                { page: 'home', route: '/', summary: '', steps: [step('a')] },
                            ],
                        },
                    }),
                ],
            },
            undefined,
            'Duplicate waterfall page: home',
        ],
        [
            'a recommendation listing a page twice',
            {
                evaluations: [
                    evaluation({
                        ruleId: RECOMMENDATIONS_RULE_ID,
                        recommendations: [recommendation({ pages: ['home', 'home'] })],
                    }),
                ],
            },
            undefined,
            'Recommendation replace leaflet lists a page twice',
        ],
    ])('rejects %s', (_case, input, rules, error) => {
        expect(() => validateAuditResult({ ...base, ...input }, rules)).toThrow(error);
    });

    it('sanitizes every analysis text, sorts coverage, and keeps recommendations without a bundle', () => {
        const secret = 'Bearer abcdefghijklmnopqrstuvwxyz0123456789';
        const result = validateAuditResult(
            {
                ...base,
                evaluations: [
                    evaluation({
                        ruleId: WATERFALL_RULE_ID,
                        remediation: `Use ${secret}`,
                        evidence: [
                            { type: 'manual', description: 'curl', location: '/Users/me/site' },
                            { type: 'playhouse', page: 'home', artifact: 'summary.json', pointer: 'cells', value: 1 },
                        ],
                        waterfall: {
                            pages: [
                                {
                                    page: 'home',
                                    route: '/',
                                    summary: 'Two loaders',
                                    steps: [
                                        step('a', { conditional: `when ${secret}`, note: `see ${secret}` }),
                                        step('b', { after: ['a'] }),
                                    ],
                                },
                            ],
                        },
                    }),
                    evaluation({
                        ruleId: RECOMMENDATIONS_RULE_ID,
                        recommendations: [recommendation({ how: `Drop ${secret}` })],
                    }),
                ],
                observations: [
                    {
                        title: `Saw ${secret}`,
                        summary: 'x',
                        evidence: [{ type: 'source', file: 'src/a.ts', excerpt: secret }],
                    },
                ],
                coverage: [
                    { page: 'home', status: 'partial', note: 'b' },
                    { category: 'seo', status: 'missing', note: secret },
                ],
                summary: { guidance: 'go', narrative: secret, highlights: [secret] },
            },
            catalog
        );
        const text = JSON.stringify(result);
        expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz');
        expect(text).not.toContain('/Users/me');
        expect(result.evaluations.map((item) => item.ruleId)).toEqual([...RULES.slice(1).sort(), 'seo/title']);
        expect(result.coverage.map((item) => item.category ?? item.page)).toEqual(['home', 'seo']);
        expect(result.evaluations[0]?.recommendations?.[0]?.savings).toBeUndefined();
        expect(result.evaluations[1]?.evidence[1]).toMatchObject({ pointer: 'cells' });
        expect(result.summary?.highlights).toHaveLength(1);
    });

    it('builds a JSON schema of the result', () => {
        expect(auditResultJsonSchema()).toMatchObject({ type: 'object', required: expect.arrayContaining(['pages']) });
    });
});

describe('validateRecommendations edges', () => {
    it('lets a deferring change own a package without deferrable bytes', () => {
        const item = recommendation({ change: 'dynamic-import', trigger: 'interaction' });
        const bundle = {
            pages: [
                {
                    page: 'home',
                    local: { candidates: [], packages: [{ name: 'leaflet', kind: 'npm', bytes: 40_000 }] },
                },
            ],
        };
        validateRecommendations(
            evaluation({ ruleId: RECOMMENDATIONS_RULE_ID, recommendations: [item] }) as never,
            new Set(['home']),
            bundle as never
        );
        expect(item).toMatchObject({ savings: [{ page: 'home', bytes: 40_000, upTo: true }] });
    });
});
