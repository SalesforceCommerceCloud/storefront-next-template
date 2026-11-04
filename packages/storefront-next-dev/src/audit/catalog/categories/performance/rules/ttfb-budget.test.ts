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
import ttfbBudget from './ttfb-budget';

describe('performance/ttfb-budget', () => {
    it('reports the representative run with its spread', async () => {
        const result = await runRule(ttfbBudget, {
            home: summary({ lcp: 1000, ttfb: 600 }, [
                { lcp: 1000, ttfb: 600 },
                { lcp: 1100, ttfb: 700 },
            ]),
        });
        expect(result.decision).toMatchObject({
            status: 'pass',
            summary: 'Mobile cold-cache representative-run TTFB is within 800 ms on every measured page (home 600 ms).',
            evidence: [{ value: 'TTFB 600 ms (budget 800 ms; measured spread 600 ms–700 ms)' }],
        });
    });

    it('fails medium over 800 ms and high over 1.8 s', async () => {
        const medium = await runRule(ttfbBudget, { home: summary({ lcp: 1000, ttfb: 1200 }) });
        expect([medium.decision?.status, medium.decision?.severity]).toEqual(['fail', 'medium']);
        const high = await runRule(ttfbBudget, { home: summary({ lcp: 1000, ttfb: 2000 }) });
        expect(high.decision?.severity).toBe('high');
    });

    it('picks a run with a valid TTFB, and skips a page without one', async () => {
        const picked = await runRule(ttfbBudget, {
            home: summary({ lcp: 1000, ttfb: 0 }, [
                { lcp: 1000, ttfb: 0 },
                { lcp: 1200, ttfb: 500 },
            ]),
        });
        expect(picked.data.pages[0]).toMatchObject({ value: 500, runs: [500], unmeasuredRuns: 1 });
        const none = await runRule(ttfbBudget, { home: summary({ lcp: 1000, ttfb: 0 }) });
        expect(none.data.skipped[0]?.reason).toBe(
            'Not measured: no mobile/cold run in summary.json has a positive LCP and valid TTFB.'
        );
    });
});
