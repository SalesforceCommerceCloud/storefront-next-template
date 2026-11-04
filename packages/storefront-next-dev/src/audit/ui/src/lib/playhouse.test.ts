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
import { metric, mobileColdRunCount, scoreOf, worstMetrics } from './playhouse';

type Page = Parameters<typeof mobileColdRunCount>[0];
const page = (summary?: object): Page =>
    ({
        label: 'home',
        url: 'https://example.com/',
        playhouse: {
            archiveDir: '',
            version: '',
            lighthouseVersion: '',
            artifacts: summary ? { 'summary.json': summary } : {},
        },
    }) as never;
const run = (formFactor: string, cacheState: string, index: number, isMedian = false) => ({
    runId: `${formFactor}-${cacheState}-${index}`,
    formFactor,
    cacheState,
    index,
    isMedian,
    row: { lcp: 2000 + index },
});

describe('mobileColdRunCount', () => {
    it('counts only mobile cold-cache runs', () => {
        const runs = [
            run('mobile', 'cold', 1),
            run('mobile', 'cold', 2, true),
            run('mobile', 'cold', 3),
            run('mobile', 'warm', 1, true),
            run('desktop', 'cold', 1, true),
        ];
        expect(mobileColdRunCount(page({ cells: [], runs }))).toBe(3);
        expect(mobileColdRunCount(page({ cells: [], runs: [run('mobile', 'cold', 1, true)] }))).toBe(1);
    });

    it('is 0 when summary.json or its runs are missing', () => {
        expect(mobileColdRunCount(page())).toBe(0);
        expect(mobileColdRunCount(page({ cells: [] }))).toBe(0);
    });
});

describe('dashboard metrics', () => {
    it('leave out runs Playhouse could not measure', () => {
        const zero = { score: 0, lcp: 0, tbt: 0, cls: 0 };
        const failed = page({
            cells: [
                {
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    medianRun: zero,
                    stats: { lcp: { max: 0 }, tbt: { max: 0 } },
                },
            ],
            runs: [{ ...run('mobile', 'cold', 1, true), row: zero }],
        });
        expect(scoreOf(failed)).toBeUndefined();
        expect(metric(failed, 'LCP')).toBeUndefined();
        expect(worstMetrics([failed])[0]?.value).toBe('—');

        const real = (lcp: number) => ({ score: 70, lcp, tbt: 400, cls: 0.02 });
        const partial = page({
            cells: [{ formFactor: 'mobile', cacheState: 'cold', medianRun: real(2400) }],
            runs: [0, 2400, 2600, 9000].map((lcp, i) => ({
                ...run('mobile', 'cold', i + 1),
                row: lcp ? real(lcp) : zero,
            })),
        });
        expect(scoreOf(partial)).toBe(70);
        expect(metric(partial, 'LCP')?.value).toBe(2600);
    });
});
