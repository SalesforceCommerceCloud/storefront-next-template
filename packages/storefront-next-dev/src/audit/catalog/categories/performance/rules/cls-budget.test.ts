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
import clsBudget from './cls-budget';

describe('performance/cls-budget', () => {
    it('passes CLS within 0.1 and fails over it', async () => {
        const pass = await runRule(clsBudget, { home: summary({ lcp: 1000, cls: 0.04 }) });
        expect(pass.decision?.evidence[0]).toMatchObject({ value: 'CLS 0.04 (budget 0.10)' });
        const fail = await runRule(clsBudget, { home: summary({ lcp: 1000, cls: 0.25 }) });
        expect(fail.decision?.summary).toBe('Mobile cold-cache median CLS is over 0.10 on home 0.25.');
    });
});
