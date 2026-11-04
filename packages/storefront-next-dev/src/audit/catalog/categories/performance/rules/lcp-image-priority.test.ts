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
import { imageRun, PAGE_URL, runRule } from '../../../../__fixtures__/archive';
import lcpImagePriority, { dataSchema } from './lcp-image-priority';

const HERO = 'https://shop.test/hero.jpg';
const entry = (url: string, requestTime: number, time: number, bytes: number, extra: Record<string, unknown> = {}) => ({
    _requestTime: requestTime,
    time,
    request: { url },
    response: {
        status: 200,
        bodySize: bytes,
        content: { mimeType: url.endsWith('.js') ? 'text/javascript' : 'image/jpeg' },
    },
    ...extra,
});
const DOCUMENT = {
    _requestTime: 1,
    time: 100,
    request: { url: PAGE_URL },
    response: { status: 200, bodySize: 20_000, content: { mimeType: 'text/html' } },
};
const checklist = (items: Record<string, unknown>) => ({
    'lcp-discovery-insight': { details: { items: [{}, { type: 'checklist', items }] } },
});

describe('performance/lcp-image-priority', () => {
    it('fails each way the LCP image is found late or starved of bandwidth', async () => {
        const result = await runRule(lcpImagePriority, {
            home: imageRun({
                lcp: 3000,
                lcpUrl: `${HERO}?sw=800`,
                entries: [
                    DOCUMENT,
                    entry(`${HERO}?sw=800`, 1.5, 1000, 100_000, {
                        _initialPriority: 'Low',
                        _priority: 'High',
                        _initiator_type: 'script',
                        _resourceType: 'image',
                    }),
                    entry(`${HERO}?sw=1600`, 1.2, 10, 0, { request: { url: `${HERO}?sw=1600`, _isLinkPreload: true } }),
                    entry('https://shop.test/banner.jpg', 1.4, 1000, 200_000, {
                        _priority: 'High',
                        _resourceType: 'image',
                    }),
                    entry('https://shop.test/app.js', 1.5, 500, 50_000, { _resourceType: 'script' }),
                ],
                audits: {
                    ...checklist({ requestDiscoverable: { value: false }, eagerlyLoaded: { value: false } }),
                    'render-blocking-insight': {
                        metricSavings: { LCP: 350.4 },
                        details: { items: [{ url: 'https://shop.test/a.css' }] },
                    },
                },
            }),
            plp: imageRun(),
        });
        const [home] = dataSchema.parse(result.data).pages;
        expect(home?.image).toMatchObject({
            entry: 1,
            startMs: 500,
            concurrentImageBytes: 180_000,
            concurrentScriptBytes: 50_000,
            imageDelayMs: 545,
            preloaded: false,
        });
        expect(home?.issues.map((issue) => [issue.check, issue.pointer])).toEqual([
            ['not-in-html', '/audits/lcp-discovery-insight'],
            ['lazy', '/audits/lcp-discovery-insight'],
            ['low-priority', '/log/entries/1'],
            ['preload-mismatch', '/log/entries/2'],
            ['competing-images', '/log/entries/3'],
            ['bandwidth', '/log/entries/3'],
            ['render-blocking', '/audits/render-blocking-insight'],
        ]);
        expect(home?.issues.map((issue) => issue.detail).slice(2)).toEqual([
            'The LCP image hero.jpg starts at Low priority and is raised to High only after layout; it has no fetchpriority="high".',
            `The page preloads hero.jpg at a different size from the one shown, so it downloads twice (${HERO}?sw=1600).`,
            '1 other image at High priority start before the LCP image: banner.jpg (195 KiB).',
            'Other images download 176 KiB while the 98 KiB LCP image loads, delaying it by about 545 ms; the largest is banner.jpg (176 KiB during the LCP download).',
            '1 render-blocking request (a.css) delay the LCP by about 350 ms.',
        ]);
        expect(result.decision?.severity).toBe('high');
        expect(result.decision?.summary).toMatch(
            /^home \(LCP 3000 ms\): The LCP image hero\.jpg is requested by JavaScript/
        );
        expect(result.decision?.summary).toMatch(/ The LCP element is text on plp\.$/);
    });

    it('fails medium when the LCP is unknown or within the threshold', async () => {
        const banner = (name: string) =>
            entry(`https://shop.test/${name}.jpg`, 1, 10, 20_000, { _priority: 'VeryHigh', _resourceType: 'image' });
        const result = await runRule(lcpImagePriority, {
            home: imageRun({
                lcp: null,
                lcpUrl: HERO,
                entries: [
                    entry(HERO, 1.5, 300, 50_000, { _initialPriority: 'Medium', _priority: 'Medium' }),
                    banner('a'),
                    banner('b'),
                    banner('c'),
                    banner('d'),
                ],
                audits: {
                    ...checklist({ requestDiscoverable: { value: 'unknown' } }),
                    'render-blocking-insight': {
                        metricSavings: { LCP: 120 },
                        details: { items: [{ url: 'https://shop.test/a.css' }, { url: 'https://shop.test/b.css' }] },
                    },
                },
            }),
        });
        const [home] = result.data.pages;
        expect(home?.issues.map((issue) => issue.detail)).toEqual([
            'The LCP image hero.jpg starts at Medium priority; it has no fetchpriority="high".',
            '4 other images at High priority start before the LCP image: a.jpg (20 KiB), b.jpg (20 KiB), c.jpg (20 KiB).',
            '2 render-blocking requests (a.css, b.css) delay the LCP by about 120 ms.',
        ]);
        expect(result.decision?.severity).toBe('medium');
        expect(result.decision?.summary).toMatch(/^home \(LCP unknown\):/);
    });

    it('passes a prioritized LCP image and notes text LCPs', async () => {
        const result = await runRule(lcpImagePriority, {
            home: imageRun({
                lcpUrl: HERO,
                entries: [
                    DOCUMENT,
                    entry(HERO, 1.1, 300, 100_000, {
                        _initialPriority: 'High',
                        request: { url: HERO, _isLinkPreload: true },
                    }),
                ],
                audits: { 'render-blocking-insight': { metricSavings: { LCP: 20 } } },
            }),
            plp: imageRun({ lcpUrl: HERO, entries: [entry(HERO, 1, 0, 0)] }),
            pdp: imageRun(),
        });
        expect(result.data.pages[1]?.image).toMatchObject({ imageDelayMs: 0, initialPriority: null });
        expect(result.decision?.status).toBe('pass');
        expect(result.decision?.summary).toBe(
            "The LCP image on home, plp is in the HTML, starts at High priority, isn't lazy-loaded and has no image competing for bandwidth. The LCP element is text on pdp."
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            'hero.jpg: High priority, preloaded, 98 KiB in 300 ms',
            'hero.jpg: unknown priority, found by the parser, 0 KiB in 0 ms',
        ]);
    });

    it('passes when every LCP element is text', async () => {
        const result = await runRule(lcpImagePriority, { home: imageRun(), plp: imageRun() });
        expect(result.decision).toMatchObject({
            status: 'pass',
            summary:
                'The LCP element is text on every measured page (home, plp), so there is no LCP image to prioritize.',
            evidence: [{ artifact: 'summary-lcp.json', value: 'LCP element is text' }, { page: 'plp' }],
        });
    });

    it('skips pages whose LCP image is not in the HAR', async () => {
        const result = await runRule(lcpImagePriority, {
            home: imageRun({ lcpUrl: HERO }),
            plp: imageRun({ lcpUrl: HERO, entries: [{ time: 1, request: { url: HERO }, response: { status: 200 } }] }),
            pdp: {},
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped.map((item) => item.reason)).toEqual([
            'The LCP image request was not found in the median run HAR.',
            'The LCP image request was not found in the median run HAR.',
            'summary-lcp.json has no mobile cold-cache median run.',
        ]);
    });
});
