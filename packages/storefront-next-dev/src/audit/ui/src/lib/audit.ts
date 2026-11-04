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
import { type AuditResult, type Evidence, SEVERITIES, type Severity } from '../types';
import { PAGE_NAMES } from './playhouse';

export type Evaluation = AuditResult['evaluations'][number];
export type Observation = AuditResult['observations'][number];
export type Page = AuditResult['pages'][number];

const SEVERITY_RANK = new Map<Severity, number>(SEVERITIES.map((severity, index) => [severity, index]));

export const categoryId = (item: Evaluation): string => item.ruleId.split('/')[0] ?? item.ruleId;

export const categoryTitle = (result: AuditResult, id: string): string =>
    result.catalog.categories.find((category) => category.id === id)?.title ?? id;

export function compareFindings(a: Evaluation, b: Evaluation): number {
    return (
        (SEVERITY_RANK.get((a.severity ?? 'info') as Severity) ?? 99) -
            (SEVERITY_RANK.get((b.severity ?? 'info') as Severity) ?? 99) || a.ruleId.localeCompare(b.ruleId)
    );
}

export function findings(result: AuditResult): Evaluation[] {
    return result.evaluations
        .filter((item) => item.disposition === 'finding')
        .slice()
        .sort(compareFindings);
}

/**
 * Page labels an item touches, derived from its Playhouse evidence. An item
 * with only source evidence (or none) is cross-page — it returns [].
 * Used to power the Page filter without inventing a page association.
 */
export function evidencePages(evidence: readonly Evidence[]): string[] {
    return [...new Set(evidence.flatMap((e) => (e.type === 'playhouse' ? [e.page] : [])))];
}

// Playhouse writes a fixed set of artifacts, so evidence names them for readers
// instead of showing file paths and JSON pointers. Matched on the file name.
const ARTIFACT_LABELS: [RegExp, string][] = [
    [/^summary\.json$/, 'Lighthouse summary'],
    [/^summary-lcp\.json$/, 'LCP breakdown'],
    [/^summary-tbt\.json$/, 'TBT breakdown'],
    [/^summary-third-party\.json$/, 'Third-party summary'],
    [/^opportunities\.json$/, 'Lighthouse opportunities'],
    [/^report-.*\.html$/, 'Lighthouse report'],
    [/^network(-.*)?\.(har|json)$/, 'Network log'],
    [/^diagnostics-.*\.json$/, 'Browser console & issues'],
    [/^console-.*\.json$/, 'Browser console'],
    [/^document\.json$/, 'HTML document'],
    [/^index\.json$/, 'Page scripts'],
    [/^[0-9a-f]{64}\.js$/, 'Page script'],
    [/^lhr\.json$/, 'Lighthouse result'],
    [/^(trace|profile|devtoolslog)-.*\.json$/, 'Performance trace'],
];

export function artifactLabel(artifact: string): string {
    const file = artifact.split('/').pop() ?? artifact;
    return ARTIFACT_LABELS.find(([pattern]) => pattern.test(file))?.[1] ?? file;
}

export function evidenceSource(item: Evidence | undefined): string {
    if (!item) return '';
    if (item.type === 'source') return `${item.file}${item.line ? `:${item.line}` : ''}`;
    if (item.type === 'playhouse') return `${PAGE_NAMES[item.page] ?? item.page} · ${artifactLabel(item.artifact)}`;
    return item.location ? (PAGE_NAMES[item.location] ?? item.location) : item.description;
}

export function formatEvidence(item: Evidence): string {
    if (item.type === 'source')
        return `${item.file}${item.line ? `:${item.line}` : ''}${item.excerpt ? `\n${item.excerpt}` : ''}`;
    if (item.type === 'playhouse') return item.value === undefined ? '' : String(item.value);
    return `${item.description}${item.location ? `\n${item.location}` : ''}`;
}
