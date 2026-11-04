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
import { imageRun, runRule } from '../../../../__fixtures__/archive';
import imageTransformation, { dataSchema } from './image-transformation';

const DIS = 'https://shop.test/dw/image/v2/BCDE_PRD/on/demandware.static/-/Sites-catalog/default/hero.jpg';
const STATIC = 'https://shop.test/on/demandware.static/-/Sites-catalog/default/raw.png';
const image = (url: string, mimeType: string, bytes = 50_000, extra: Record<string, unknown> = {}) => ({
    _requestTime: 1,
    time: 100,
    request: { url },
    response: { status: 200, bodySize: bytes, content: { mimeType } },
    ...extra,
});

describe('performance/image-transformation', () => {
    it('passes Commerce images resized by DIS as WebP or AVIF', async () => {
        const result = await runRule(imageTransformation, {
            home: imageRun({
                entries: [
                    image(`${DIS}?sw=800`, 'image/webp'),
                    image(`${DIS}?sh=400`, 'image/avif'),
                    image('https://cdn.test/other.png', 'image/png'),
                    image(`${DIS}?sw=1`, 'image/webp', 100),
                    image(`${DIS}?sw=2`, 'image/svg+xml'),
                    image(`${DIS}?sw=3`, 'image/webp', 50_000, { response: { status: 304, bodySize: 50_000 } }),
                    image('not a url', 'image/webp'),
                    { time: 1, request: { url: `${DIS}?unknown` }, response: { status: 200, bodySize: 50_000 } },
                ],
            }),
            plp: imageRun({ entries: [image(`${DIS}?sw=10`, 'image/webp')] }),
            pdp: imageRun(),
        });
        expect(dataSchema.parse(result.data).pages.map((page) => [page.checked, page.dis])).toEqual([
            [2, 2],
            [1, 1],
            [0, 0],
        ]);
        expect(result.decision?.summary).toBe(
            'All 3 Commerce images of 10 KiB or more on home, plp are resized by DIS and served as WebP or AVIF.'
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            '2 Commerce images checked, all through DIS',
            '1 Commerce image checked, all through DIS',
        ]);
    });

    it('leaves images that bypass or underuse DIS to the agent', async () => {
        const result = await runRule(imageTransformation, {
            home: imageRun({
                lcp: 1500,
                lcpUrl: DIS,
                entries: [
                    image('https://shop.test/', 'text/html', 1, { _resourceType: 'document', _requestTime: 0.5 }),
                    image(DIS, 'image/jpeg'),
                    image(STATIC, 'image/png', 50_000, { _requestTime: 3 }),
                ],
            }),
            plp: imageRun({ lcp: null, entries: [image(STATIC, 'image/png', 50_000, { _requestTime: undefined })] }),
        });
        expect(result.decision).toBeUndefined();
        expect(
            result.data.pages.map((page) =>
                page.images.map((item) => [item.problems, item.lcp, item.requestedBeforeLcp])
            )
        ).toEqual([
            [
                [['not-resized', 'legacy-format'], true, true],
                [['bypasses-dis'], false, false],
            ],
            [[['bypasses-dis'], false, null]],
        ]);
    });

    it('stays undecided without Commerce images or a median run', async () => {
        const result = await runRule(imageTransformation, { home: imageRun(), plp: {} });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped).toEqual([
            { page: 'plp', reason: 'summary-lcp.json has no mobile cold-cache median run.' },
        ]);
    });
});
