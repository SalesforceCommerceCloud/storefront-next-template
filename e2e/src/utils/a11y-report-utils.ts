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

// =============================================================================
// Errors
// =============================================================================

export class A11yBaselineError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'A11yBaselineError';
    }
}

// =============================================================================
// Types
// =============================================================================

export interface A11yScanOptions {
    /** WCAG tag filters. Defaults to WCAG_TAGS. */
    tags?: string[];
    /** Rule IDs to disable for this scan. */
    disableRules?: string[];
    /** CSS selectors to include (scoped scan). */
    include?: string[];
    /** CSS selectors to exclude from scan. */
    exclude?: string[];
}

export interface AxeViolation {
    id: string;
    impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
    description: string;
    /** axe-core documentation URL for this rule. */
    helpUrl?: string;
    /**
     * Tags of the rule that flagged this violation (e.g. `wcag2aa`, `wcag22aa`,
     * `best-practice`). axe-core always populates this on a rule result. Optional
     * here only so hand-built test fixtures need not supply it; real scan output
     * always carries it. Used by {@link filterViolationsByTags} to derive the narrow
     * WCAG view from a single widened scan.
     */
    tags?: string[];
    nodes: Array<{ target: string[]; html?: string }>;
}

export interface A11yScanResults {
    violations: AxeViolation[];
    passes: AxeViolation[];
    incomplete: AxeViolation[];
    inapplicable: AxeViolation[];
    violationCounts: Record<string, number>;
    violationsByImpact: {
        critical: AxeViolation[];
        serious: AxeViolation[];
        moderate: AxeViolation[];
        minor: AxeViolation[];
    };
}

export interface BaselineComparison {
    /**
     * True when no critical or serious violations exceed baseline.
     * Moderate and minor regressions are tracked but do not affect this flag.
     */
    passed: boolean;
    /** New critical/serious rules not in baseline — these block the build. */
    newViolations: Record<string, number>;
    /** Critical/serious rules with more violations than baseline — these block the build. */
    increasedViolations: Record<string, number>;
    /** New moderate/minor rules not in baseline — tracked for reporting, not blocking. */
    informationalNewViolations: Record<string, number>;
    /** Moderate/minor rules with more violations than baseline — tracked for reporting, not blocking. */
    informationalIncreasedViolations: Record<string, number>;
    decreasedViolations: Record<string, number>;
}

export type Baseline = Record<string, Record<string, number>>;

// =============================================================================
// Constants
// =============================================================================

export const WCAG_STANDARD = 'WCAG 2.1 AA';
export const WCAG_TAGS: string[] = ['wcag2a', 'wcag2aa', 'wcag21aa'];

/**
 * Widened tag set for the offline REPORT and for local exploratory scans — never
 * for the blocking gate. Adds WCAG 2.2 AA (`wcag22aa`: target-size, focus-appearance)
 * and axe `best-practice` rules (heading-order, landmark-one-main, region, list markup)
 * on top of the WCAG 2.1 AA blocking set.
 *
 * IMPORTANT: this is deliberately NOT the default in {@link scanAndAssert}. The CI
 * gate asserts on {@link WCAG_TAGS} only, so widening this constant can never fail a
 * PR — it only enriches the report (`pnpm a11y:report`) and the surfaces the a11y suite
 * skills drive locally. Promoting any of these tags to the gate is a separate, explicit
 * decision (fix or baseline the findings first, then move the tag into WCAG_TAGS).
 */
export const REPORTING_TAGS: string[] = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Human-readable label for the widened report scan. */
export const REPORTING_STANDARD = 'WCAG 2.2 AA + axe best-practice (report only, non-blocking)';

/**
 * Severity levels that block the CI build when they exceed baseline.
 * Moderate and minor violations are tracked and reported but do not fail the job.
 */
export const BLOCKING_SEVERITIES: string[] = ['critical', 'serious'];

