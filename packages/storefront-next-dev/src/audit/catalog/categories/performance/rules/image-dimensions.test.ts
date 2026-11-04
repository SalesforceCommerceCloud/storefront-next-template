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
import imageDimensions, { dataSchema } from './image-dimensions';

const node = (selector: string, top: number, extra: Record<string, unknown> = {}) => ({
    selector,
    boundingRect: { top, bottom: top + 100, width: 100, height: 100 },
    ...extra,
});
const cause = (extra?: Record<string, unknown>) => ({ cause: 'Unsized image element', ...(extra ? { extra } : {}) });
const culprits = (...clusters: unknown[][]) => ({
    'cls-culprits-insight': { details: { items: clusters.map((items) => ({ items })) } },
});

describe('performance/image-dimensions', () => {
    it('passes when unsized images cause no noticeable shift', async () => {
        const result = await runRule(imageDimensions, {
            home: imageRun({
                audits: {
                    'cumulative-layout-shift': { numericValue: 0.0123 },
                    'unsized-images': {
                        details: {
                            items: [
                                { url: 'https://shop.test/a.png', node: node('img.a', 10) },
                                { node: node('img.b', 20) },
                            ],
                        },
                    },
                    ...culprits([{ node: { selector: 'main' }, score: 0.005, subItems: { items: [cause()] } }]),
                },
            }),
            plp: imageRun({ audits: culprits() }),
        });
        expect(dataSchema.parse(result.data).pages[0]?.unsizedImages).toEqual([
            { url: 'https://shop.test/a.png', selector: 'img.a', top: 10, bottom: 110 },
        ]);
        expect(result.decision?.summary).toBe(
            'Images without dimensions cause no noticeable layout shift on home, plp; Lighthouse lists 1 image without width and height, but their layout reserves the space.'
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            'CLS 0.012, 0.005 from unsized images',
            'CLS 0, 0 from unsized images',
        ]);
    });

    it('rules out culprits below the shifted element and leaves plausible shifts to the agent', async () => {
        const result = await runRule(imageDimensions, {
            home: imageRun({
                audits: {
                    'unsized-images': {
                        details: {
                            items: [{ url: 'https://shop.test/full-hero.png', node: { path: '1,HTML,2,IMG' } }],
                        },
                    },
                    ...culprits(
                        [
                            { node: { nodeLabel: 'Total' }, score: 0.5 },
                            {
                                node: node('footer', 100),
                                score: 0.2,
                                subItems: {
                                    items: [
                                        cause(
                                            node('img.below', 500, { snippet: '<img src="https://shop.test/b.png">' })
                                        ),
                                    ],
                                },
                            },
                            { node: node('p', 100), score: 0.3, subItems: { items: [{ cause: 'Web font' }] } },
                        ],
                        [
                            {
                                node: node('main', 400),
                                score: 0.04,
                                subItems: {
                                    items: [
                                        cause(
                                            node('img.hero', 50, {
                                                path: '1,HTML,2,IMG',
                                                snippet: '<img src="https://shop.test/full-…">',
                                            })
                                        ),
                                        cause(node('img.cut', 60, { snippet: '<img src="https://shop.test/x…">' })),
                                        cause({ snippet: '<img>' }),
                                    ],
                                },
                            },
                        ]
                    ),
                },
            }),
        });
        expect(result.decision).toBeUndefined();
        const [home] = result.data.pages;
        expect(
            home?.shifts.map((shift) => [
                shift.cluster,
                shift.culprits.map((culprit) => [culprit.url, culprit.plausible]),
            ])
        ).toEqual([
            [0, [['https://shop.test/b.png', false]]],
            [
                1,
                [
                    ['https://shop.test/full-hero.png', true],
                    [null, true],
                ],
            ],
        ]);
        expect(home?.unsizedShift).toBe(0.04);
    });

    it('counts a cause without a named image, and an element without a position', async () => {
        const result = await runRule(imageDimensions, {
            home: imageRun({
                audits: culprits([
                    { node: { selector: 'div' }, subItems: { items: [cause()] } },
                    { node: { selector: 'aside' }, score: 0.02, subItems: { items: [cause({ selector: 'img' })] } },
                ]),
            }),
        });
        expect(result.data.pages[0]?.shifts.map((shift) => shift.score)).toEqual([0, 0.02]);
        expect(result.data.pages[0]?.unsizedShift).toBe(0.02);
        expect(result.decision).toBeUndefined();
    });

    it('skips pages without a median run or a culprits insight', async () => {
        const result = await runRule(imageDimensions, {
            home: {},
            plp: imageRun(),
            pdp: { ...imageRun(), 'runs/mobile-cold-1/network.har': undefined },
            cart: { ...imageRun(), 'runs/mobile-cold-1/lhr.json': undefined },
        });
        expect(result.data.skipped).toEqual([
            { page: 'home', reason: 'summary-lcp.json has no mobile cold-cache median run.' },
            { page: 'plp', reason: 'The Lighthouse result has no layout shift culprits insight.' },
            { page: 'pdp', reason: "The median run's HAR was not archived." },
            { page: 'cart', reason: "The median run's Lighthouse result was not archived." },
        ]);
    });
});
