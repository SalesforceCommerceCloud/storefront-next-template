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
import { measuredRun, perfFromSummary } from './measured-run';

const row = (lcp: number, extra: Record<string, unknown> = {}) => ({
    score: lcp ? 80 : 0,
    lcp,
    tbt: lcp ? 300 : 0,
    cls: lcp ? 0.05 : 0,
    ...extra,
});
/** A mobile/cold summary whose cell median is what Playhouse would pick: the run closest to the median LCP, zeros included. */
function summary(lcps: number[], medianRun?: Record<string, unknown>) {
    const runs = lcps.map((lcp, i) => ({
        runId: `mobile-cold-${i + 1}`,
        formFactor: 'mobile',
        cacheState: 'cold',
        index: i + 1,
        row: row(lcp),
    }));
    return { cells: [{ formFactor: 'mobile', cacheState: 'cold', medianRun: medianRun ?? row(lcps[0]) }], runs };
}
const cell = (medianRun: unknown) => ({ cells: [{ formFactor: 'mobile', cacheState: 'cold', medianRun }] });

describe('measuredRun', () => {
    it("returns Playhouse's own median when every run was measured", () => {
        expect(measuredRun(summary([2400, 2600, 9000], row(2600)), 0)).toEqual({
            run: row(2600),
            pointer: '/cells/0/medianRun',
            unmeasuredRuns: 0,
        });
    });

    it('picks the median from measured runs only', () => {
        // Playhouse: median of [0, 2400, 2600, 9000] is 2500, the tie goes to 2400, which passes a 2500 ms budget.
        const skewed = measuredRun(summary([0, 2400, 2600, 9000], row(2400)), 0);
        expect(skewed?.run.lcp).toBe(2600);
        expect(skewed?.pointer).toBe('/runs/2/row');
        expect(skewed?.unmeasuredRuns).toBe(1);
        // One real run among failed ones is still measured.
        expect(measuredRun(summary([0, 0, 4000], row(0)), 0)?.run.lcp).toBe(4000);
        // Run order no longer decides whether the page is measured.
        expect(measuredRun(summary([0, 4000], row(0)), 0)?.run.lcp).toBe(4000);
        expect(measuredRun(summary([4000, 0], row(4000)), 0)?.run.lcp).toBe(4000);
    });

    it('is undefined when nothing was measured or the cell is missing', () => {
        expect(measuredRun(summary([0, 0], row(0)), 0)).toBeUndefined();
        expect(measuredRun(cell(row(0)), 0)).toBeUndefined();
        expect(measuredRun(cell(row(-1)), 0)).toBeUndefined();
        expect(measuredRun(cell({ tbt: 100 }), 0)).toBeUndefined();
        expect(measuredRun({ cells: [] }, 0)).toBeUndefined();
        expect(measuredRun(undefined, 0)).toBeUndefined();
    });

    it('keeps a real TBT and CLS of 0 and archives without per-run rows', () => {
        const real = { score: 99, lcp: 1800, tbt: 0, cls: 0 };
        expect(measuredRun({ ...cell(real), runs: [] }, 0)).toEqual({
            run: real,
            pointer: '/cells/0/medianRun',
            unmeasuredRuns: 0,
        });
    });
});

describe('perfFromSummary', () => {
    it('shows nothing for a page Playhouse could not measure', () => {
        expect(perfFromSummary(summary([0, 0], row(0)))).toEqual({ metrics: [] });
        expect(perfFromSummary(undefined)).toEqual({ metrics: [] });
        const partial = perfFromSummary(summary([0, 2400, 2600, 9000], row(2400)));
        expect(partial.score).toBe(80);
        expect(partial.metrics.map((item) => [item.key, item.value, item.bad])).toEqual([
            ['LCP', '2.6s', true],
            ['TBT', '300ms', true],
            ['CLS', '0.05', false],
        ]);
    });
});
