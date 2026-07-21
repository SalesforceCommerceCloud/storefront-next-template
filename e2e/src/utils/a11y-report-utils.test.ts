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

import { describe, it, expect } from 'vitest';
import {
    getViolationCountsByRule,
    groupViolationsByImpact,
    formatViolationReport,
    compareWithBaseline,
    formatBaselineFailure,
    formatMarkdownReport,
    formatScanBanner,
    WCAG_STANDARD,
    WCAG_TAGS,
    REPORTING_STANDARD,
    REPORTING_TAGS,
    type AxeViolation,
    type A11yScanResults,
    type Baseline,
    type BaselineComparison,
} from './a11y-report-utils';

// =============================================================================
// Helpers
// =============================================================================

function makeViolation(
    id: string,
    impact: AxeViolation['impact'],
    nodeCount: number,
    opts: { helpUrl?: string; html?: string } = {}
): AxeViolation {
    return {
        id,
        impact,
        description: `Description for ${id}`,
        helpUrl: opts.helpUrl,
        nodes: Array.from({ length: nodeCount }, (_, i) => ({
            target: [`#${id}-${i}`],
            html: opts.html ? `<div id="${id}-${i}">${opts.html}</div>` : undefined,
        })),
    };
}

function makeScanResults(violations: AxeViolation[], incomplete: AxeViolation[] = []): A11yScanResults {
    return {
        violations,
        passes: [],
        incomplete,
        inapplicable: [],
        violationCounts: getViolationCountsByRule(violations),
        violationsByImpact: groupViolationsByImpact(violations),
    };
}

// =============================================================================
// getViolationCountsByRule
// =============================================================================

describe('getViolationCountsByRule', () => {
    it('returns empty object for empty violations array', () => {
        expect(getViolationCountsByRule([])).toEqual({});
    });

    it('maps a single violation to its node count', () => {
        const violations = [makeViolation('color-contrast', 'serious', 3)];
        expect(getViolationCountsByRule(violations)).toEqual({ 'color-contrast': 3 });
    });

    it('sums node counts when the same rule appears multiple times', () => {
        const violations = [
            makeViolation('color-contrast', 'serious', 2),
            makeViolation('color-contrast', 'serious', 3),
        ];
        expect(getViolationCountsByRule(violations)).toEqual({ 'color-contrast': 5 });
    });

    it('handles multiple distinct rule IDs', () => {
        const violations = [
            makeViolation('color-contrast', 'serious', 2),
            makeViolation('image-alt', 'critical', 1),
            makeViolation('label', 'moderate', 3),
        ];
        expect(getViolationCountsByRule(violations)).toEqual({
            'color-contrast': 2,
            'image-alt': 1,
            label: 3,
        });
    });
});

// =============================================================================
// formatViolationReport
// =============================================================================

describe('formatViolationReport', () => {
    it('returns "no violations" message when violations array is empty', () => {
        const results = makeScanResults([]);
        expect(formatViolationReport(results)).toBe('No accessibility violations found.');
    });

    it('includes rule id and description for a single violation', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 1)]);
        const report = formatViolationReport(results);
        expect(report).toContain('color-contrast');
        expect(report).toContain('Description for color-contrast');
    });

    it('groups violations in severity order: critical → serious → moderate → minor', () => {
        const results = makeScanResults([
            makeViolation('minor-rule', 'minor', 1),
            makeViolation('critical-rule', 'critical', 1),
            makeViolation('moderate-rule', 'moderate', 1),
            makeViolation('serious-rule', 'serious', 1),
        ]);
        const report = formatViolationReport(results);
        const criticalPos = report.indexOf('[CRITICAL]');
        const seriousPos = report.indexOf('[SERIOUS]');
        const moderatePos = report.indexOf('[MODERATE]');
        const minorPos = report.indexOf('[MINOR]');
        expect(criticalPos).toBeLessThan(seriousPos);
        expect(seriousPos).toBeLessThan(moderatePos);
        expect(moderatePos).toBeLessThan(minorPos);
    });

    it('truncates element list to 3 and shows remaining count', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 5)]);
        const report = formatViolationReport(results);
        expect(report).toContain('... and 2 more');
    });

    it('includes help URL when present', () => {
        const results = makeScanResults([
            makeViolation('color-contrast', 'serious', 1, { helpUrl: 'https://dequeuniversity.com/color-contrast' }),
        ]);
        const report = formatViolationReport(results);
        expect(report).toContain('https://dequeuniversity.com/color-contrast');
    });

    it('includes HTML snippets when present', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 1, { html: 'click me' })]);
        const report = formatViolationReport(results);
        expect(report).toContain('click me');
    });

    it('truncates HTML snippets longer than 120 characters', () => {
        const longHtml = 'a'.repeat(150);
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 1, { html: longHtml })]);
        const report = formatViolationReport(results);
        expect(report).toContain('…');
        // The snippet in the report should not contain the full 150-char string
        expect(report).not.toContain(longHtml);
    });
});

