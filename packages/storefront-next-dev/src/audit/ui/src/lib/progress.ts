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
import type { StoredProgressEvent } from '../../../events';
import { SEVERITIES, type Severity } from '../types';

export type StepState = 'done' | 'running' | 'pending';

export interface StepMetric {
    key: string;
    value: string;
    bad?: boolean;
}

export interface StepCategory {
    name: string;
    evaluated: number;
    total: number;
    flagged: number;
}

export interface StepVM {
    id: string;
    title: string;
    detail?: string;
    state: StepState;
    startedAt?: string;
    durationMs?: number;
    /** Lighthouse page steps carry a score + metrics once complete. */
    score?: number;
    metrics?: StepMetric[];
    /** The rule-evaluation step carries per-category progress. */
    rules?: { evaluated: number; total: number; categories: StepCategory[] };
    /** List-style steps carry a one-line summary once complete. */
    summary?: string;
}

export interface FindingVM {
    id: string;
    severity: Severity;
    title: string;
    category?: string;
    source?: string;
}

export interface LogVM {
    at: string;
    level: 'info' | 'ok' | 'warn' | 'find';
    message: string;
}

export type RunStatus = 'preparing' | 'running' | 'complete' | 'error';

export interface RunningModel {
    status: RunStatus;
    /** True once we have seen a real run begin (distinguishes watch from view mode). */
    hasRun: boolean;
    startedAt?: string;
    completedAt?: string;
    target?: { url?: string; commit?: string; env?: string };
    steps: StepVM[];
    activeIndex: number;
    stepsComplete: number;
    findings: FindingVM[];
    counts: Record<Severity, number>;
    logs: LogVM[];
    finalScores: { label: string; score: number }[];
    guidance?: 'go' | 'go-with-fixes' | 'no-go';
    error?: string;
}

const zeroCounts = (): Record<Severity, number> =>
    Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;

const ms = (a: string, b: string): number => Math.max(0, new Date(b).getTime() - new Date(a).getTime());

/** "Lighthouse · Category / PLP" → "PLP"; used for the completion score rings. */
export function pageLabel(title: string): string {
    return (
        title
            .replace(/^Lighthouse ·\s*/, '')
            .split(' / ')
            .pop() ?? title
    );
}

export function reduceEvents(events: readonly StoredProgressEvent[]): RunningModel {
    const model: RunningModel = {
        status: 'preparing',
        hasRun: false,
        steps: [],
        activeIndex: 0,
        stepsComplete: 0,
        findings: [],
        counts: zeroCounts(),
        logs: [],
        finalScores: [],
    };
    const byId = new Map<string, StepVM>();
    let activeId: string | undefined;
    /** Whether the last run.error came from finalize (it has a stageId), which can be fixed and run again. */
    let resumable = false;

    for (const event of events) {
        // A completed run stays complete: a later finalize that fails doesn't undo its report. Only a new run.start
        // (a log passed with `--events` can hold several runs) begins again.
        if (model.status === 'complete' && event.type !== 'run.start') continue;
        // A failed finalize resumes with the events of the next one. A failed prepare stays failed.
        if (model.status === 'error' && resumable && event.type !== 'run.error') {
            model.status = 'running';
            model.error = undefined;
            model.completedAt = undefined;
        }
        switch (event.type) {
            case 'run.start': {
                // A new run.start begins a fresh audit. The event log is append-only and
                // is not reset between `prepare` invocations, so it can still hold a
                // prior (e.g. aborted or timed-out) run. Reset every accumulating view
                // to the new run so stale logs/findings/scores don't bleed through.
                model.hasRun = true;
                model.status = 'running';
                model.startedAt = event.startedAt;
                model.completedAt = undefined;
                model.target = event.target;
                model.guidance = undefined;
                model.error = undefined;
                model.logs = [];
                model.findings = [];
                model.counts = zeroCounts();
                model.finalScores = [];
                byId.clear();
                activeId = undefined;
                model.steps = event.plan.map((stage) => {
                    const step: StepVM = { id: stage.id, title: stage.title, detail: stage.detail, state: 'pending' };
                    byId.set(stage.id, step);
                    return step;
                });
                break;
            }
            case 'stage.start': {
                model.hasRun = true;
                activeId = event.stageId;
                const step = byId.get(event.stageId);
                if (step && step.state !== 'done') {
                    step.state = 'running';
                    step.startedAt = event.at;
                }
                break;
            }
            case 'stage.complete': {
                const step = byId.get(event.stageId);
                if (step) {
                    step.state = 'done';
                    step.durationMs = event.durationMs ?? (step.startedAt ? ms(step.startedAt, event.at) : undefined);
                    if (event.summary) step.summary = event.summary;
                }
                if (activeId === event.stageId) activeId = undefined;
                break;
            }
            case 'page.complete': {
                const step = byId.get(event.pageId);
                if (step) {
                    step.score = event.score;
                    step.metrics = event.metrics;
                }
                break;
            }
            case 'rules.progress': {
                const step = activeId ? byId.get(activeId) : undefined;
                if (step) {
                    const rules = step.rules ?? { evaluated: 0, total: event.total, categories: [] };
                    rules.evaluated = event.evaluated;
                    rules.total = event.total;
                    if (event.category) {
                        const existing = rules.categories.find((c) => c.name === event.category);
                        const category: StepCategory = existing ?? {
                            name: event.category,
                            evaluated: 0,
                            total: event.categoryTotal ?? 0,
                            flagged: 0,
                        };
                        category.evaluated = event.categoryEvaluated ?? category.evaluated;
                        if (event.categoryTotal !== undefined) category.total = event.categoryTotal;
                        if (!existing) rules.categories.push(category);
                    }
                    step.rules = rules;
                }
                break;
            }
            case 'finding': {
                model.findings.push({
                    id: event.id,
                    severity: event.severity,
                    title: event.title,
                    category: event.category,
                    source: event.source,
                });
                model.counts[event.severity] += 1;
                const active = activeId ? byId.get(activeId) : undefined;
                const category = active?.rules?.categories.find((c) => c.name === event.category);
                if (category) category.flagged += 1;
                break;
            }
            case 'log': {
                model.logs.push({ at: event.at, level: event.level, message: event.message });
                break;
            }
            case 'run.complete': {
                model.status = 'complete';
                model.completedAt = event.at;
                model.guidance = event.guidance;
                for (const step of model.steps) if (step.state !== 'done') step.state = 'done';
                if (event.scores.length) model.finalScores = event.scores;
                break;
            }
            case 'run.error': {
                model.status = 'error';
                model.error = event.message;
                resumable = event.stageId !== undefined;
                model.completedAt = event.at;
                break;
            }
        }
    }

    model.stepsComplete = model.steps.filter((s) => s.state === 'done').length;
    const runningIndex = model.steps.findIndex((s) => s.state === 'running');
    model.activeIndex = runningIndex === -1 ? model.stepsComplete : runningIndex;
    if (!model.finalScores.length) {
        model.finalScores = model.steps.flatMap((s) =>
            s.score === undefined ? [] : [{ label: pageLabel(s.title), score: s.score }]
        );
    }
    if (model.status === 'preparing' && (model.startedAt || model.steps.some((s) => s.state !== 'pending'))) {
        model.status = 'running';
    }
    return model;
}
