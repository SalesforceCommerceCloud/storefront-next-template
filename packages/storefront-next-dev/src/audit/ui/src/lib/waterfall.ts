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
import type { AuditResult, Waterfall, WaterfallStep } from '../types';

/** Kept in step with WATERFALL_RULE_ID in src/results.ts (a runtime value the UI can't import). */
export const WATERFALL_RULE_ID = 'performance/server-request-waterfall';

export type PageWaterfall = Waterfall['pages'][number];

type Evaluation = AuditResult['evaluations'][number];

/** The rule's evaluation and the traced server request graph for one page, if the AI supplied one. */
export function pageWaterfall(
    result: AuditResult,
    label: string
): { evaluation: Evaluation; waterfall: PageWaterfall } | undefined {
    const evaluation = result.evaluations.find((item) => item.ruleId === WATERFALL_RULE_ID);
    const waterfall = evaluation?.waterfall?.pages.find((entry) => entry.page === label);
    return evaluation && waterfall ? { evaluation, waterfall } : undefined;
}

/**
 * Round-trip step of each call: 0 when it starts with the request, otherwise
 * one past the deepest step it waits on. This is the chart's x-axis — there are
 * no per-call timings, only how many sequential awaits deep a call sits.
 */
export function depths(steps: readonly WaterfallStep[]): Map<string, number> {
    const byId = new Map(steps.map((step) => [step.id, step]));
    const depth = new Map<string, number>();
    const visit = (id: string): number => {
        const known = depth.get(id);
        if (known !== undefined) return known;
        const after = byId.get(id)?.after ?? [];
        const value = after.length ? 1 + Math.max(...after.map(visit)) : 0;
        depth.set(id, value);
        return value;
    };
    for (const step of steps) visit(step.id);
    return depth;
}

/** The longest run of blocking steps, each waiting on the previous one, in order. */
export function longestBlockingChain(steps: readonly WaterfallStep[]): string[] {
    const byId = new Map(steps.map((step) => [step.id, step]));
    const chain = new Map<string, string[]>();
    const visit = (id: string): string[] => {
        const known = chain.get(id);
        if (known) return known;
        let longest: string[] = [];
        for (const before of byId.get(id)?.after ?? []) {
            if (!byId.get(before)?.blocking) continue;
            const candidate = visit(before);
            if (candidate.length > longest.length) longest = candidate;
        }
        const value = [...longest, id];
        chain.set(id, value);
        return value;
    };
    let best: string[] = [];
    for (const step of steps) if (step.blocking && visit(step.id).length > best.length) best = visit(step.id);
    return best;
}

/**
 * Awaited calls chained after another data call, so each adds a round trip
 * before the shell. Waiting on middleware alone doesn't count; every loader
 * call does that. Streamed chains don't hold back the shell.
 */
export function blockingChains(steps: readonly WaterfallStep[]): Set<string> {
    const kind = new Map(steps.map((step) => [step.id, step.kind]));
    return new Set(
        steps
            .filter(
                (step) =>
                    step.kind !== 'render' && step.blocking && step.after.some((id) => kind.get(id) !== 'middleware')
            )
            .map((step) => step.id)
    );
}

/** Network calls only: middleware/loader steps with I/O count, the shell render does not. */
export const requestCount = (steps: readonly WaterfallStep[]): number =>
    steps.filter((step) => step.kind !== 'render').length;

/**
 * What the page's callout list shows: chains that hold back the shell first,
 * then any other call with a suggestion. A streamed chain with no suggestion
 * is left out — there is nothing to do about it.
 */
export function callouts(steps: readonly WaterfallStep[]): WaterfallStep[] {
    const chains = blockingChains(steps);
    return steps
        .filter((step) => chains.has(step.id) || step.opportunity)
        .slice()
        .sort((a, b) => Number(chains.has(b.id)) - Number(chains.has(a.id)));
}