// =============================================================================
// compareWithBaseline
// =============================================================================

describe('compareWithBaseline', () => {
    it('passes when current counts match baseline exactly', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 3 } };
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 3 }, baseline);
        expect(result.passed).toBe(true);
        expect(result.newViolations).toEqual({});
        expect(result.increasedViolations).toEqual({});
        expect(result.decreasedViolations).toEqual({});
    });

    it('passes with empty baseline and zero violations', () => {
        const result = compareWithBaseline('homepage/desktop', {}, {});
        expect(result.passed).toBe(true);
    });

    it('fails when a new rule appears that was not in baseline', () => {
        const baseline: Baseline = { 'homepage/desktop': {} };
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, baseline);
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'color-contrast': 2 });
    });

    it('fails when an existing rule has more violations than baseline', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 2 } };
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 5 }, baseline);
        expect(result.passed).toBe(false);
        expect(result.increasedViolations).toEqual({ 'color-contrast': 3 });
    });

    it('passes and records decreased count when violations drop below baseline', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 5 } };
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, baseline);
        expect(result.passed).toBe(true);
        expect(result.decreasedViolations).toEqual({ 'color-contrast': 3 });
    });

    it('records fully fixed rule (zero violations, was in baseline) as decreased', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 3 } };
        const result = compareWithBaseline('homepage/desktop', {}, baseline);
        expect(result.passed).toBe(true);
        expect(result.decreasedViolations).toEqual({ 'color-contrast': 3 });
    });

    it('handles mixed scenario: new, increased, and decreased rules simultaneously', () => {
        const baseline: Baseline = {
            'plp/desktop': {
                'color-contrast': 5,
                'image-alt': 3,
                label: 2,
            },
        };
        const current = {
            'color-contrast': 7, // increased
            'image-alt': 1, // decreased
            'aria-required': 2, // new
            // label: gone (fully fixed)
        };
        const result = compareWithBaseline('plp/desktop', current, baseline);
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'aria-required': 2 });
        expect(result.increasedViolations).toEqual({ 'color-contrast': 2 });
        expect(result.decreasedViolations).toEqual({ 'image-alt': 2, label: 2 });
    });

    it('treats missing page key as empty baseline (all violations are new)', () => {
        const result = compareWithBaseline('new-page/mobile', { 'color-contrast': 1 }, {});
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'color-contrast': 1 });
    });

    it('treats unknown impact as blocking when violations are not provided', () => {
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, {});
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'color-contrast': 2 });
        expect(result.informationalNewViolations).toEqual({});
    });
});

// =============================================================================
// compareWithBaseline — severity filtering
// =============================================================================

describe('compareWithBaseline severity filtering', () => {
    it('passes when only moderate violations are new', () => {
        const violations = [makeViolation('color-contrast', 'moderate', 2)];
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, {}, violations);
        expect(result.passed).toBe(true);
        expect(result.newViolations).toEqual({});
        expect(result.informationalNewViolations).toEqual({ 'color-contrast': 2 });
    });

    it('passes when only minor violations are new', () => {
        const violations = [makeViolation('color-contrast', 'minor', 2)];
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, {}, violations);
        expect(result.passed).toBe(true);
        expect(result.newViolations).toEqual({});
        expect(result.informationalNewViolations).toEqual({ 'color-contrast': 2 });
    });

    it('fails when a critical violation is new', () => {
        const violations = [makeViolation('image-alt', 'critical', 1)];
        const result = compareWithBaseline('homepage/desktop', { 'image-alt': 1 }, {}, violations);
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'image-alt': 1 });
        expect(result.informationalNewViolations).toEqual({});
    });

    it('fails when a serious violation is new', () => {
        const violations = [makeViolation('color-contrast', 'serious', 3)];
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 3 }, {}, violations);
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({ 'color-contrast': 3 });
        expect(result.informationalNewViolations).toEqual({});
    });

    it('passes when only moderate/minor violations increased', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 2 } };
        const violations = [makeViolation('color-contrast', 'moderate', 5)];
        const result = compareWithBaseline('homepage/desktop', { 'color-contrast': 5 }, baseline, violations);
        expect(result.passed).toBe(true);
        expect(result.increasedViolations).toEqual({});
        expect(result.informationalIncreasedViolations).toEqual({ 'color-contrast': 3 });
    });

    it('fails on critical/serious even when moderate/minor also changed', () => {
        const baseline: Baseline = { 'homepage/desktop': { 'image-alt': 1 } };
        const violations = [makeViolation('color-contrast', 'moderate', 2), makeViolation('image-alt', 'critical', 3)];
        const result = compareWithBaseline(
            'homepage/desktop',
            { 'color-contrast': 2, 'image-alt': 3 },
            baseline,
            violations
        );
        expect(result.passed).toBe(false);
        expect(result.newViolations).toEqual({});
        expect(result.informationalNewViolations).toEqual({ 'color-contrast': 2 });
        expect(result.increasedViolations).toEqual({ 'image-alt': 2 });
        expect(result.informationalIncreasedViolations).toEqual({});
    });
});

