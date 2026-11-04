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
import tbtBudget from './tbt-budget';

describe('performance/tbt-budget', () => {
    it('passes TBT within 200 ms, fails over it, and skips a run without TBT', async () => {
        expect((await runRule(tbtBudget, { home: summary({ lcp: 1000, tbt: 150 }) })).decision?.status).toBe('pass');
        const fail = await runRule(tbtBudget, { home: summary({ lcp: 1000, tbt: 450 }) });
        expect(fail.decision).toMatchObject({
            status: 'fail',
            summary: 'Mobile cold-cache median TBT is over 200 ms on home 450 ms.',
        });
        expect(fail.decision?.severity).toBeUndefined();
        const missing = await runRule(tbtBudget, { home: summary({ lcp: 1000 }) });
        expect(missing.data.skipped).toEqual([{ page: 'home', reason: 'No mobile/cold median TBT in summary.json.' }]);
    });
});
