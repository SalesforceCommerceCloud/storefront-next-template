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
import type { Page } from './audit';
import { measuredRun } from '../../../measured-run';
import { asArray, asNumber, asObject, asText, formatMs, type JsonObject } from './format';

// Playhouse artifacts are loosely typed JSON. Everything here narrows
// defensively and returns undefined when data is absent — the UI then shows
// "—" rather than fabricating a value.

const artifact = (page: Page, name: string): JsonObject | undefined => asObject(page.playhouse.artifacts[name]);

export const objectsOf = (value: unknown): JsonObject[] =>
    asArray(value)
        .map(asObject)
        .filter((item): item is JsonObject => Boolean(item));

export const cells = (page: Page, name: string): JsonObject[] => objectsOf(artifact(page, name)?.cells);

const cellKey = (value: JsonObject): string => `${asText(value.formFactor) ?? ''}:${asText(value.cacheState) ?? ''}`;

/** Prefer the mobile cold-cache cell (worst realistic case), else the first. */
export function selectedCell(page: Page, name: string): JsonObject | undefined {
    const sorted = cells(page, name)
        .slice()
        .sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
    return sorted.find((item) => cellKey(item) === 'mobile:cold') ?? sorted[0];
}

/** The selected cell's representative run, leaving out runs Playhouse could not measure (undefined when none was). */
export function summaryRun(page: Page): JsonObject | undefined {
    const summary = artifact(page, 'summary.json');
    const cell = selectedCell(page, 'summary.json');
    return cell ? asObject(measuredRun(summary, asArray(summary?.cells).indexOf(cell))?.run) : undefined;
}

/** Number of mobile cold-cache runs Playhouse collected for the page (0 when unknown). */
export const mobileColdRunCount = (page: Page): number =>
    objectsOf(artifact(page, 'summary.json')?.runs).filter(
        (run) => run.formFactor === 'mobile' && run.cacheState === 'cold'
    ).length;

export interface Metric {
    display: string;
    value?: number;
}

export function metric(page: Page, label: string): Metric | undefined {
    const run = summaryRun(page);
    if (!run) return undefined;
    const key = label.toLowerCase();
    const value = asNumber(run[key]);
    if (value === undefined) return undefined;
    return { value, display: key === 'cls' ? value.toFixed(2) : formatMs(value) };
}

export const scoreOf = (page: Page): number | undefined => asNumber(summaryRun(page)?.score);

export const PAGE_NAMES: Record<string, string> = {
    home: 'Home',
    plp: 'Category / PLP',
    pdp: 'Product / PDP',
    cart: 'Cart',
    checkout: 'Checkout',
};

export const METRIC_TARGETS: Record<string, string> = { LCP: '2.5s', TBT: '200ms', CLS: '0.10', TTFB: '800ms' };
// Display strings for the warn ceiling, paired with METRIC_WARN_MAX below.
export const METRIC_WARN_TARGETS: Record<string, string> = { LCP: '4.0s', TBT: '600ms', CLS: '0.25', TTFB: '1.8s' };
export const CORE_METRICS = ['LCP', 'TBT', 'CLS', 'TTFB'] as const;

// Numeric "good ≤ target" thresholds (all four Core-metric proxies are
// lower-is-better) so a value can be colored against its budget.
const METRIC_THRESHOLD: Record<string, number> = { LCP: 2500, TBT: 200, CLS: 0.1, TTFB: 800 };

// A second, looser band above the target. A value between the target and this
// ceiling is over budget but not yet launch-blocking — a "warn". Both bands are
// fixed config constants (same provenance as the target), not per-run data.
const METRIC_WARN_MAX: Record<string, number> = { LCP: 4000, TBT: 600, CLS: 0.25, TTFB: 1800 };

/** True when the page's measured metric exceeds its launch target; undefined if unmeasured. */
export function metricIsBad(page: Page, label: string): boolean | undefined {
    const value = metric(page, label)?.value;
    const threshold = METRIC_THRESHOLD[label];
    if (value === undefined || threshold === undefined) return undefined;
    return value > threshold;
}

export type MetricState = 'pass' | 'warn' | 'fail';

/**
 * Three-state classification of a measured metric against its budget:
 * within target = pass, within the warn ceiling = warn, beyond it = fail.
 * Only `fail` blocks launch; `warn` is advisory. Undefined when unmeasured.
 */
export function metricState(page: Page, label: string): MetricState | undefined {
    const value = metric(page, label)?.value;
    const target = METRIC_THRESHOLD[label];
    const warnMax = METRIC_WARN_MAX[label];
    if (value === undefined || target === undefined) return undefined;
    if (value <= target) return 'pass';
    if (warnMax !== undefined && value <= warnMax) return 'warn';
    return 'fail';
}

export interface BudgetBand {
    label: string;
    pass: string;
    warn: string;
    fail: string;
}

/** The pass/warn/fail boundary strings per metric, for the budget legend. */
export function budgetBands(): BudgetBand[] {
    return CORE_METRICS.map((label) => ({
        label,
        pass: `≤ ${METRIC_TARGETS[label]}`,
        warn: `${METRIC_TARGETS[label]} – ${METRIC_WARN_TARGETS[label]}`,
        fail: `> ${METRIC_WARN_TARGETS[label]}`,
    }));
}

export function urlPath(value: string): string {
    try {
        const url = new URL(value);
        return `${url.pathname}${url.search}`;
    } catch {
        return value;
    }
}

/** Worst observed LCP and TBT across all pages, for the overview hero. */
export function worstMetrics(pages: Page[]): Array<{ label: string; value: string; detail: string }> {
    return (['LCP', 'TBT'] as const)
        .map((label) => {
            const key = label.toLowerCase();
            const values = pages
                .flatMap((page) =>
                    asArray(artifact(page, 'summary.json')?.cells).flatMap((value, index) => {
                        const cell = asObject(value);
                        // A cell where no run was measured has only Playhouse's placeholder zeros.
                        const representative = cell && measuredRun(artifact(page, 'summary.json'), index)?.run;
                        if (!cell || !representative) return [];
                        const max = asNumber(asObject(asObject(cell.stats)?.[key])?.max);
                        return [{ page, cell, value: max ?? asNumber(representative[key]) }];
                    })
                )
                .filter((item): item is typeof item & { value: number } => item.value !== undefined)
                .slice()
                .sort((a, b) => b.value - a.value);
            const worst = values[0];
            const cell = worst
                ? [asText(worst.cell.formFactor), asText(worst.cell.cacheState)].filter(Boolean).join(' ')
                : '';
            return {
                label: `Worst observed ${label}`,
                value: worst ? formatMs(worst.value) : '—',
                detail: worst
                    ? `${PAGE_NAMES[worst.page.label] ?? worst.page.label}${cell ? ` · ${cell}` : ''} · target ${METRIC_TARGETS[label]}`
                    : 'no measured value',
            };
        })
        .concat([{ label: 'Pages captured', value: String(pages.length), detail: 'Playhouse collections' }]);
}
