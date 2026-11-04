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
import { Fragment, useId, useMemo, useState } from 'react';
import { type AuditResult, SEVERITIES, type Severity } from '../types';
import {
    categoryId,
    categoryTitle,
    evidencePages,
    evidenceSource,
    type Evaluation,
    type Observation,
} from '../lib/audit';
import { PAGE_NAMES } from '../lib/playhouse';
import { Button, Card, Icon } from '../lib/slds';
import { cn } from '../lib/cn';
import { SeverityBadge } from './SeverityBadge';
import { AiBadge } from './AiBadge';
import { EvidenceList } from './Evidence';
import { PicklistFilter, type PicklistOption } from './PicklistFilter';
import { withCode } from '../lib/text';

// One row model for both codified evaluations and free-form observations, so a
// single filterable table covers a category or the whole audit.
type Row = { kind: 'evaluation'; item: Evaluation } | { kind: 'observation'; item: Observation };

const ALL = 'all';
const SITE_WIDE = 'site-wide';
const COLUMN_COUNT = 6;

const rowKey = (row: Row, index: number): string => (row.kind === 'evaluation' ? `e:${row.item.ruleId}` : `o:${index}`);
const rowSeverity = (row: Row): Severity =>
    row.kind === 'observation' ? 'info' : ((row.item.severity ?? 'info') as Severity);
const rowCategory = (row: Row): string | undefined =>
    row.kind === 'observation' ? row.item.category : categoryId(row.item);
const rowPages = (row: Row): string[] => evidencePages(row.item.evidence);

function rowConfidence(row: Row): string {
    if (row.kind === 'observation') return 'Manual';
    if (row.item.disposition === 'not-verified') return 'Needs manual review';
    return row.item.method === 'script' ? 'Deterministic' : 'AI-evaluated';
}

// Badge text for anything that is not a finding, whose badge shows its severity.
const OUTCOME_LABELS: Partial<Record<string, string>> = {
    pass: 'pass',
    'not-applicable': 'n/a',
    'not-verified': 'not verified',
};

// Outcome filter choices, in display order; only outcomes present in the rows are offered.
const OUTCOME_FILTERS: Array<{ id: string; label: string }> = [
    { id: 'finding', label: 'Findings' },
    { id: 'not-verified', label: 'Not verified' },
    { id: 'pass', label: 'Passed' },
    { id: 'not-applicable', label: 'Not applicable' },
    { id: 'observation', label: 'Observations' },
];
const rowOutcome = (row: Row): string => (row.kind === 'observation' ? 'observation' : row.item.disposition);