// =============================================================================
// formatBaselineFailure
// =============================================================================

describe('formatBaselineFailure', () => {
    it('lists new violations with their impact level', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 2)]);
        const comparison = compareWithBaseline('homepage/desktop', { 'color-contrast': 2 }, {});
        const message = formatBaselineFailure('homepage/desktop', comparison, results);
        expect(message).toContain('color-contrast');
        expect(message).toContain('[serious]');
        expect(message).toContain('2 violations');
    });

    it('lists increased violations with +N notation', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 5)]);
        const baseline: Baseline = { 'homepage/desktop': { 'color-contrast': 3 } };
        const comparison = compareWithBaseline('homepage/desktop', { 'color-contrast': 5 }, baseline);
        const message = formatBaselineFailure('homepage/desktop', comparison, results);
        expect(message).toContain('+2 new violation');
    });

    it('lists improvement section for decreased violations', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'serious', 1)]);
        const baseline: Baseline = {
            'homepage/desktop': { 'color-contrast': 5, 'image-alt': 3 },
        };
        // color-contrast went up (fail), image-alt went down (improvement)
        const comparison = compareWithBaseline('homepage/desktop', { 'color-contrast': 7, 'image-alt': 1 }, baseline);
        const message = formatBaselineFailure('homepage/desktop', comparison, results);
        expect(message).toContain('image-alt');
        expect(message).toContain('-2');
        expect(message).toContain('improvement');
    });

    it('uses "unknown" impact for rules not found in scan results', () => {
        const results = makeScanResults([]);
        const comparison: BaselineComparison = {
            passed: false,
            newViolations: { 'phantom-rule': 1 },
            increasedViolations: {},
            informationalNewViolations: {},
            informationalIncreasedViolations: {},
            decreasedViolations: {},
        };
        const message = formatBaselineFailure('homepage/desktop', comparison, results);
        expect(message).toContain('[unknown]');
    });

    it('includes the page key in the header', () => {
        const results = makeScanResults([makeViolation('color-contrast', 'critical', 1)]);
        const comparison = compareWithBaseline('plp/mobile', { 'color-contrast': 1 }, {});
        const message = formatBaselineFailure('plp/mobile', comparison, results);
        expect(message).toContain('plp/mobile');
    });
});

// =============================================================================
// formatScanBanner
// =============================================================================

describe('formatScanBanner', () => {
    it('includes the page key and viewport', () => {
        const banner = formatScanBanner('homepage', 'desktop');
        expect(banner).toContain('homepage');
        expect(banner).toContain('desktop');
    });

    it('includes the WCAG standard and tags', () => {
        const banner = formatScanBanner('homepage', 'mobile');
        expect(banner).toContain(WCAG_STANDARD);
        for (const tag of WCAG_TAGS) {
            expect(banner).toContain(tag);
        }
    });
});

// =============================================================================
// formatMarkdownReport
// =============================================================================

