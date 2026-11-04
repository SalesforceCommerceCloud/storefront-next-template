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
import { z } from 'zod';
import { isFailedRow, isMeasured, measuredRun } from '../measured-run';
import type { PreparedRuleResult, RulePreparationFunction } from '../preparation';

/** Budgets are checked against the mobile cold-cache median, the cell the dashboard leads with. */
const CELL = { formFactor: 'mobile', cacheState: 'cold' } as const;

const summarySchema = z
    .object({
        cells: z.array(
            z
                .object({
                    formFactor: z.string(),
                    cacheState: z.string(),
                    medianRun: z.record(z.string(), z.unknown()),
                })
                .passthrough()
        ),
        runs: z
            .array(
                z
                    .object({
                        formFactor: z.string(),
                        cacheState: z.string(),
                        row: z.record(z.string(), z.unknown()).optional(),
                    })
                    .passthrough()
            )
            .optional()
            .default([]),
    })
    .passthrough();

export const dataSchema = z
    .object({
        metric: z.string(),
        threshold: z.number(),
        cell: z.string(),
        /** `unmeasuredRuns`: runs Playhouse could not measure, left out of `value` and `runs`. */
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    value: z.number(),
                    threshold: z.number(),
                    runs: z.array(z.number()),
                    unmeasuredRuns: z.number(),
                })
                .strict()
        ),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;

type Budget = {
    metric: 'lcp' | 'tbt' | 'cls' | 'ttfb';
    label: string;
    threshold: number;
    format: (value: number) => string;
    severityForFailure?: (value: number) => 'low' | 'medium' | 'high' | 'critical';
    validValue?: (value: number) => boolean;
    includeSpread?: boolean;
    measurementLabel?: string;
};

const isCell = (cell: { formFactor: string; cacheState: string }): boolean =>
    cell.formFactor === CELL.formFactor && cell.cacheState === CELL.cacheState;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A rule script that passes when every page's mobile/cold median is at or under the threshold. */
export function metricBudget(budget: Budget): RulePreparationFunction<Data> {
    return async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
        const measured: Data['pages'] = [];
        const skipped: Data['skipped'] = [];
        const evidence = [];
        for (const page of pages) {
            const summary = await playhouse.readJson(page.label, 'summary.json', summarySchema);
            const index = summary?.cells.findIndex(isCell) ?? -1;
            if (index < 0) {
                skipped.push({
                    page: page.label,
                    reason: summary
                        ? `No ${CELL.formFactor}/${CELL.cacheState} median ${budget.label} in summary.json.`
                        : 'summary.json is missing.',
                });
                continue;
            }
            const eligible = (run: Record<string, unknown>): boolean => {
                const value = run[budget.metric];
                return isMeasured(run) && finite(value) && Boolean(budget.validValue?.(value));
            };
            const representative = budget.validValue
                ? measuredRun(summary, index, eligible)
                : measuredRun(summary, index);
            if (!representative) {
                const requirement = budget.validValue ? `a positive LCP and valid ${budget.label}` : 'a positive LCP';
                skipped.push({
                    page: page.label,
                    reason: `Not measured: no ${CELL.formFactor}/${CELL.cacheState} run in summary.json has ${requirement}.`,
                });
                continue;
            }
            const value = representative.run[budget.metric];
            if (!finite(value)) {
                skipped.push({
                    page: page.label,
                    reason: `No ${CELL.formFactor}/${CELL.cacheState} median ${budget.label} in summary.json.`,
                });
                continue;
            }
            const runs = (summary?.runs ?? [])
                .filter(
                    (run) =>
                        isCell(run) &&
                        (budget.validValue ? Boolean(run.row && eligible(run.row)) : !isFailedRow(run.row))
                )
                .map((run) => run.row?.[budget.metric])
                .filter(finite);
            measured.push({
                page: page.label,
                value,
                threshold: budget.threshold,
                runs,
                unmeasuredRuns: representative.unmeasuredRuns,
            });
            const left = representative.unmeasuredRuns
                ? `; ${representative.unmeasuredRuns} run${representative.unmeasuredRuns === 1 ? '' : 's'} not measured, left out`
                : '';
            const spread =
                budget.includeSpread && runs.length > 1
                    ? `; measured spread ${budget.format(Math.min(...runs))}–${budget.format(Math.max(...runs))}`
                    : '';
            evidence.push({
                type: 'playhouse' as const,
                page: page.label,
                artifact: 'summary.json',
                pointer: `${representative.pointer}/${budget.metric}`,
                value: `${budget.label} ${budget.format(value)} (budget ${budget.format(budget.threshold)}${spread}${left})`,
            });
        }
        const data: Data = {
            metric: budget.metric,
            threshold: budget.threshold,
            cell: `${CELL.formFactor}/${CELL.cacheState}`,
            pages: measured,
            skipped,
        };
        if (!measured.length) return { data };
        const over = measured.filter((entry) => entry.value > budget.threshold);
        const list = (entries: Data['pages']): string =>
            entries.map((entry) => `${entry.page} ${budget.format(entry.value)}`).join(', ');
        const severity =
            over.length && budget.severityForFailure
                ? budget.severityForFailure(Math.max(...over.map((entry) => entry.value)))
                : undefined;
        const measurement = budget.measurementLabel ?? 'median';
        return {
            data,
            decision: over.length
                ? {
                      status: 'fail',
                      ...(severity ? { severity } : {}),
                      summary: `Mobile cold-cache ${measurement} ${budget.label} is over ${budget.format(budget.threshold)} on ${list(over)}.`,
                      evidence: evidence.filter((item) => over.some((entry) => entry.page === item.page)),
                  }
                : {
                      status: 'pass',
                      summary: `Mobile cold-cache ${measurement} ${budget.label} is within ${budget.format(budget.threshold)} on every measured page (${list(measured)}).`,
                      evidence,
                  },
        };
    };
}

export const milliseconds = (value: number): string => `${Math.round(value)} ms`;
