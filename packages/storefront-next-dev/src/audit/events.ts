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
import { appendFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { GUIDANCE } from './guidance';
import { sanitizeJsonValue } from './sanitize';

// Live-progress event log. A single append-only NDJSON file
// (`.site-audit/events.ndjson`) is the source of truth for the progress
// screen: the deterministic CLI (`prepare`/`finalize`) and the AI agent (via
// the `progress` verb) both append events, and the server tails the file and
// streams it to the browser over SSE. Text is sanitized on write so no secret
// ever reaches the durable log or the stream.

const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
const guidance = z.enum(GUIDANCE);
const metric = z.object({ key: z.string(), value: z.string(), bad: z.boolean().optional() }).strict();
const planStage = z.object({ id: z.string(), title: z.string(), detail: z.string().optional() }).strict();

export const progressEventSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('run.start'),
            runId: z.string(),
            startedAt: z.string(),
            target: z
                .object({ url: z.string().optional(), commit: z.string().optional(), env: z.string().optional() })
                .strict()
                .optional(),
            plan: z.array(planStage).default([]),
        })
        .strict(),
    z.object({ type: z.literal('stage.start'), stageId: z.string() }).strict(),
    z
        .object({
            type: z.literal('stage.complete'),
            stageId: z.string(),
            summary: z.string().optional(),
            durationMs: z.number().int().nonnegative().optional(),
        })
        .strict(),
    z.object({ type: z.literal('page.start'), pageId: z.string(), label: z.string(), url: z.string() }).strict(),
    z
        .object({
            type: z.literal('page.run'),
            pageId: z.string(),
            runIndex: z.number().int().positive(),
            total: z.number().int().positive(),
            status: z.enum(['running', 'ok', 'failed', 'retry']),
        })
        .strict(),
    z
        .object({
            type: z.literal('page.complete'),
            pageId: z.string(),
            score: z.number().optional(),
            metrics: z.array(metric).default([]),
        })
        .strict(),
    z
        .object({
            type: z.literal('rules.progress'),
            evaluated: z.number().int().nonnegative(),
            total: z.number().int().nonnegative(),
            category: z.string().optional(),
            categoryEvaluated: z.number().int().nonnegative().optional(),
            categoryTotal: z.number().int().nonnegative().optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal('finding'),
            id: z.string(),
            severity,
            title: z.string(),
            category: z.string().optional(),
            source: z.string().optional(),
            ruleId: z.string().optional(),
            preliminary: z.boolean().default(true),
        })
        .strict(),
    z.object({ type: z.literal('log'), level: z.enum(['info', 'ok', 'warn', 'find']), message: z.string() }).strict(),
    z
        .object({
            type: z.literal('run.complete'),
            guidance: guidance.optional(),
            scores: z.array(z.object({ label: z.string(), score: z.number() }).strict()).default([]),
        })
        .strict(),
    z.object({ type: z.literal('run.error'), message: z.string(), stageId: z.string().optional() }).strict(),
]);

export type ProgressEvent = z.infer<typeof progressEventSchema>;
export type StoredProgressEvent = ProgressEvent & { at: string };
export type RunStatus = 'preparing' | 'running' | 'complete' | 'error';

/** Validate, sanitize, stamp with an arrival time, and append one event. */
export async function appendEvent(file: string, event: unknown): Promise<StoredProgressEvent> {
    const validated = progressEventSchema.parse(event);
    const sanitized = progressEventSchema.parse(sanitizeJsonValue(validated));
    const stored = { ...sanitized, at: new Date().toISOString() } as StoredProgressEvent;
    await appendFile(file, `${JSON.stringify(stored)}\n`);
    return stored;
}

/** Read and validate every event in the log. Tolerates a partially written
 * trailing line (a concurrent append) and skips anything that fails to parse. */
export async function readEvents(file: string): Promise<StoredProgressEvent[]> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const events: StoredProgressEvent[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            continue;
        }
        if (typeof parsed !== 'object' || parsed === null) continue;
        const { at, ...rest } = parsed as Record<string, unknown>;
        const result = progressEventSchema.safeParse(rest);
        if (!result.success) continue;
        events.push({
            ...result.data,
            at: typeof at === 'string' ? at : new Date().toISOString(),
        } as StoredProgressEvent);
    }
    return events;
}

/** The events of the latest run: a log passed with `--events` can hold several runs, each from its run.start. */
export function latestRunEvents(events: readonly StoredProgressEvent[]): readonly StoredProgressEvent[] {
    const start = events.map((event) => event.type).lastIndexOf('run.start');
    return start === -1 ? events : events.slice(start);
}

/** Derive the coarse run status from the event log for /api/status. The full
 * view-model reduction lives in the client (the single reducer). */
export function deriveStatus(events: readonly StoredProgressEvent[]): RunStatus {
    let status: RunStatus = 'preparing';
    let resumable = false;
    for (const event of latestRunEvents(events)) {
        if (event.type === 'run.complete') return 'complete';
        if (event.type === 'run.error') {
            status = 'error';
            resumable = event.stageId !== undefined;
        }
        // A failed finalize (its run.error has a stageId) can be fixed and run again: later events resume the run.
        // A failed prepare can't; only a new run.start replaces it.
        else if (status === 'error') status = resumable ? 'running' : 'error';
        else if (event.type === 'stage.start' || event.type === 'page.start' || event.type === 'run.start')
            status = status === 'preparing' ? 'running' : status;
    }
    return status;
}

/** Whether the run is over at `event`: it completed, or prepare failed. A failed finalize is not over, since it
 * can be fixed and run again. */
export function endsRun(event: StoredProgressEvent): boolean {
    return event.type === 'run.complete' || (event.type === 'run.error' && event.stageId === undefined);
}
