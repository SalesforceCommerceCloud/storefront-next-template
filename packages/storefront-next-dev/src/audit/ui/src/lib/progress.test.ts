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
import { describe, expect, it } from 'vitest';
import { reduceEvents } from './progress';

type Event = Parameters<typeof reduceEvents>[0][number];
const at = '2026-10-02T09:00:00.000Z';
const start = (runId: string): Event =>
    ({ type: 'run.start', runId, startedAt: at, plan: [{ id: 'analyze', title: 'AI code analysis' }], at }) as Event;
const error = (message: string, stageId?: string): Event =>
    ({ type: 'run.error', message, ...(stageId ? { stageId } : {}), at }) as Event;
const complete = { type: 'run.complete', scores: [], at } as Event;
const log = { type: 'log', level: 'info', message: 'working', at } as Event;

describe('reduceEvents', () => {
    it('shows the latest finalize failure, and the fixed finalize clears it', () => {
        const failedTwice = [start('a'), error('first failure', 'analyze'), log, error('second failure', 'analyze')];
        expect(reduceEvents(failedTwice).status).toBe('error');
        expect(reduceEvents(failedTwice).error).toBe('second failure');
        const fixed = reduceEvents([
            ...failedTwice,
            { type: 'stage.complete', stageId: 'analyze', at } as Event,
            complete,
        ]);
        expect(fixed.status).toBe('complete');
        expect(fixed.error).toBeUndefined();
    });

    it('keeps a failed prepare failed', () => {
        const model = reduceEvents([start('a'), error('prepare failed'), log]);
        expect(model.status).toBe('error');
        expect(model.error).toBe('prepare failed');
    });

    it('does not undo a completed run for a later failure, but starts a new run over', () => {
        expect(reduceEvents([start('a'), complete, error('finalize failed', 'analyze')]).status).toBe('complete');
        const next = reduceEvents([start('a'), complete, start('b')]);
        expect(next.status).toBe('running');
        expect(next.completedAt).toBeUndefined();
    });
});