export const SEVERITY_LEGEND = `Severity levels:
  critical  — Blocks access entirely for users with disabilities
  serious   — Creates significant barriers; should be fixed quickly
  moderate  — Creates difficulty but workarounds may exist
  minor     — Low impact; fix when convenient`;

// =============================================================================
// Violation analysis
// =============================================================================

/**
 * Transform raw axe violations into a Record<ruleId, nodeCount>.
 * Used for baseline comparison — each rule maps to the number of affected nodes.
 */
export function getViolationCountsByRule(violations: AxeViolation[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const violation of violations) {
        counts[violation.id] = (counts[violation.id] ?? 0) + violation.nodes.length;
    }
    return counts;
}

/**
 * Group violations by impact level for structured reporting.
 */
export function groupViolationsByImpact(violations: AxeViolation[]): A11yScanResults['violationsByImpact'] {
    return {
        critical: violations.filter((v) => v.impact === 'critical'),
        serious: violations.filter((v) => v.impact === 'serious'),
        moderate: violations.filter((v) => v.impact === 'moderate'),
        minor: violations.filter((v) => v.impact === 'minor'),
    };
}

/**
 * Narrow a widened scan's results down to the violations a scan restricted to
 * `tags` would have produced, recomputing the derived count/impact views so the
 * result is indistinguishable from a standalone narrow scan.
 *
 * This is exact, not an approximation: axe runs each rule independently, and
 * `AxeBuilder.withTags(tags)` runs precisely the rules carrying one of those tags.
 * So the set of violations from a narrow scan equals the widened scan's violations
 * whose own `tags` intersect the narrow set. Running one widened scan and filtering
 * therefore yields the same blocking input as running a separate narrow scan — one
 * axe pass instead of two on the same page.
 *
 * A violation with no `tags` (only hand-built fixtures; real axe output always has
 * them) is treated as NOT matching, so it never leaks into the narrow gate view.
 *
 * @param results - Results from a widened scan (e.g. {@link REPORTING_TAGS}).
 * @param tags - The narrow tag set to keep, e.g. {@link WCAG_TAGS}.
 * @returns A results object carrying only the matching violations, with
 *   `violationCounts` and `violationsByImpact` recomputed to match.
 */
