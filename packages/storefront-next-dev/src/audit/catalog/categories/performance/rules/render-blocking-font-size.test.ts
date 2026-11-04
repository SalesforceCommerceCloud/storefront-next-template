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
import { PAGE_URL, runRule } from '../../../../__fixtures__/archive';
import renderBlockingFontSize, { dataSchema } from './render-blocking-font-size';

const KIB = 1024;
const DOCUMENT = { url: PAGE_URL, resourceType: 'Document', entity: 'shop.test', resourceSize: 50_000 };
const font = (file: string, bytes: number, startMs: number, extra: Record<string, unknown> = {}) => ({
    url: file.includes('://') ? file : `${PAGE_URL}fonts/${file}`,
    resourceType: 'Font',
    resourceSize: bytes,
    rendererStartTime: startMs,
    statusCode: 200,
    ...extra,
});
const lhr = (
    items: unknown[],
    metrics: Record<string, unknown> = { observedLargestContentfulPaint: 2000, observedLoad: 3000 }
) => ({
    audits: {
        'network-requests': { details: { items, debugData: { networkStartTimeTs: 1_000_500 } } },
        metrics: { details: { items: [{ observedNavigationStartTs: 1_000_000, ...metrics }] } },
    },
});
const page = (value: unknown, runId = 'mobile-cold-1') => ({ [`runs/${runId}/lhr.json`]: value });

describe('performance/render-blocking-font-size', () => {
    it('passes render-blocking fonts within 75 KiB and reports later ones', async () => {
        const result = await runRule(renderBlockingFontSize, {
            home: page(
                lhr([
                    DOCUMENT,
                    font('inter.woff2', 20 * KIB, 100, { isLinkPreload: true }),
                    font('late.woff2', 90 * KIB, 2500),
                ])
            ),
            plp: page(lhr([DOCUMENT, font('late.woff2', 30 * KIB, 2500)])),
        });
        const [home, plp] = dataSchema.parse(result.data).pages;
        expect([home?.renderBlockingBytes, home?.laterBytes, home?.loadMs]).toEqual([20 * KIB, 90 * KIB, 3000]);
        // Request times are shifted from network start to navigation start.
        expect(home?.fonts[0]?.requestMs).toBe(101);
        expect(plp?.renderBlockingBytes).toBe(0);
        expect(result.decision?.summary).toBe(
            'Render-blocking fonts are within 75 KiB on every measured page (home 20 KiB in 1 file, plp no render-blocking fonts).'
        );
    });

    it('fails over 75 KiB, listing the largest files', async () => {
        const result = await runRule(renderBlockingFontSize, {
            home: page(
                lhr(
                    [
                        DOCUMENT,
                        font('a.woff2', 20 * KIB, 900),
                        font('a.woff2', 20 * KIB, 400, { isLinkPreload: true }),
                        font('b.woff2', 19 * KIB, 500),
                        font('https://fonts.test/c.woff2', 18 * KIB, 600, { entity: 'Google Fonts' }),
                        font('d.woff2', 17 * KIB, 700),
                        font('e.woff2', 16 * KIB, 800),
                        font('missing.woff2', 99 * KIB, 100, { statusCode: 404 }),
                        font('empty.woff2', 0, 100),
                    ],
                    { observedLargestContentfulPaint: 2000 }
                )
            ),
        });
        const [home] = result.data.pages;
        expect(home?.fonts.map((item) => [item.requestMs, item.preloaded, item.thirdParty, item.entry])[0]).toEqual([
            401,
            true,
            false,
            2,
        ]);
        expect(home?.loadMs).toBeNull();
        expect(result.decision?.summary).toBe(
            'Render-blocking fonts are over 75 KiB on home (90 KiB: a.woff2 20 KiB, b.woff2 19 KiB, c.woff2 18 KiB third-party, d.woff2 17 KiB, +1 more).'
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            'a.woff2 20 KiB, preloaded',
            'b.woff2 19 KiB, requested at 501 ms, before LCP at 2000 ms',
            'c.woff2 18 KiB, third-party, requested at 601 ms, before LCP at 2000 ms',
            'd.woff2 17 KiB, requested at 701 ms, before LCP at 2000 ms',
        ]);
    });

    it('reads the median run, and compares hosts without the document entity', async () => {
        const result = await runRule(renderBlockingFontSize, {
            home: {
                'summary.json': {
                    runs: [
                        { runId: 'mobile-cold-1', formFactor: 'mobile', cacheState: 'cold' },
                        { runId: 'mobile-cold-2', formFactor: 'mobile', cacheState: 'cold', isMedian: true },
                    ],
                },
                ...page(
                    lhr([
                        { ...DOCUMENT, entity: undefined },
                        font('https://fonts.test/x.woff2', 75 * KIB + 10, 100),
                        font('x', 10, 100, { url: 'not a url' }),
                    ]),
                    'mobile-cold-2'
                ),
            },
        });
        expect(result.data.pages[0]?.fonts.map((item) => item.thirdParty)).toEqual([true, true]);
        expect(result.decision?.summary).toBe(
            'Render-blocking fonts are over 75 KiB on home (just over 75 KiB: x.woff2 75 KiB third-party, not a url 0 KiB third-party).'
        );
    });

    it('treats fonts as first-party without a document request', async () => {
        const result = await runRule(renderBlockingFontSize, {
            home: page(lhr([font('https://fonts.test/x.woff2', KIB, 100)])),
        });
        expect(result.data.pages[0]).toMatchObject({ url: '', fonts: [{ thirdParty: false }] });
    });

    it('skips pages it cannot measure', async () => {
        const result = await runRule(renderBlockingFontSize, {
            home: {},
            plp: page({ audits: {} }),
            pdp: page(lhr([DOCUMENT], {})),
            cart: page(lhr([DOCUMENT, font('x.woff2', KIB, Number.NaN)])),
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped.map((item) => item.reason)).toEqual([
            'runs/mobile-cold-1/lhr.json is missing.',
            'The Lighthouse result has no network-requests audit.',
            'The Lighthouse result has no observed LCP.',
            `The font request ${PAGE_URL}fonts/x.woff2 has no start time.`,
        ]);
    });
});
