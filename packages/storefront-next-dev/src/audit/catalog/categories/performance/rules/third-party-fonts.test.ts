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
import thirdPartyFonts, { dataSchema } from './third-party-fonts';

const GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family=Inter&display=swap';
const GOOGLE_FONT = 'https://fonts.gstatic.com/inter.woff2';
const DOCUMENT = { url: PAGE_URL, resourceType: 'Document', entity: 'shop' };
const request = (url: string, resourceType: string, startMs?: number, extra: Record<string, unknown> = {}) => ({
    url,
    resourceType,
    ...(startMs === undefined ? {} : { rendererStartTime: startMs }),
    ...extra,
});
const lhr = (items: unknown[], metrics: Record<string, unknown> = { observedLargestContentfulPaint: 2000 }) => ({
    audits: {
        'network-requests': { details: { items } },
        metrics: { details: { items: [metrics] } },
    },
});
const har = (initiators: Record<string, string>) => ({
    log: {
        entries: Object.entries(initiators).map(([url, initiator]) => ({ request: { url }, _initiator: initiator })),
    },
});

describe('performance/third-party-fonts', () => {
    it('fails third-party fonts and font stylesheets requested before LCP', async () => {
        const cdn = (name: string, startMs: number) =>
            request(`https://cdn.test/${name}.woff2`, 'Font', startMs, { entity: 'CDN' });
        const result = await runRule(thirdPartyFonts, {
            home: {
                'runs/mobile-cold-1/lhr.json': lhr([
                    DOCUMENT,
                    request(`${PAGE_URL}app.css`, 'Stylesheet', 50, { entity: 'shop' }),
                    request(GOOGLE_CSS, 'Stylesheet', 100, { entity: 'Google Fonts' }),
                    request(GOOGLE_FONT, 'Font', 300, { entity: 'Google Fonts', resourceSize: 20 * 1024 }),
                    request(GOOGLE_FONT, 'Font', 200, { entity: 'Google Fonts', isLinkPreload: true }),
                    request(`${PAGE_URL}own.woff2`, 'Font', 100, { entity: 'shop' }),
                    request('https://cdn.test/broken.woff2', 'Font', 100, { entity: 'CDN', statusCode: 404 }),
                    request('not a url', 'Stylesheet', 150, { entity: 'Odd' }),
                    cdn('odd', 160),
                    cdn('f1', 400),
                    cdn('f2', 500),
                    cdn('f3', 600),
                    cdn('f4', 700),
                ]),
                'runs/mobile-cold-1/network.har': har({
                    [GOOGLE_CSS]: `${PAGE_URL}app.css`,
                    [GOOGLE_FONT]: GOOGLE_CSS,
                    'https://cdn.test/odd.woff2': 'not a url',
                }),
            },
        });
        const [home] = dataSchema.parse(result.data).pages;
        expect([home?.firstPartyFonts, home?.harArtifact, home?.items.length]).toEqual([
            1,
            'runs/mobile-cold-1/network.har',
            8,
        ]);
        expect(result.decision?.summary).toBe(
            'Fonts load from another origin before LCP on home (fonts.googleapis.com/css2?family=Inter imported by app.css; not a url; odd.woff2 from cdn.test; inter.woff2 20 KiB from fonts.gstatic.com; +4 more).'
        );
        expect(result.decision?.evidence.map((item) => ('value' in item ? item.value : undefined))).toEqual([
            'Font stylesheet fonts.googleapis.com/css2?family=Inter from fonts.googleapis.com, requested at 100 ms, before LCP at 2000 ms, imported by app.css',
            'Font stylesheet not a url from not a url, requested at 150 ms, before LCP at 2000 ms',
            'Font odd.woff2 from cdn.test, requested at 160 ms, before LCP at 2000 ms, loaded by not a url',
            'Font inter.woff2 20 KiB from fonts.gstatic.com, preloaded, loaded by fonts.googleapis.com/css2',
        ]);
        expect(result.decision?.evidence[3]).toMatchObject({ pointer: '/audits/network-requests/details/items/4/url' });
    });

    it('without a HAR, counts stylesheets from the same entity as a third-party font', async () => {
        const result = await runRule(thirdPartyFonts, {
            home: {
                'runs/mobile-cold-1/lhr.json': lhr([
                    DOCUMENT,
                    request(GOOGLE_CSS, 'Stylesheet', 100, { entity: 'Google Fonts' }),
                    request('https://fonts.googleapis.com/css', 'Stylesheet', undefined, { entity: 'Google Fonts' }),
                    request('https://other.test/x.css', 'Stylesheet', 100),
                    request(GOOGLE_FONT, 'Font', 2500, { entity: 'Google Fonts' }),
                ]),
            },
        });
        expect(result.data.pages[0]?.harArtifact).toBeNull();
        expect(result.data.pages[0]?.items.map((item) => [item.kind, item.renderBlocking])).toEqual([
            ['stylesheet', true],
            ['font', false],
        ]);
        expect(result.decision?.status).toBe('fail');
    });

    it('passes when third-party fonts come after LCP or load', async () => {
        const result = await runRule(thirdPartyFonts, {
            home: {
                'summary.json': { runs: [{ runId: 'mobile-cold-3', formFactor: 'mobile', cacheState: 'cold' }] },
                'runs/mobile-cold-3/lhr.json': lhr(
                    [
                        { url: PAGE_URL, resourceType: 'Document' },
                        request(GOOGLE_FONT, 'Font', 1600),
                        request(`${PAGE_URL}own.woff2`, 'Font', 100),
                    ],
                    { observedLargestContentfulPaint: 2000, observedLoad: 1500 }
                ),
            },
            plp: { 'runs/mobile-cold-1/lhr.json': lhr([DOCUMENT]) },
        });
        expect(result.data.pages[0]).toMatchObject({ lighthouseArtifact: 'runs/mobile-cold-3/lhr.json', loadMs: 1500 });
        expect(result.decision?.summary).toBe(
            'No measured page loads fonts from another origin before LCP (home 1 first-party font, 1 third-party after LCP or load, plp 0 first-party fonts).'
        );
    });

    it('skips pages it cannot measure', async () => {
        const result = await runRule(thirdPartyFonts, {
            home: {},
            plp: { 'runs/mobile-cold-1/lhr.json': { audits: {} } },
            pdp: { 'runs/mobile-cold-1/lhr.json': lhr([DOCUMENT], {}) },
            cart: { 'runs/mobile-cold-1/lhr.json': lhr([]) },
            search: { 'runs/mobile-cold-1/lhr.json': lhr([DOCUMENT, request(GOOGLE_FONT, 'Font')]) },
        });
        expect(result.decision).toBeUndefined();
        expect(result.data.skipped.map((item) => item.reason)).toEqual([
            'runs/mobile-cold-1/lhr.json is missing.',
            'The Lighthouse result has no network-requests audit.',
            'The Lighthouse result has no observed LCP.',
            'The Lighthouse result has no document request to tell first- from third-party.',
            `The font request ${GOOGLE_FONT} has no start time.`,
        ]);
    });
});
