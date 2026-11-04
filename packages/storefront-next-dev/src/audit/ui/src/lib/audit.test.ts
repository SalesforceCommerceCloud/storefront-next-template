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
import fixture from '../../../__fixtures__/audit-result.json';
import type { AuditResult, Evidence } from '../types';
import {
    artifactLabel,
    categoryId,
    categoryTitle,
    evidencePages,
    evidenceSource,
    findings,
    formatEvidence,
    type Evaluation,
} from './audit';

const result = fixture as unknown as AuditResult;
const evaluation = (ruleId: string, extra: Partial<Evaluation> = {}): Evaluation => ({
    ruleId,
    disposition: 'finding',
    title: ruleId,
    summary: '',
    evidence: [],
    ...extra,
});

describe('findings', () => {
    it('keeps only findings, ranked by severity and then rule id', () => {
        const ranked = findings({
            ...result,
            evaluations: [
                evaluation('seo/b', { severity: 'low' }),
                evaluation('seo/pass', { disposition: 'pass', severity: 'critical' }),
                evaluation('seo/no-severity'),
                evaluation('seo/a', { severity: 'low' }),
                evaluation('security/csp', { severity: 'critical' }),
            ],
        });
        expect(ranked.map((item) => item.ruleId)).toEqual(['security/csp', 'seo/a', 'seo/b', 'seo/no-severity']);
    });

    it('ranks the fixture findings high before medium', () => {
        expect(findings(result).map((item) => item.severity)).toEqual(['high', 'high', 'medium']);
    });
});

describe('categories', () => {
    it('reads the category from the rule id and its title from the catalog', () => {
        expect(categoryId(evaluation('accessibility/accessible-name'))).toBe('accessibility');
        expect(categoryTitle(result, 'accessibility')).toBe('Accessibility');
        expect(categoryTitle(result, 'unknown-category')).toBe('unknown-category');
    });
});

describe('evidence', () => {
    const playhouse: Evidence = { type: 'playhouse', page: 'pdp', artifact: 'runs/1/summary-lcp.json', pointer: '/x' };
    const source: Evidence = { type: 'source', file: 'src/root.tsx', line: 12, excerpt: '<Links />' };
    const manual: Evidence = { type: 'manual', description: 'Keyboard walkthrough', location: 'plp' };

    it('lists each Playhouse page once and none for source evidence', () => {
        expect(evidencePages([playhouse, source, { ...playhouse, artifact: 'summary.json' }])).toEqual(['pdp']);
        expect(evidencePages([source, manual])).toEqual([]);
    });

    it('names Playhouse artifacts for readers and falls back to the file name', () => {
        expect(artifactLabel('summary.json')).toBe('Lighthouse summary');
        expect(artifactLabel('runs/abc/network-mobile-cold.har')).toBe('Network log');
        expect(artifactLabel(`scripts/${'a'.repeat(64)}.js`)).toBe('Page script');
        expect(artifactLabel('trace-mobile-cold.json')).toBe('Performance trace');
        expect(artifactLabel('custom/other.txt')).toBe('other.txt');
    });

    it('labels where each kind of evidence comes from', () => {
        expect(evidenceSource(undefined)).toBe('');
        expect(evidenceSource(source)).toBe('src/root.tsx:12');
        expect(evidenceSource({ type: 'source', file: 'src/root.tsx' })).toBe('src/root.tsx');
        expect(evidenceSource(playhouse)).toBe('Product / PDP · LCP breakdown');
        expect(evidenceSource({ ...playhouse, page: 'landing' })).toBe('landing · LCP breakdown');
        expect(evidenceSource(manual)).toBe('Category / PLP');
        expect(evidenceSource({ ...manual, location: 'checkout step' })).toBe('checkout step');
        expect(evidenceSource({ type: 'manual', description: 'Keyboard walkthrough' })).toBe('Keyboard walkthrough');
    });

    it('formats the evidence body for each kind', () => {
        expect(formatEvidence(source)).toBe('src/root.tsx:12\n<Links />');
        expect(formatEvidence({ type: 'source', file: 'src/root.tsx' })).toBe('src/root.tsx');
        expect(formatEvidence({ ...playhouse, value: 1600 })).toBe('1600');
        expect(formatEvidence(playhouse)).toBe('');
        expect(formatEvidence(manual)).toBe('Keyboard walkthrough\nplp');
        expect(formatEvidence({ type: 'manual', description: 'Keyboard walkthrough' })).toBe('Keyboard walkthrough');
    });
});
