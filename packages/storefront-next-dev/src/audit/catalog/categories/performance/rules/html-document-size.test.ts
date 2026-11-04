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
import htmlDocumentSize, { dataSchema } from './html-document-size';

const KIB = 1024;

describe('performance/html-document-size', () => {
    it('passes HTML within 350 KiB', async () => {
        const result = await runRule(htmlDocumentSize, {
            home: htmlPage({ htmlBytes: 100 * KIB, transferBytes: 20 * KIB, scripts: [pageDataScript(10 * KIB)] }),
        });
        const [home] = dataSchema.parse(result.data).pages;
        expect([home?.transferBytes, home?.markupBytes]).toEqual([
            20 * KIB,
            100 * KIB - pageDataScript(10 * KIB).length,
        ]);
        expect(result.decision).toMatchObject({
            status: 'pass',
            summary: 'HTML size is within 350 KiB on every measured page (home 100 KiB).',
            evidence: [
                { pointer: '/log/entries/0/response/content/size', value: 'HTML size 100 KiB (budget 350 KiB)' },
            ],
        });
    });

    it('fails larger HTML, with its breakdown when scripts were archived', async () => {
        const result = await runRule(htmlDocumentSize, {
            home: htmlPage({ htmlBytes: 350 * KIB + 100 }),
            plp: htmlPage({ htmlBytes: 400 * KIB, transferBytes: 0, scripts: [pageDataScript(300 * KIB)] }),
        });
        expect(result.data.pages.map((page) => page.transferBytes)).toEqual([null, null]);
        expect(result.decision?.status).toBe('fail');
        expect(result.decision?.summary).toBe(
            'HTML size is over 350 KiB on home (just over 350 KiB); plp (400 KiB: 300 KiB page data, 0 KiB app config, 0 KiB other inline scripts, 100 KiB markup).'
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            'HTML size just over 350 KiB (budget 350 KiB)',
            'HTML size 400 KiB (budget 350 KiB): 300 KiB page data, 0 KiB app config, 0 KiB other inline scripts, 100 KiB markup',
        ]);
    });

    it('skips a document without a decoded size', async () => {
        const result = await runRule(htmlDocumentSize, { home: htmlPage({ htmlBytes: 0 }) });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped).toEqual([
            { page: 'home', reason: 'The HAR records no decoded size for the HTML document.' },
        ]);
    });
});