const SEVERITY_RANK = new Map(SEVERITIES.map((severity, index) => [severity, index]));
const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export function FindingsTable({
    result,
    evaluations,
    observations,
    heading = 'Findings',
    showCategoryFilter = false,
    initialOutcome = ALL,
}: {
    result: AuditResult;
    evaluations: Evaluation[];
    observations: Observation[];
    heading?: string;
    showCategoryFilter?: boolean;
    /** Opens the table pre-filtered, e.g. to the rules that need a manual review. */
    initialOutcome?: string;
}) {
    const rows = useMemo<Row[]>(
        () => [
            ...evaluations.map((item): Row => ({ kind: 'evaluation', item })),
            ...observations.map((item): Row => ({ kind: 'observation', item })),
        ],
        [evaluations, observations]
    );

    const [severity, setSeverity] = useState<string>(ALL);
    const [outcome, setOutcome] = useState(initialOutcome);
    const [category, setCategory] = useState(ALL);
    const [page, setPage] = useState(ALL);
    const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

    // Filter options are derived from the rows actually present, never hard-coded,
    // so a category with no page-scoped findings simply offers no page choices.
    const severityOptions: PicklistOption[] = [
        { id: ALL, label: 'All severities' },
        ...SEVERITIES.map((value) => ({ id: value, label: capitalize(value) })),
    ];
    const categoryOptions = useMemo<PicklistOption[]>(
        () => [
            { id: ALL, label: 'All categories' },
            ...[...new Set(rows.map(rowCategory).filter((id): id is string => Boolean(id)))].map((id) => ({
                id,
                label: categoryTitle(result, id),
            })),
        ],
        [rows, result]
    );
    const outcomeOptions = useMemo<PicklistOption[]>(() => {
        const present = new Set(rows.map(rowOutcome));
        return [{ id: ALL, label: 'All outcomes' }, ...OUTCOME_FILTERS.filter((option) => present.has(option.id))];
    }, [rows]);
    const pageOptions = useMemo<PicklistOption[]>(() => {
        const labels = new Set<string>();
        let anyCrossPage = false;
        for (const row of rows) {
            const pages = rowPages(row);
            if (pages.length) pages.forEach((label) => labels.add(label));
            else anyCrossPage = true;
        }
        return [
            { id: ALL, label: 'Any page' },
            ...[...labels].map((label) => ({ id: label, label: PAGE_NAMES[label] ?? label })),
            ...(anyCrossPage ? [{ id: SITE_WIDE, label: 'Site-wide' }] : []),
        ];
    }, [rows]);

    const visible = useMemo(() => {
        return rows
            .filter((row) => outcome === ALL || rowOutcome(row) === outcome)
            .filter((row) => severity === ALL || rowSeverity(row) === severity)
            .filter((row) => !showCategoryFilter || category === ALL || rowCategory(row) === category)
            .filter((row) => {
                if (page === ALL) return true;
                const pages = rowPages(row);
                return page === SITE_WIDE ? pages.length === 0 : pages.includes(page);
            })
            .toSorted(
                (a, b) =>
                    (SEVERITY_RANK.get(rowSeverity(a)) ?? 99) - (SEVERITY_RANK.get(rowSeverity(b)) ?? 99) ||
                    a.item.title.localeCompare(b.item.title)
            );
    }, [rows, outcome, severity, category, page, showCategoryFilter]);

    const toggle = (key: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <Card
            heading={`${heading} (${rows.length})`}
            icon={<Icon category="standard" name="incident" size="small" />}
            headerActions={
                <span className="slds-text-body_small slds-text-color_weak">
                    Showing {visible.length} of {rows.length}
                </span>
            }>
            <div className="audit-filters slds-p-horizontal_medium slds-p-bottom_small">
                {outcomeOptions.length > 2 ? (
                    <PicklistFilter label="Outcome" options={outcomeOptions} value={outcome} onChange={setOutcome} />
                ) : null}
                <PicklistFilter label="Severity" options={severityOptions} value={severity} onChange={setSeverity} />
                {showCategoryFilter && categoryOptions.length > 1 ? (
                    <PicklistFilter
                        label="Category"
                        options={categoryOptions}
                        value={category}
                        onChange={setCategory}
                    />
                ) : null}
                {pageOptions.length > 1 ? (
                    <PicklistFilter label="Page" options={pageOptions} value={page} onChange={setPage} />
                ) : null}
            </div>

            <table
                className="slds-table slds-table_cell-buffer slds-table_bordered slds-table_fixed-layout"
                aria-label={heading}>
                <thead>
                    <tr className="slds-line-height_reset">
                        <th scope="col" className="audit-col_toggle">
                            <span className="slds-assistive-text">Expand row</span>
                        </th>
                        <th scope="col" className="audit-col_severity">
                            <div className="slds-truncate">Severity</div>
                        </th>
                        <th scope="col">
                            <div className="slds-truncate">Finding</div>
                        </th>
                        <th scope="col" className="audit-col_meta">
                            <div className="slds-truncate">Category</div>
                        </th>
                        <th scope="col" className="audit-col_meta">
                            <div className="slds-truncate">Page</div>
                        </th>
                        <th scope="col" className="audit-col_source">
                            <div className="slds-truncate">Source</div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {visible.map((row, index) => (
                        <FindingRow
                            key={rowKey(row, index)}
                            row={row}
                            result={result}
                            open={open.has(rowKey(row, index))}
                            onToggle={() => toggle(rowKey(row, index))}
                        />
                    ))}
                    {visible.length === 0 ? (
                        <tr>
                            <td
                                colSpan={COLUMN_COUNT}
                                className="slds-text-align_center slds-text-color_weak slds-p-vertical_large">
                                No findings match the current filters.
                            </td>
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </Card>
    );
}

function FindingRow({
    row,
    result,
    open,
    onToggle,
}: {
    row: Row;
    result: AuditResult;
    open: boolean;
    onToggle: () => void;
}) {
    const detailId = useId();
    const passed = row.kind === 'evaluation' && row.item.disposition === 'pass';
    const badgeLabel =
        row.kind === 'observation' ? 'observation' : (OUTCOME_LABELS[row.item.disposition] ?? rowSeverity(row));
    const aiEvaluated = row.kind === 'evaluation' && row.item.method === 'ai';
    const pages = rowPages(row);
    const rowCat = rowCategory(row);
    const categoryLabel = rowCat ? categoryTitle(result, rowCat) : 'Cross-category';
    const source = evidenceSource(row.item.evidence[0]);
    const pageLabel = pageColumnLabel(pages, result);

    return (
        <Fragment>
            <tr className={cn('slds-hint-parent', open && 'audit-row_open')}>
                <td className="audit-col_toggle">
                    <Button
                        assistiveText={{ icon: open ? 'Collapse details' : 'Expand details' }}
                        iconCategory="utility"
                        iconName={open ? 'chevrondown' : 'chevronright'}
                        iconVariant="bare"
                        variant="icon"
                        onClick={onToggle}
                        aria-expanded={open}
                        aria-controls={detailId}
                    />
                </td>
                <td>
                    <SeverityBadge severity={passed ? 'pass' : rowSeverity(row)}>{badgeLabel}</SeverityBadge>
                </td>
                <th scope="row">
                    <div className="slds-grid slds-grid_vertical-align-center audit-gap_x-small">
                        <button
                            type="button"
                            className="slds-button audit-row-title slds-truncate"
                            onClick={onToggle}
                            title={row.item.title}>
                            {row.item.title}
                        </button>
                        {aiEvaluated ? <AiBadge>AI</AiBadge> : null}
                    </div>
                </th>
                <td>
                    <div className="slds-truncate" title={categoryLabel}>
                        {categoryLabel}
                    </div>
                </td>
                <td>
                    <div className="slds-truncate" title={pageLabel}>
                        {pageLabel}
                    </div>
                </td>
                <td>
                    <div
                        className={cn(
                            'slds-truncate slds-text-body_small slds-text-color_weak',
                            row.item.evidence[0]?.type === 'source' && 'slds-text-font_monospace'
                        )}
                        title={source}>
                        {source || '—'}
                    </div>
                </td>
            </tr>
            {open ? (
                <tr id={detailId} className="audit-detail-row">
                    <td colSpan={COLUMN_COUNT} className="slds-cell-wrap">
                        <div className="slds-grid slds-wrap slds-gutters slds-p-vertical_small">
                            <div className="slds-col slds-size_1-of-1 slds-large-size_8-of-12">
                                {row.kind === 'evaluation' && row.item.description ? (
                                    <>
                                        <h4 className="slds-text-title_caps slds-m-bottom_x-small">What this checks</h4>
                                        <p className="audit-prose slds-m-bottom_medium">
                                            {withCode(row.item.description)}
                                        </p>
                                        <h4 className="slds-text-title_caps slds-m-bottom_x-small">Result</h4>
                                    </>
                                ) : null}
                                <p className="audit-prose">{row.item.summary}</p>
                                <h4 className="slds-text-title_caps slds-m-top_medium slds-m-bottom_x-small">
                                    Evidence
                                </h4>
                                <EvidenceList items={row.item.evidence} />
                                {row.kind === 'evaluation' && row.item.remediation ? (
                                    <>
                                        <h4 className="slds-text-title_caps slds-m-top_medium slds-m-bottom_x-small">
                                            Recommended fix
                                        </h4>
                                        <p className="audit-prose">{row.item.remediation}</p>
                                    </>
                                ) : null}
                            </div>
                            <div className="slds-col slds-size_1-of-1 slds-large-size_4-of-12">
                                <div className="slds-box slds-theme_default">
                                    <dl className="slds-list_stacked">
                                        {row.kind === 'evaluation' ? (
                                            <ReadonlyField label="Disposition" value={row.item.disposition} />
                                        ) : null}
                                        {row.kind === 'evaluation' ? (
                                            <ReadonlyField label="Rule" value={row.item.ruleId} mono />
                                        ) : null}
                                        <ReadonlyField label="Confidence" value={rowConfidence(row)} />
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            ) : null}
        </Fragment>
    );
}

/** Rules cite only the pages they flag, so evidence spanning every audited page reads as "All pages". */
function pageColumnLabel(pages: string[], result: AuditResult): string {
    if (!pages.length) return 'Site-wide';
    const audited = result.pages.map((page) => page.label);
    if (audited.length > 1 && audited.every((label) => pages.includes(label))) return 'All pages';
    return pages.map((label) => PAGE_NAMES[label] ?? label).join(', ');
}

/** Lightning read-only record field (label over static value). */
function ReadonlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="slds-form-element slds-form-element_readonly slds-form-element_stacked">
            <dt className="slds-form-element__label">{label}</dt>
            <dd
                className={cn(
                    'slds-form-element__control slds-form-element__static',
                    mono && 'slds-text-font_monospace'
                )}>
                {value}
            </dd>
        </div>
    );
}