export function filterViolationsByTags(results: A11yScanResults, tags: string[]): A11yScanResults {
    const wanted = new Set(tags);
    const violations = results.violations.filter((v) => (v.tags ?? []).some((t) => wanted.has(t)));
    return {
        ...results,
        violations,
        violationCounts: getViolationCountsByRule(violations),
        violationsByImpact: groupViolationsByImpact(violations),
    };
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Build a ruleId → impact lookup map from a violations array. */
function buildRuleImpactMap(violations: AxeViolation[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const v of violations) {
        map[v.id] = v.impact ?? 'unknown';
    }
    return map;
}

// =============================================================================
// Console formatting
// =============================================================================

/**
 * Format a per-scan banner identifying the page, viewport, and WCAG standard.
 * Printed at the start of each axe scan for clear output attribution.
 */
export function formatScanBanner(pageKey: string, viewport: string): string {
    const line = '═'.repeat(40);
    return [
        line,
        `  A11Y SCAN: ${pageKey} | ${viewport}`,
        `  Standard: ${WCAG_STANDARD} (${WCAG_TAGS.join(', ')})`,
        line,
    ].join('\n');
}

/**
 * Format violations into a human-readable report grouped by severity.
 * Includes rule description, help URL, and HTML snippets of affected elements
 * to make the output actionable for creating tickets.
 */
export function formatViolationReport(results: A11yScanResults): string {
    if (results.violations.length === 0) {
        return 'No accessibility violations found.';
    }

    const totalNodes = results.violations.reduce((sum, v) => sum + v.nodes.length, 0);
    const lines: string[] = [`Accessibility Violations (${totalNodes} total):`];
    const impactOrder: Array<keyof A11yScanResults['violationsByImpact']> = [
        'critical',
        'serious',
        'moderate',
        'minor',
    ];

    for (const impact of impactOrder) {
        const group = results.violationsByImpact[impact];
        if (group.length === 0) continue;

        lines.push(`\n  [${impact.toUpperCase()}] (${group.length} rule${group.length !== 1 ? 's' : ''})`);
        for (const violation of group) {
            lines.push(`    Rule:        ${violation.id}`);
            lines.push(`    Description: ${violation.description}`);
            if (violation.helpUrl) {
                lines.push(`    Help:        ${violation.helpUrl}`);
            }
            lines.push(`    Affected elements (${violation.nodes.length}):`);
            const preview = violation.nodes.slice(0, 3);
            for (const node of preview) {
                lines.push(`      - ${node.target.join(', ')}`);
                if (node.html) {
                    const snippet = node.html.length > 120 ? `${node.html.slice(0, 120)}…` : node.html;
                    lines.push(`        ${snippet}`);
                }
            }
            if (violation.nodes.length > 3) {
                lines.push(`      ... and ${violation.nodes.length - 3} more`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Compare current violation counts against the stored baseline for a page.
 *
 * Only **critical** and **serious** violations block the build (`passed = false`).
 * Moderate and minor regressions are captured in `informationalNewViolations` /
 * `informationalIncreasedViolations` for reporting but do not fail CI.
 *
 * When `violations` is not provided, the impact of each rule is unknown. Unknown
 * impact is treated conservatively — the violation is considered blocking.
 *
 * @param pageKey - Composite key identifying the page+viewport (e.g. 'homepage/desktop').
 * @param currentCounts - Violation counts from the latest axe scan.
 * @param baseline - Full baseline data loaded from the JSON file.
 * @param violations - Current scan violations, used to look up per-rule impact.
 */
export function compareWithBaseline(
    pageKey: string,
    currentCounts: Record<string, number>,
    baseline: Baseline,
    violations: AxeViolation[] = []
): BaselineComparison {
    const expected = baseline[pageKey] ?? {};

    // Build ruleId → impact lookup from the current scan.
    const ruleImpact = buildRuleImpactMap(violations);

    // A rule is blocking when its impact is critical/serious, or when impact is
    // unknown (violations not provided) — conservative default.
    const isBlocking = (ruleId: string): boolean => {
        const impact = ruleImpact[ruleId];
        return impact == null || BLOCKING_SEVERITIES.includes(impact);
    };

    const newViolations: Record<string, number> = {};
    const informationalNewViolations: Record<string, number> = {};
    const increasedViolations: Record<string, number> = {};
    const informationalIncreasedViolations: Record<string, number> = {};
    const decreasedViolations: Record<string, number> = {};

    for (const [ruleId, count] of Object.entries(currentCounts)) {
        const expectedCount = expected[ruleId] ?? 0;
        if (expectedCount === 0 && count > 0) {
            if (isBlocking(ruleId)) {
                newViolations[ruleId] = count;
            } else {
                informationalNewViolations[ruleId] = count;
            }
        } else if (count > expectedCount) {
            if (isBlocking(ruleId)) {
                increasedViolations[ruleId] = count - expectedCount;
            } else {
                informationalIncreasedViolations[ruleId] = count - expectedCount;
            }
        } else if (count < expectedCount) {
            decreasedViolations[ruleId] = expectedCount - count;
        }
    }

    // Rules that existed in baseline but now have 0 violations (fully fixed)
    for (const [ruleId, expectedCount] of Object.entries(expected)) {
        if (!(ruleId in currentCounts) && expectedCount > 0) {
            decreasedViolations[ruleId] = expectedCount;
        }
    }

    const passed = Object.keys(newViolations).length === 0 && Object.keys(increasedViolations).length === 0;

    return {
        passed,
        newViolations,
        increasedViolations,
        informationalNewViolations,
        informationalIncreasedViolations,
        decreasedViolations,
    };
}

/**
 * Format a baseline comparison failure message.
 * Includes severity level ([critical]/[serious]/[moderate]/[minor]) for each rule
 * so the impact is visible without reading the full report.
 *
 * @param pageKey - Composite page/viewport key, e.g. 'plp/desktop'.
 * @param comparison - Diff produced by compareWithBaseline.
 * @param results - Raw scan results, used to look up per-rule severity.
 */
export function formatBaselineFailure(
    pageKey: string,
    comparison: BaselineComparison,
    results: A11yScanResults
): string {
    const ruleImpact = buildRuleImpactMap(results.violations);
    const lines: string[] = [`New accessibility violations detected on ${pageKey}:`];

    if (Object.keys(comparison.newViolations).length > 0) {
        lines.push('\nBlocking — new rules with violations (not in baseline):');
        for (const [ruleId, count] of Object.entries(comparison.newViolations)) {
            const impact = ruleImpact[ruleId] ?? 'unknown';
            lines.push(`  - ${ruleId} [${impact}]: ${count} violation${count !== 1 ? 's' : ''}`);
        }
    }

    if (Object.keys(comparison.increasedViolations).length > 0) {
        lines.push('\nBlocking — increased violations (more than baseline):');
        for (const [ruleId, increase] of Object.entries(comparison.increasedViolations)) {
            const impact = ruleImpact[ruleId] ?? 'unknown';
            lines.push(`  - ${ruleId} [${impact}]: +${increase} new violation${increase !== 1 ? 's' : ''}`);
        }
    }

    const hasInformational =
        Object.keys(comparison.informationalNewViolations).length > 0 ||
        Object.keys(comparison.informationalIncreasedViolations).length > 0;

    if (hasInformational) {
        lines.push('\nInformational (moderate/minor — tracked but not blocking):');
        for (const [ruleId, count] of Object.entries(comparison.informationalNewViolations)) {
            const impact = ruleImpact[ruleId] ?? 'unknown';
            lines.push(`  - ${ruleId} [${impact}]: ${count} violation${count !== 1 ? 's' : ''} (new)`);
        }
        for (const [ruleId, increase] of Object.entries(comparison.informationalIncreasedViolations)) {
            const impact = ruleImpact[ruleId] ?? 'unknown';
            lines.push(`  - ${ruleId} [${impact}]: +${increase} (increased)`);
        }
    }

    if (Object.keys(comparison.decreasedViolations).length > 0) {
        lines.push('\nImproved violations (consider updating baseline with pnpm a11y:update-baseline):');
        for (const [ruleId, decrease] of Object.entries(comparison.decreasedViolations)) {
            lines.push(`  - ${ruleId}: -${decrease} (improvement)`);
        }
    }

    return lines.join('\n');
}

// =============================================================================
// Markdown report
// =============================================================================

/**
 * Generate a Markdown accessibility report from collected scan results.
 *
 * @param allResults - Map of `pageKey/viewport` → scan results.
 * @returns Markdown string suitable for writing to a file.
 */
export function formatMarkdownReport(allResults: Record<string, A11yScanResults>): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const lines: string[] = [
        '# Accessibility Scan Report',
        '',
        `**Generated:** ${date} ${time}`,
        `**Standard:** ${REPORTING_STANDARD} (${REPORTING_TAGS.join(', ')})`,
        `**CI gate:** ${WCAG_STANDARD} critical/serious only (${WCAG_TAGS.join(', ')}). This report is wider than what blocks merges.`,
        '',
        '## Severity Legend',
        '',
        '| Level | Meaning |',
        '|-------|---------|',
        '| `critical` | Blocks access entirely for users with disabilities |',
        '| `serious` | Creates significant barriers; should be fixed quickly |',
        '| `moderate` | Creates difficulty but workarounds may exist |',
        '| `minor` | Low impact; fix when convenient |',
        '',
        '## Summary',
        '',
        '| Page | Viewport | Critical | Serious | Moderate | Minor | Total | Needs review |',
        '|------|----------|----------|---------|----------|-------|-------|--------------|',
    ];

    const impactOrder: Array<keyof A11yScanResults['violationsByImpact']> = [
        'critical',
        'serious',
        'moderate',
        'minor',
    ];

    for (const [key, results] of Object.entries(allResults)) {
        const slashIdx = key.indexOf('/');
        const page = slashIdx >= 0 ? key.slice(0, slashIdx) : key;
        const viewport = slashIdx >= 0 ? key.slice(slashIdx + 1) : '';
        const { critical, serious, moderate, minor } = results.violationsByImpact;
        const countNodes = (vs: AxeViolation[]) => vs.reduce((sum, v) => sum + v.nodes.length, 0);
        const total = countNodes(results.violations);
        // `incomplete` = axe could not decide automatically; a human must review.
        // These never block, but they are the highest-value pointers for a manual tester.
        const needsReview = countNodes(results.incomplete ?? []);
        lines.push(
            `| ${page} | ${viewport} | ${countNodes(critical)} | ${countNodes(serious)} | ${countNodes(moderate)} | ${countNodes(minor)} | ${total} | ${needsReview} |`
        );
    }

    lines.push('');

    // Per-page detail sections (pages with violations OR items needing manual review)
    for (const [key, results] of Object.entries(allResults)) {
        const incomplete = results.incomplete ?? [];
        if (results.violations.length === 0 && incomplete.length === 0) continue;

        lines.push(`## ${key}`);
        lines.push('');

        for (const impact of impactOrder) {
            const group = results.violationsByImpact[impact];
            if (group.length === 0) continue;

            lines.push(`### ${impact.toUpperCase()}`);
            lines.push('');

            for (const violation of group) {
                lines.push(`#### \`${violation.id}\``);
                lines.push('');
                lines.push(`**Description:** ${violation.description}`);
                if (violation.helpUrl) {
                    lines.push(`**Help:** ${violation.helpUrl}`);
                }
                lines.push('');
                lines.push(`**Affected elements (${violation.nodes.length}):**`);
                lines.push('');

                for (const node of violation.nodes) {
                    lines.push(`- Selector: \`${node.target.join(', ')}\``);
                    if (node.html) {
                        lines.push('  ```html');
                        lines.push(`  ${node.html}`);
                        lines.push('  ```');
                    }
                }
                lines.push('');
            }
        }

        // Needs-review section: axe returned these as `incomplete` — it could not
        // decide automatically, so a human must verify. Non-blocking, but this is
        // exactly where the manual/AT audit findings tend to live (e.g. contrast on
        // gradients, ambiguous aria). Surfaced here so a tester has a worklist.
        if (incomplete.length > 0) {
            const totalIncompleteNodes = incomplete.reduce((sum, v) => sum + v.nodes.length, 0);
            lines.push(
                `### NEEDS MANUAL REVIEW (${totalIncompleteNodes} element${totalIncompleteNodes !== 1 ? 's' : ''})`
            );
            lines.push('');
            lines.push(
                '_axe could not determine pass/fail automatically. Verify these by hand. They do not block CI._'
            );
            lines.push('');
            for (const item of incomplete) {
                lines.push(`#### \`${item.id}\` [${item.impact ?? 'needs review'}]`);
                lines.push('');
                lines.push(`**Description:** ${item.description}`);
                if (item.helpUrl) {
                    lines.push(`**Help:** ${item.helpUrl}`);
                }
                lines.push('');
                lines.push(`**Elements to check (${item.nodes.length}):**`);
                lines.push('');
                const preview = item.nodes.slice(0, 10);
                for (const node of preview) {
                    lines.push(`- Selector: \`${node.target.join(', ')}\``);
                }
                if (item.nodes.length > 10) {
                    lines.push(`- ... and ${item.nodes.length - 10} more`);
                }
                lines.push('');
            }
        }
    }

    return lines.join('\n');
}
