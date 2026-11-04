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
import { type AuditResult, SEVERITIES, type Severity } from '../types';
import { categoryId, evidenceSource, findings as findingsOf } from '../lib/audit';
import {
    CORE_METRICS,
    METRIC_TARGETS,
    PAGE_NAMES,
    budgetBands,
    metric,
    metricState,
    type MetricState,
} from '../lib/playhouse';
import { Card, Icon } from '../lib/slds';
import { stateTone, toneClass } from '../lib/tone';
import { cn } from '../lib/cn';
import { AiBadge } from '../components/AiBadge';
import { PageCard } from '../components/PageCard';
import { SeverityBadge } from '../components/SeverityBadge';
import { CategoryCard, type CategorySummary } from '../components/CategoryCard';
import { InfoPopover } from '../components/InfoPopover';
import { LaunchReadiness } from '../components/LaunchReadiness';

// Short header for the budget grid: "Product / PDP" → "PDP", "Home" → "Home".
const shortName = (label: string): string => (PAGE_NAMES[label] ?? label).split(' / ').pop() ?? label;

const emptyCounts = (): Record<Severity, number> =>
    Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<Severity, number>;

export function Overview({
    result,
    onNavigateCategory,
    onShowManualReview,
}: {
    result: AuditResult;
    onNavigateCategory: (categoryId: string) => void;
    onShowManualReview: () => void;
}) {
    const findings = findingsOf(result);

    // Performance budget = every core metric measured on every captured page.
    // metricState returns undefined when unmeasured, so those cells count toward
    // none of the pass/warn/fail tallies. Only `fail` blocks launch — `warn` is
    // over budget but within tolerance.
    const budgetRows = CORE_METRICS.map((label) => ({
        label,
        target: METRIC_TARGETS[label],
        cells: result.pages.map((page) => ({
            page,
            display: metric(page, label)?.display ?? '—',
            state: metricState(page, label),
        })),
    }));
    const allCells = budgetRows.flatMap((row) => row.cells);
    const passing = allCells.filter((cell) => cell.state === 'pass').length;
    const warning = allCells.filter((cell) => cell.state === 'warn').length;
    const failing = allCells.filter((cell) => cell.state === 'fail').length;
    const measured = passing + warning + failing;
    const unmeasured = allCells.length - measured;
    const gateSummary = [
        `${passing} pass`,
        ...(warning ? [`${warning} warn`] : []),
        `${failing} fail`,
        ...(unmeasured ? [`${unmeasured} n/a`] : []),
    ].join(' · ');

    const categories: CategorySummary[] = result.catalog.categories.map((category) => {
        const items = findings.filter((item) => categoryId(item) === category.id);
        const counts = emptyCounts();
        for (const item of items) counts[(item.severity ?? 'info') as Severity] += 1;
        return {
            id: category.id,
            title: category.title,
            total: items.length,
            counts,
            topLine:
                items[0]?.title ??
                (category.ruleIds.length ? 'No confirmed findings' : 'No codified rules — coverage gap'),
        };
    });

    return (
        <div className="audit-stack">
            <div className="slds-grid slds-wrap slds-gutters_small audit-row-stretch">
                <div className={cn('slds-col slds-size_1-of-1', result.pages.length && 'slds-large-size_1-of-2')}>
                    <LaunchReadiness result={result} className="audit-fill" onShowManualReview={onShowManualReview} />
                </div>

                {result.pages.length ? (
                    <div className="slds-col slds-size_1-of-1 slds-large-size_1-of-2">
                        <Card
                            className="audit-fill"
                            heading="Performance budget"
                            icon={<Icon category="standard" name="metrics" size="small" />}
                            headerActions={
                                <span className="slds-grid slds-grid_vertical-align-center audit-gap_x-small">
                                    <span className="slds-text-body_small slds-text-color_weak slds-text-font_monospace">
                                        {gateSummary}
                                    </span>
                                    <InfoPopover
                                        label="How the performance budget is scored"
                                        heading="How each cell is scored"
                                        fit>
                                        <BudgetLegend />
                                    </InfoPopover>
                                </span>
                            }
                            bodyClassName="slds-card__body_inner">
                            <table className="audit-budget" aria-label="Performance budget by page">
                                <thead>
                                    <tr>
                                        <th scope="col" className="audit-budget__metric">
                                            <span className="slds-assistive-text">Metric</span>
                                        </th>
                                        {result.pages.map((page) => (
                                            <th
                                                key={page.label}
                                                scope="col"
                                                className="slds-text-title_bold slds-truncate">
                                                {shortName(page.label)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {budgetRows.map((row) => (
                                        <tr key={row.label}>
                                            <th scope="row" className="audit-budget__metric">
                                                <div className="slds-text-title_bold">{row.label}</div>
                                                <div className="slds-text-body_small slds-text-color_weak">
                                                    ≤ {row.target}
                                                </div>
                                            </th>
                                            {row.cells.map((cell) => (
                                                <td key={cell.page.label}>
                                                    <BudgetCell display={cell.display} state={cell.state} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    </div>
                ) : null}
            </div>

            <section aria-labelledby="overview-categories">
                <h2 id="overview-categories" className="slds-text-heading_small slds-m-bottom_small">
                    Findings by category
                </h2>
                <div className="audit-tile-grid">
                    {categories.map((category) => (
                        <CategoryCard
                            key={category.id}
                            category={category}
                            onSelect={() => onNavigateCategory(category.id)}
                        />
                    ))}
                </div>
            </section>

            {result.pages.length ? (
                <section aria-labelledby="overview-pages">
                    <h2 id="overview-pages" className="slds-text-heading_small slds-m-bottom_small">
                        Critical entry pages
                    </h2>
                    <div className="audit-tile-grid audit-tile-grid_wide">
                        {result.pages.map((page) => (
                            <PageCard key={page.label} page={page} />
                        ))}
                    </div>
                </section>
            ) : null}

            <Card
                heading="Highest-severity fixes, ranked"
                icon={<Icon category="standard" name="task" size="small" />}
                headerActions={<AiBadge />}>
                {findings.length ? (
                    <table
                        className="slds-table slds-table_cell-buffer slds-table_bordered slds-table_fixed-layout"
                        aria-label="Ranked fixes">
                        <thead>
                            <tr className="slds-line-height_reset">
                                <th scope="col" className="audit-col_rank">
                                    <div className="slds-truncate">#</div>
                                </th>
                                <th scope="col">
                                    <div className="slds-truncate">Recommended fix</div>
                                </th>
                                <th scope="col" className="audit-col_severity">
                                    <div className="slds-truncate">Severity</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {findings.slice(0, 6).map((item, index) => (
                                <tr key={item.ruleId} className="slds-hint-parent">
                                    <td className="slds-text-color_weak">{index + 1}</td>
                                    <th scope="row" className="slds-cell-wrap">
                                        <div>{item.remediation ?? item.title}</div>
                                        <div
                                            className={cn(
                                                'slds-text-body_small slds-text-color_weak slds-truncate',
                                                (item.evidence[0]?.type ?? 'source') === 'source' &&
                                                    'slds-text-font_monospace'
                                            )}>
                                            {evidenceSource(item.evidence[0]) || item.ruleId}
                                        </div>
                                    </th>
                                    <td>
                                        <SeverityBadge severity={(item.severity ?? 'info') as Severity}>
                                            {item.severity ?? 'review'}
                                        </SeverityBadge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="slds-p-horizontal_medium slds-text-align_center slds-text-color_weak">
                        No ranked findings.
                    </p>
                )}
            </Card>
        </div>
    );
}

// The popover content behind the "Performance budget" hint: the exact
// pass/warn/fail boundary for every metric, plus how the bands drive launch.
function BudgetLegend() {
    return (
        <div>
            <table className="slds-table slds-table_bordered slds-no-row-hover audit-legend">
                <thead>
                    <tr className="slds-line-height_reset">
                        <th scope="col">Metric</th>
                        <th scope="col" className={cn('audit-tone-text', toneClass('pass'))}>
                            Pass
                        </th>
                        <th scope="col" className={cn('audit-tone-text', toneClass('high'))}>
                            Warn
                        </th>
                        <th scope="col" className={cn('audit-tone-text', toneClass('critical'))}>
                            Fail
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {budgetBands().map((band) => (
                        <tr key={band.label}>
                            <th scope="row" className="slds-text-title_bold">
                                {band.label}
                            </th>
                            <td className="slds-text-font_monospace">{band.pass}</td>
                            <td className="slds-text-font_monospace">{band.warn}</td>
                            <td className="slds-text-font_monospace">{band.fail}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="slds-text-body_small slds-text-color_weak slds-m-top_small">
                A fail is reported as a finding to fix before launch; a warn is over budget but within tolerance.
                Budgets are fixed audit-config thresholds, not per-run values.
            </p>
        </div>
    );
}

// A tinted budget cell: green within target, amber over budget but within
// tolerance, red beyond it; unmeasured cells stay neutral.
function BudgetCell({ display, state }: { display: string; state: MetricState | undefined }) {
    return (
        <div className={cn('audit-budget__cell', toneClass(state ? stateTone(state) : 'info'))}>
            <span className="audit-budget__value">{display}</span>
            {/* The tone carries the state visually; screen readers still need it as text. */}
            <span className="slds-assistive-text">{state ?? 'n/a'}</span>
        </div>
    );
}
