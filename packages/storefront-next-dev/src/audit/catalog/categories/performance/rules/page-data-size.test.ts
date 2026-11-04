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
import { htmlPage, pageDataScript, runRule } from '../../../../__fixtures__/archive';
import pageDataSize from './page-data-size';

const KIB = 1024;

describe('performance/page-data-size', () => {
    it('passes page data within 200 KiB, citing the largest script', async () => {
        const result = await runRule(pageDataSize, {
            home: htmlPage({
                htmlBytes: 100 * KIB,
                scripts: [pageDataScript(KIB), pageDataScript(20 * KIB), 'track();'],
            }),
        });
        expect(result.data.pages[0]?.scripts).toEqual({
            pageData: ['scripts/s1.js', 'scripts/s0.js'],
            appConfig: [],
            other: ['scripts/s2.js'],
        });
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.evidence[0]).toMatchObject({ artifact: 'scripts/s1.js' });
    });

    it('leaves page data over budget for the agent to trace', async () => {
        const result = await runRule(pageDataSize, {
            home: htmlPage({ htmlBytes: 300 * KIB, scripts: [pageDataScript(250 * KIB)] }),
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.pages[0]?.pageDataBytes).toBeGreaterThan(200 * KIB);
    });

    it('skips pages without archived scripts, and cites the HAR when a page has no page data', async () => {
        const result = await runRule(pageDataSize, {
            home: htmlPage({ htmlBytes: 100 * KIB }),
            plp: htmlPage({ htmlBytes: 100 * KIB, scripts: ['track();'] }),
        });
        expect(result.data.skipped).toEqual([{ page: 'home', reason: 'No page data measurement was archived.' }]);
        expect(result.decision?.evidence).toEqual([
            {
                type: 'playhouse',
                page: 'plp',
                artifact: 'network-mobile-cold.har',
                pointer: '/log/entries/0/response/content/size',
                value: 'Page data 0 KiB (budget 200 KiB)',
            },
        ]);
    });
});
