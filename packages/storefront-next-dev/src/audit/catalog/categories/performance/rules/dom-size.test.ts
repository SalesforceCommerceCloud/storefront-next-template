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
import { htmlPage, runRule } from '../../../../__fixtures__/archive';
import domSize from './dom-size';

describe('performance/dom-size', () => {
    it('passes up to 1,400 elements, citing the DOM size insight', async () => {
        const result = await runRule(domSize, {
            home: htmlPage({ htmlBytes: 50_000, scripts: ['a();'], elements: 1200 }),
        });
        expect(result.data.pages[0]).toMatchObject({
            elements: 1200,
            domDepth: 12,
            lighthouseArtifact: 'runs/mobile-cold-1/lhr.json',
        });
        expect(result.decision?.evidence[0]).toMatchObject({
            artifact: 'runs/mobile-cold-1/lhr.json',
            pointer: '/audits/dom-size-insight/details/items',
            value: 'Element count 1,200 (budget 1,400)',
        });
    });

    it('leaves a large DOM undecided and skips pages without a Lighthouse result', async () => {
        const result = await runRule(domSize, {
            home: htmlPage({ htmlBytes: 50_000, scripts: ['a();'], elements: 3000 }),
            plp: htmlPage({ htmlBytes: 50_000, scripts: ['a();'] }),
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped).toEqual([{ page: 'plp', reason: 'No element count measurement was archived.' }]);
        expect(result.data.pages[1]).toMatchObject({ elements: null, lighthouseArtifact: null });
    });
});
