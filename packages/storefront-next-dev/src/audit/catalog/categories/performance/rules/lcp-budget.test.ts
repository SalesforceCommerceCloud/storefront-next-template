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
import { runRule, summary } from '../../../../__fixtures__/archive';
import lcpBudget, { dataSchema } from './lcp-budget';

describe('performance/lcp-budget', () => {
    it('passes a median LCP within 2.5 s and fails one over it', async () => {
        const result = await runRule(lcpBudget, { home: summary({ lcp: 2000 }), plp: summary({ lcp: 3100 }) });
        expect(dataSchema.parse(result.data).pages.map((page) => page.value)).toEqual([2000, 3100]);
        expect(result.decision).toMatchObject({
            status: 'fail',
            summary: 'Mobile cold-cache median LCP is over 2500 ms on plp 3100 ms.',
            evidence: [{ page: 'plp', pointer: '/cells/0/medianRun/lcp', value: 'LCP 3100 ms (budget 2500 ms)' }],
        });
        const pass = await runRule(lcpBudget, { home: summary({ lcp: 2000 }) });
        expect(pass.decision?.summary).toBe(
            'Mobile cold-cache median LCP is within 2500 ms on every measured page (home 2000 ms).'
        );
    });

    it('leaves out runs that measured nothing', async () => {
        const result = await runRule(lcpBudget, {
            home: summary({ lcp: 0 }, [{ lcp: 0 }, { lcp: 2400 }, { lcp: 2200 }]),
        });
        expect(result.data.pages[0]).toMatchObject({ value: 2400, runs: [2400, 2200], unmeasuredRuns: 1 });
        expect(result.decision?.evidence[0]).toMatchObject({
            pointer: '/runs/1/row/lcp',
            value: 'LCP 2400 ms (budget 2500 ms; 1 run not measured, left out)',
        });
    });

    it('skips pages without a measured mobile cold-cache run', async () => {
        const result = await runRule(lcpBudget, {
            home: {},
            plp: { 'summary.json': { cells: [{ formFactor: 'desktop', cacheState: 'cold', medianRun: { lcp: 1 } }] } },
            pdp: summary({ lcp: 0 }),
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped).toEqual([
            { page: 'home', reason: 'summary.json is missing.' },
            { page: 'plp', reason: 'No mobile/cold median LCP in summary.json.' },
            { page: 'pdp', reason: 'Not measured: no mobile/cold run in summary.json has a positive LCP.' },
        ]);
    });
});
