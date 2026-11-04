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
import largeImages, { dataSchema } from './large-images';

const HERO = 'https://shop.test/hero.jpg';
const sized = (width: number, height: number) => ({
    reason: `This image file is larger than it needs to be (${width}x${height}) for its displayed dimensions (200x200).`,
    wastedBytes: 1,
});
const item = (url: string, totalBytes: number, reasons: unknown[], node?: Record<string, unknown>) => ({
    url,
    totalBytes,
    wastedBytes: 0,
    ...(node ? { node } : {}),
    subItems: { items: reasons },
});
const rect = (top: number, width = 200, height = 200) => ({
    selector: 'img.hero',
    nodeLabel: 'Hero',
    boundingRect: { top, width, height },
});
const delivery = (items?: unknown[]) => ({ 'image-delivery-insight': { details: items ? { items } : {} } });
const entry = (url: string, requestTime: number) => ({
    _requestTime: requestTime,
    time: 10,
    request: { url },
    response: { status: 200 },
});

describe('performance/large-images', () => {
    it('recomputes resize savings at the pixel density and keeps format and GIF savings', async () => {
        const result = await runRule(largeImages, {
            home: imageRun({
                lcp: 2000,
                entries: [entry('https://shop.test/', 1), entry(HERO, 2)],
                audits: delivery([
                    item(
                        HERO,
                        100_000,
                        [
                            sized(2000, 2000),
                            { reason: 'Using a modern image format (WebP, AVIF)', wastedBytes: 30_000 },
                        ],
                        rect(100)
                    ),
                    item('https://shop.test/spin.gif', 60_000, [
                        sized(800, 800),
                        { reason: 'Use video formats for animated content', wastedBytes: 50_000 },
                    ]),
                    item(
                        'https://shop.test/ok.jpg',
                        20_000,
                        [
                            sized(400, 400),
                            { reason: 'Serve WebP', wastedBytes: 5000 },
                            { reason: 'Something else', wastedBytes: 90_000 },
                        ],
                        rect(900)
                    ),
                    item('https://shop.test/hidden.jpg', 90_000, [sized(4000, 4000)], rect(10, 0, 0)),
                ]),
            }),
        });
        expect(result.decision).toBeUndefined();
        const [home] = dataSchema.parse(result.data).pages;
        expect([home?.lighthouseItems, home?.dropped, home?.totalSavingsBytes]).toEqual([4, 2, 96_938 + 50_000]);
        expect(home?.images).toEqual([
            {
                url: HERO,
                item: 0,
                bytes: 100_000,
                shown: { width: 200, height: 200 },
                intrinsic: { width: 2000, height: 2000 },
                savingsBytes: 96_938,
                reasons: [
                    {
                        kind: 'oversized',
                        savingsBytes: 96_938,
                        detail: '2000×2000 delivered; 350×350 shows it at 200×200 on a 1.75× screen',
                    },
                    { kind: 'format', savingsBytes: 30_000, detail: 'Using a modern image format (WebP, AVIF)' },
                ],
                selector: 'img.hero',
                label: 'Hero',
                aboveFold: true,
                requestedBeforeLcp: true,
            },
            {
                url: 'https://shop.test/spin.gif',
                item: 1,
                bytes: 60_000,
                shown: null,
                intrinsic: { width: 800, height: 800 },
                savingsBytes: 50_000,
                reasons: [
                    { kind: 'animated-gif', savingsBytes: 50_000, detail: 'Use video formats for animated content' },
                ],
                selector: null,
                label: null,
                aboveFold: null,
                requestedBeforeLcp: null,
            },
        ]);
    });

    it('passes when every listed image is right-sized or saves little', async () => {
        const result = await runRule(largeImages, {
            home: imageRun({
                audits: delivery([item('https://shop.test/ok.jpg', 20_000, [sized(400, 400)], rect(100))]),
            }),
            plp: imageRun({ audits: delivery() }),
            pdp: imageRun(),
        });
        expect(result.data.skipped).toEqual([
            { page: 'pdp', reason: 'The Lighthouse result has no image delivery insight.' },
        ]);
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.evidence.map((evidence) => ('value' in evidence ? evidence.value : undefined))).toEqual(
            [
                'Lighthouse listed 1 image; each is right-sized for a 1.75× screen or would save less than 10 KiB',
                'Lighthouse found no image delivery savings',
            ]
        );
    });

    it('stays undecided without a measured page', async () => {
        const result = await runRule(largeImages, { home: {} });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped).toHaveLength(1);
    });
});