describe('formatMarkdownReport', () => {
    it('returns a valid markdown header with date and WCAG standard', () => {
        const md = formatMarkdownReport({});
        expect(md).toContain('# Accessibility Scan Report');
        expect(md).toContain(WCAG_STANDARD);
        // Timestamp in YYYY-MM-DD HH:MM:SS format
        expect(md).toMatch(/\*\*Generated:\*\* \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('includes severity legend table', () => {
        const md = formatMarkdownReport({});
        expect(md).toContain('| `critical`');
        expect(md).toContain('| `serious`');
        expect(md).toContain('| `moderate`');
        expect(md).toContain('| `minor`');
    });

    it('renders a summary table row for each page/viewport key', () => {
        const results = makeScanResults([
            makeViolation('color-contrast', 'serious', 2),
            makeViolation('image-alt', 'critical', 1),
        ]);
        const md = formatMarkdownReport({ 'homepage/desktop': results });
        expect(md).toContain('| homepage | desktop |');
        // critical: 1 node, serious: 2 nodes, moderate: 0, minor: 0, total: 3
        expect(md).toContain('| 1 | 2 | 0 | 0 | 3 |');
    });

    it('includes detail sections only for pages with violations', () => {
        const withViolations = makeScanResults([makeViolation('color-contrast', 'serious', 1)]);
        const withoutViolations = makeScanResults([]);
        const md = formatMarkdownReport({
            'homepage/desktop': withViolations,
            'cart/desktop': withoutViolations,
        });
        expect(md).toContain('## homepage/desktop');
        expect(md).not.toContain('## cart/desktop');
    });

    it('includes rule id, description, and help URL in detail sections', () => {
        const results = makeScanResults([
            makeViolation('color-contrast', 'serious', 1, {
                helpUrl: 'https://dequeuniversity.com/color-contrast',
            }),
        ]);
        const md = formatMarkdownReport({ 'plp/mobile': results });
        expect(md).toContain('`color-contrast`');
        expect(md).toContain('Description for color-contrast');
        expect(md).toContain('https://dequeuniversity.com/color-contrast');
    });

    it('includes HTML snippets in code blocks when present', () => {
        const results = makeScanResults([makeViolation('label', 'moderate', 1, { html: 'input text' })]);
        const md = formatMarkdownReport({ 'login/desktop': results });
        expect(md).toContain('### MODERATE');
        expect(md).toContain('```html');
        expect(md).toContain('input text');
    });

    it('returns empty detail sections and summary row for all-clean results', () => {
        const results = makeScanResults([]);
        const md = formatMarkdownReport({ 'checkout/desktop': results });
        expect(md).toContain('| checkout | desktop | 0 | 0 | 0 | 0 | 0 |');
        expect(md).not.toContain('## checkout/desktop');
    });

    it('splits page/viewport correctly at the first slash', () => {
        const results = makeScanResults([]);
        const md = formatMarkdownReport({ 'my-page/desktop': results });
        expect(md).toContain('| my-page | desktop |');
    });
});

// =============================================================================
// formatMarkdownReport — widened report header + needs-review (incomplete) bucket
// =============================================================================

describe('formatMarkdownReport widened reporting', () => {
    it('states the widened reporting standard and every reporting tag in the header', () => {
        const md = formatMarkdownReport({});
        expect(md).toContain(REPORTING_STANDARD);
        for (const tag of REPORTING_TAGS) {
            expect(md).toContain(tag);
        }
    });

    it('records the narrower CI gate standard so the report is not mistaken for the gate', () => {
        const md = formatMarkdownReport({});
        expect(md).toContain('**CI gate:**');
        expect(md).toContain(WCAG_STANDARD);
        // The gate line must list the narrow blocking tags, not the widened set.
        for (const tag of WCAG_TAGS) {
            expect(md).toContain(tag);
        }
    });

    it('adds a Needs review column and counts incomplete nodes per summary row', () => {
        const results = makeScanResults(
            [makeViolation('color-contrast', 'serious', 1)],
            [makeViolation('color-contrast-enhanced', null, 2)]
        );
        const md = formatMarkdownReport({ 'homepage/desktop': results });
        expect(md).toContain('| Needs review |');
        // critical 0, serious 1, moderate 0, minor 0, total 1, needs review 2
        expect(md).toContain('| homepage | desktop | 0 | 1 | 0 | 0 | 1 | 2 |');
    });

    it('reports zero needs-review when there are no incomplete items', () => {
        const results = makeScanResults([makeViolation('image-alt', 'critical', 1)]);
        const md = formatMarkdownReport({ 'plp/mobile': results });
        expect(md).toContain('| plp | mobile | 1 | 0 | 0 | 0 | 1 | 0 |');
    });

    it('renders a NEEDS MANUAL REVIEW section for a page that only has incomplete items', () => {
        const results = makeScanResults([], [makeViolation('link-in-text-block', null, 3)]);
        const md = formatMarkdownReport({ 'homepage/desktop': results });
        // Detail section appears even though there are zero blocking violations.
        expect(md).toContain('## homepage/desktop');
        expect(md).toContain('NEEDS MANUAL REVIEW');
        expect(md).toContain('link-in-text-block');
        expect(md).toContain('do not block CI');
    });

    it('omits the detail section entirely when a page is fully clean', () => {
        const results = makeScanResults([], []);
        const md = formatMarkdownReport({ 'cart/desktop': results });
        expect(md).not.toContain('## cart/desktop');
        expect(md).not.toContain('NEEDS MANUAL REVIEW');
    });

    it('truncates the needs-review element list to 10 and shows the remaining count', () => {
        const results = makeScanResults([], [makeViolation('aria-allowed-attr', null, 13)]);
        const md = formatMarkdownReport({ 'pdp/desktop': results });
        expect(md).toContain('... and 3 more');
    });
});
