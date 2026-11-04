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
import type { PlayhouseArtifactReader } from '../../../../evidence';
import type { PreparedRuleResult, RulePreparationFunction } from '../../../../preparation';
import {
    HIDDEN_ELEMENTS_MIN,
    HIDDEN_SHARE_MIN,
    hiddenRootSchema,
    isHiddenMarkupCandidate,
    measureHiddenMarkup,
} from '../../../../rule-helpers/deferred-ui';

const FORM_FACTORS = ['mobile', 'desktop'] as const;
const PAGE_CONCURRENCY = 2;
const SAFE_RUN_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const summarySchema = z
    .object({
        runs: z
            .array(
                z
                    .object({
                        runId: z.string().optional(),
                        formFactor: z.string().optional(),
                        cacheState: z.string().optional(),
                        isMedian: z.boolean().optional(),
                    })
                    .passthrough()
            )
            .optional()
            .default([]),
    })
    .passthrough();

const cellSchema = z
    .object({
        cell: z.enum(['mobile-cold', 'desktop-cold']),
        runId: z.string(),
        artifact: z.string(),
        bodyElements: z.number().int().positive(),
        hiddenElements: z.number().int().nonnegative(),
        hiddenShare: z.number().min(0).max(1),
        candidate: z.boolean(),
        largestHiddenRoots: z.array(hiddenRootSchema),
    })
    .strict();

export const dataSchema = z
    .object({
        thresholds: z
            .object({ hiddenElements: z.number().int().positive(), hiddenShare: z.number().min(0).max(1) })
            .strict(),
        pages: z.array(z.object({ page: z.string(), cells: z.array(cellSchema) }).strict()),
        skipped: z.array(z.object({ page: z.string(), cell: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type Cell = z.infer<typeof cellSchema>;

function runIdFor(
    summary: z.infer<typeof summarySchema> | undefined,
    formFactor: (typeof FORM_FACTORS)[number]
): string {
    const runs = (summary?.runs ?? []).filter(
        (run) => run.runId && SAFE_RUN_ID.test(run.runId) && run.formFactor === formFactor && run.cacheState === 'cold'
    );
    return (runs.find((run) => run.isMedian) ?? runs[0])?.runId ?? `${formFactor}-cold-1`;
}

async function measureCell(
    playhouse: PlayhouseArtifactReader,
    page: string,
    summary: z.infer<typeof summarySchema> | undefined,
    formFactor: (typeof FORM_FACTORS)[number]
): Promise<Cell | { cell: string; reason: string }> {
    const cell = `${formFactor}-cold` as Cell['cell'];
    const runId = runIdFor(summary, formFactor);
    const artifact = `runs/${runId}/main-document.html`;
    let html: string | undefined;
    try {
        html = await playhouse.readText(page, artifact, 10 * 1024 * 1024);
    } catch {
        return { cell, reason: `${artifact} could not be read safely.` };
    }
    if (html === undefined) return { cell, reason: `${artifact} is missing.` };
    let measured;
    try {
        measured = measureHiddenMarkup(html);
    } catch {
        return { cell, reason: `${artifact} could not be measured safely.` };
    }
    if (!measured.bodyElements) return { cell, reason: `${artifact} has no body elements.` };
    const viewport = measured[formFactor];
    return {
        cell,
        runId,
        artifact,
        bodyElements: measured.bodyElements,
        hiddenElements: viewport.hiddenElements,
        hiddenShare: viewport.share,
        candidate: isHiddenMarkupCandidate(viewport.hiddenElements, measured.bodyElements),
        largestHiddenRoots: viewport.largestRoots,
    };
}

const run: RulePreparationFunction<Data> = async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
    const data: Data = {
        thresholds: { hiddenElements: HIDDEN_ELEMENTS_MIN, hiddenShare: HIDDEN_SHARE_MIN },
        pages: [],
        skipped: [],
    };
    const evidence = [];
    let candidate = false;
    let incomplete = false;
    const measuredPages = [];
    for (let offset = 0; offset < pages.length; offset += PAGE_CONCURRENCY) {
        const batch = await Promise.all(
            pages.slice(offset, offset + PAGE_CONCURRENCY).map(async (page) => {
                const summary = await playhouse.readJson(page.label, 'summary.json', summarySchema);
                const cells = await Promise.all(
                    FORM_FACTORS.map((formFactor) => measureCell(playhouse, page.label, summary, formFactor))
                );
                return { page, cells };
            })
        );
        measuredPages.push(...batch);
    }
    for (const { page, cells: results } of measuredPages) {
        const cells: Cell[] = [];
        for (const result of results) {
            if ('reason' in result) {
                incomplete = true;
                data.skipped.push({ page: page.label, cell: result.cell, reason: result.reason });
                continue;
            }
            cells.push(result);
            candidate ||= result.candidate;
            evidence.push({
                type: 'playhouse' as const,
                page: page.label,
                artifact: result.artifact,
                value: `${result.cell}: ${result.hiddenElements} of ${result.bodyElements} body elements hidden (${Math.round(result.hiddenShare * 100)}%; candidate gate ${HIDDEN_ELEMENTS_MIN} and ${Math.round(HIDDEN_SHARE_MIN * 100)}%).`,
            });
        }
        data.pages.push({ page: page.label, cells });
    }
    if (!evidence.length || incomplete || candidate) return { data };
    return {
        data,
        decision: {
            status: 'pass',
            summary: `Server-rendered hidden markup stays below the candidate gate on every measured page.`,
            evidence,
        },
    };
};

export default run;
