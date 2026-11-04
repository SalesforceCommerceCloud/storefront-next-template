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
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCategoriesDir, discoverCatalog } from './catalog';
import { type PreparedRuleOutput, prepareRuleResults, readPreparedRuleResults, resultPathForRule } from './preparation';

const FIXTURE = path.join(import.meta.dirname, '__fixtures__', 'playhouse-archive');

async function fixturePage() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sfnext-preparation-'));
    const workspaceRoot = path.join(root, 'workspace');
    const archiveDir = path.join(root, 'archive');
    await cp(FIXTURE, archiveDir, { recursive: true });
    await mkdir(workspaceRoot);
    return {
        root,
        workspaceRoot,
        archiveDir,
        page: { label: 'home', url: 'https://example.com/', archiveDir, playhouseVersion: '9.9.9' },
    };
}
type Fixture = Awaited<ReturnType<typeof fixturePage>>;

const readJson = async (file: string): Promise<any> => JSON.parse(await readFile(file, 'utf8'));
/** Rewrites an archived JSON file in place. */
async function editJson(file: string, edit: (value: any) => void): Promise<any> {
    const value = await readJson(file);
    edit(value);
    await writeFile(file, JSON.stringify(value));
    return value;
}
const prepare = async (fixture: Fixture, pages: Fixture['page'][] = [fixture.page]) =>
    prepareRuleResults({
        catalog: await discoverCatalog(defaultCategoriesDir()),
        pages,
        workspaceRoot: fixture.workspaceRoot,
    });
// Results are rule-specific JSON, so tests read them loosely.
const byRule = (outputs: readonly PreparedRuleOutput[], ruleId: string): any =>
    outputs.find((output) => output.reference.ruleId === ruleId)?.result;
// Follows an RFC 6901 JSON pointer, so evidence is checked against the artifact it cites.
const resolvePointer = (json: unknown, pointer: string): unknown =>
    pointer
        .split('/')
        .slice(1)
        .reduce((node: any, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], json);

const lhrPath = (fixture: Fixture, run = 'mobile-cold-1') => path.join(fixture.archiveDir, 'runs', run, 'lhr.json');
const editLhr = async (fixture: Fixture, edit: (lhr: any) => void, run?: string) => {
    const lhr = await readJson(lhrPath(fixture));
    edit(lhr);
    await mkdir(path.dirname(lhrPath(fixture, run)), { recursive: true });
    await writeFile(lhrPath(fixture, run), JSON.stringify(lhr));
};
const fontRequests = (lhr: any): any[] => lhr.audits['network-requests'].details.items;

async function addFontDisplayArtifacts(
    fixture: Fixture,
    cells: Record<
        string,
        { url: string; display: string | null; duplicate?: boolean; status?: number; priority?: string }[]
    >
) {
    const summaryPath = path.join(fixture.archiveDir, 'summary.json');
    const summary = await readJson(summaryPath);
    summary.runs = Object.keys(cells).map((formFactor) => ({
        runId: `${formFactor}-cold-1`,
        formFactor,
        cacheState: 'cold',
        isMedian: true,
    }));
    await writeFile(summaryPath, JSON.stringify(summary));
    const sourceHar = await readJson(path.join(fixture.archiveDir, 'runs/mobile-cold-1/network.har'));
    for (const [formFactor, fonts] of Object.entries(cells)) {
        const runDir = path.join(fixture.archiveDir, 'runs', `${formFactor}-cold-1`);
        await mkdir(runDir, { recursive: true });
        const har = structuredClone(sourceHar);
        for (const font of fonts)
            har.log.entries.push({
                ...structuredClone(har.log.entries[0]),
                _resourceType: 'font',
                _priority: font.priority ?? 'High',
                request: { ...har.log.entries[0].request, url: font.url },
                response: { ...har.log.entries[0].response, status: font.status ?? 200 },
            });
        await writeFile(path.join(runDir, 'network.har'), JSON.stringify(har));
        const traceEvents = fonts.flatMap((font) =>
            font.display === null
                ? []
                : [
                      { name: 'BeginRemoteFontLoad', args: { url: font.url, display: font.display } },
                      ...(font.duplicate
                          ? [{ name: 'BeginRemoteFontLoad', args: { url: font.url, display: font.display } }]
                          : []),
                  ]
        );
        await writeFile(path.join(runDir, 'trace.json'), JSON.stringify({ traceEvents }));
    }
}

describe('prepareRuleResults', () => {
    it('filesystem companions decide metric budgets and header rules', async () => {
        const fixture = await fixturePage();
        const catalog = await discoverCatalog(defaultCategoriesDir());
        const outputs = await prepareRuleResults({
            catalog,
            pages: [fixture.page],
            workspaceRoot: fixture.workspaceRoot,
        });
        expect(outputs.map((output) => output.reference.ruleId)).toEqual([
            'best-practices/deferred-ui',
            'performance/app-config-size',
            'performance/cache-control',
            'performance/cls-budget',
            'performance/content-encoding',
            'performance/dom-size',
            'performance/font-display',
            'performance/html-document-size',
            'performance/image-dimensions',
            'performance/image-transformation',
            'performance/javascript-size',
            'performance/large-images',
            'performance/lcp-budget',
            'performance/lcp-image-priority',
            'performance/page-data-size',
            'performance/reduce-javascript-on-load',
            'performance/render-blocking-font-size',
            'performance/tbt-budget',
            'performance/third-party-fonts',
            'performance/ttfb-budget',
            'security/browser-hardening-headers',
            'security/content-security-policy',
            'security/html-config-secrets',
            'security/strict-transport-security',
        ]);
        // Secrets can't be recognized by a script, so that rule always goes to analysis. The fixture loads no
        // /mobify/bundle/ scripts, so the size rule is left undecided too; with no bundle analysis there are no
        // build to analyze, so reduce-javascript-on-load is decided as not verified.
        const undecided = new Set([
            'best-practices/deferred-ui',
            'performance/font-display',
            'security/html-config-secrets',
            'performance/javascript-size',
        ]);
        const expected = (ruleId: string) =>
            undecided.has(ruleId)
                ? undefined
                : ruleId === 'performance/reduce-javascript-on-load'
                  ? 'not-verified'
                  : 'pass';
        for (const output of outputs)
            expect(output.result.decision?.status, output.reference.ruleId).toBe(expected(output.reference.ruleId));
        expect(byRule(outputs, 'performance/javascript-size').data.skipped).toEqual([
            { page: 'home', reason: 'The run loaded no scripts from its own bundle path (mobify/bundle).' },
        ]);
        expect(byRule(outputs, 'performance/reduce-javascript-on-load').data.status).toBe('unavailable');
        // The document and the bundle are checked; the third-party script is skipped.
        expect(byRule(outputs, 'performance/content-encoding').data.checked).toEqual([
            { page: 'home', url: 'https://example.com/', responses: 2 },
        ]);
        expect(byRule(outputs, 'performance/cache-control').data.checked[0].responses).toBe(1);
        const lcp = byRule(outputs, 'performance/lcp-budget');
        expect(lcp.decision.status).toBe('pass');
        expect(lcp.data.pages).toEqual([{ page: 'home', value: 2100, threshold: 2500, runs: [], unmeasuredRuns: 0 }]);
        expect(lcp.decision.evidence).toEqual([
            {
                type: 'playhouse',
                page: 'home',
                artifact: 'summary.json',
                pointer: '/cells/0/medianRun/lcp',
                value: 'LCP 2100 ms (budget 2500 ms)',
            },
        ]);
        expect(
            resolvePointer(
                await readJson(path.join(fixture.archiveDir, 'summary.json')),
                lcp.decision.evidence[0].pointer
            )
        ).toBe(2100);
        expect(byRule(outputs, 'performance/tbt-budget').decision.status).toBe('pass');
        expect(byRule(outputs, 'performance/ttfb-budget').decision).toEqual({
            status: 'pass',
            summary: 'Mobile cold-cache representative-run TTFB is within 800 ms on every measured page (home 480 ms).',
            evidence: [
                {
                    type: 'playhouse',
                    page: 'home',
                    artifact: 'summary.json',
                    pointer: '/cells/0/medianRun/ttfb',
                    value: 'TTFB 480 ms (budget 800 ms)',
                },
            ],
        });
        expect(byRule(outputs, 'performance/cls-budget').decision.evidence[0].value).toBe('CLS 0.04 (budget 0.10)');
        // The logo is three times its displayed size, which is what a 3x screen needs.
        const [largeImages] = byRule(outputs, 'performance/large-images').data.pages;
        expect([largeImages.lighthouseItems, largeImages.dropped]).toEqual([1, 1]);
        expect(byRule(outputs, 'performance/image-transformation').decision.summary).toMatch(
            /^All 2 Commerce images of 10 KiB or more on home are resized by DIS/
        );
        expect(byRule(outputs, 'performance/lcp-image-priority').decision.evidence[0]).toEqual({
            type: 'playhouse',
            page: 'home',
            artifact: 'runs/mobile-cold-1/network.har',
            pointer: '/log/entries/1',
            value: 'hero.webp: High priority, preloaded, 78 KiB in 200 ms',
        });
        const hsts = byRule(outputs, 'security/strict-transport-security');
        expect(hsts.decision.status).toBe('pass');
        expect(hsts.decision.summary).toMatch(
            /sent Strict-Transport-Security with a max-age of at least 15552000 seconds/
        );
        expect(hsts.data.documents[0].maxAgeSeconds).toBe(15552000);
        expect(hsts.data.documents[0].includeSubDomains).toBe(true);
        for (const output of outputs)
            expect(await readJson(path.join(fixture.workspaceRoot, output.reference.path))).toEqual(output.result);
        expect(await readPreparedRuleResults(fixture.workspaceRoot, catalog.ruleIds)).toEqual(outputs);
    });

    it('HTML size rules split the document using its archived inline scripts', async () => {
        const outputs = await prepare(await fixturePage());
        const [size] = byRule(outputs, 'performance/html-document-size').data.pages;
        // The external bundle is not part of the HTML; the three inline scripts are.
        expect(size.htmlBytes).toBe(64000);
        expect(size.pageDataBytes > 0 && size.appConfigBytes > 0 && size.otherScriptBytes > 0).toBe(true);
        expect(size.markupBytes).toBe(64000 - size.pageDataBytes - size.appConfigBytes - size.otherScriptBytes);
        expect(size.scripts.pageData).toHaveLength(1);
        expect(size.appConfigSections).toEqual({ commerce: JSON.stringify({ api: {} }).length });
        expect(size.scripts.pageData[0]).toMatch(/^scripts\/[0-9a-f]{64}\.js$/);
        expect([size.elements, size.domDepth, size.lighthouseArtifact]).toEqual([
            640,
            14,
            'runs/mobile-cold-1/lhr.json',
        ]);
        const secrets = byRule(outputs, 'security/html-config-secrets').data.pages[0];
        expect([secrets.appConfig.length, secrets.pageData.length, secrets.other.length]).toEqual([1, 1, 1]);
        expect(byRule(outputs, 'performance/dom-size').decision.summary).toMatch(
            /Element count is within 1,400 on every measured page \(home 640\)/
        );
    });

    it('HTML size fails with its breakdown; page data, app config and DOM size go to analysis when over budget', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'network-mobile-cold.har'), (har) => {
            har.log.entries[0].response.content.size = 350 * 1024 + 40;
        });
        const index = await readJson(path.join(fixture.archiveDir, 'scripts', 'index.json'));
        const scripts = {
            0: `window.__reactRouterContext.streamController.enqueue(${JSON.stringify('x'.repeat(210 * 1024))});`,
            1: `window.__APP_CONFIG__ = ${JSON.stringify({ big: 'x'.repeat(13 * 1024) })};`,
        };
        for (const [i, text] of Object.entries(scripts))
            await writeFile(path.join(fixture.archiveDir, 'scripts', `${index.observations[i].body.sha256}.js`), text);
        await editJson(lhrPath(fixture), (lhr) => {
            lhr.audits['dom-size-insight'].details.items[0].value.value = 1620;
        });
        const outputs = await prepare(fixture);
        const html = byRule(outputs, 'performance/html-document-size');
        expect(html.decision.status).toBe('fail');
        expect(html.decision.summary).toMatch(
            /^HTML size is over 350 KiB on home \(just over 350 KiB: 210 KiB page data, 13 KiB app config, 0 KiB other inline scripts, 127 KiB markup\)\.$/
        );
        expect(html.decision.evidence[0].pointer).toBe('/log/entries/0/response/content/size');
        for (const ruleId of ['performance/page-data-size', 'performance/app-config-size', 'performance/dom-size']) {
            const result = byRule(outputs, ruleId);
            expect(result.decision, ruleId).toBeUndefined();
            expect(result.data.pages[0].page, ruleId).toBe('home');
        }
    });

    it('HTML size still decides without archived scripts; the script-based rules are skipped', async () => {
        const fixture = await fixturePage();
        await rm(path.join(fixture.archiveDir, 'scripts'), { recursive: true });
        const outputs = await prepare(fixture);
        expect(byRule(outputs, 'performance/html-document-size').decision.status).toBe('pass');
        expect(byRule(outputs, 'performance/html-document-size').data.pages[0].markupBytes).toBeNull();
        for (const ruleId of ['performance/page-data-size', 'performance/app-config-size']) {
            expect(byRule(outputs, ruleId).decision, ruleId).toBeUndefined();
            expect(byRule(outputs, ruleId).data.skipped[0].reason, ruleId).toMatch(/No .* measurement was archived/);
        }
    });

    it('font display fails blocking policies and deduplicates repeated trace events', async () => {
        const fixture = await fixturePage();
        const blocked = 'https://example.com/fonts/blocked.woff2';
        await addFontDisplayArtifacts(fixture, {
            mobile: [
                { url: blocked, display: 'block', duplicate: true },
                { url: 'https://zero.example/fonts/not-downloaded.woff2', display: 'block', status: 0 },
            ],
            desktop: [{ url: 'https://example.com/fonts/safe.woff2', display: 'swap' }],
        });
        const result = byRule(await prepare(fixture), 'performance/font-display');
        expect(result.decision.status).toBe('fail');
        expect(result.decision.severity).toBe('medium');
        expect(result.decision.summary).toMatch(/blocked\.woff2 from example\.com uses font-display: block/);
        expect(result.decision.summary).toContain('from example.com');
        expect(result.decision.summary).not.toContain('not-downloaded.woff2');
        expect(result.data.pages[0].cells.flatMap((cell: any) => cell.fonts)).toEqual([
            { url: blocked, display: 'block', status: 'fail', event: 0 },
            { url: 'https://example.com/fonts/safe.woff2', display: 'swap', status: 'pass', event: 0 },
        ]);
        expect(result.decision.evidence.map((item: any) => [item.artifact, item.pointer])).toEqual([
            ['runs/mobile-cold-1/trace.json', '/traceEvents/0/args/display'],
        ]);
    });

    it('font display stays undecided when a downloaded font has no trace policy', async () => {
        const fixture = await fixturePage();
        const preloaded = 'https://example.com/fonts/preloaded.woff2';
        await addFontDisplayArtifacts(fixture, {
            mobile: [{ url: preloaded, display: null }],
            desktop: [{ url: preloaded, display: null }],
        });
        const result = byRule(await prepare(fixture), 'performance/font-display');
        expect(result.decision).toBeUndefined();
        expect(
            result.data.pages[0].cells.map((cell: any) => [
                cell.status,
                cell.unverifiedFonts.map((font: any) => font.url),
            ])
        ).toEqual([
            ['undecided', [preloaded]],
            ['undecided', [preloaded]],
        ]);
    });

    it('font display ignores unsuccessful downloads and unsafe run IDs', async () => {
        const fixture = await fixturePage();
        await addFontDisplayArtifacts(fixture, {
            mobile: [{ url: 'https://example.com/fonts/missing.woff2', display: 'block', status: 404 }],
            desktop: [],
        });
        const summaryPath = path.join(fixture.archiveDir, 'summary.json');
        const summary = await readJson(summaryPath);
        summary.runs[0].runId = '../../outside';
        await writeFile(summaryPath, JSON.stringify(summary));
        const result = byRule(await prepare(fixture), 'performance/font-display');
        expect(result.decision.status).toBe('pass');
        expect(result.data.pages[0].cells[0].runId).toBe('mobile-cold-1');
        expect(result.data.pages[0].cells.map((cell: any) => [cell.status, cell.fonts])).toEqual([
            ['pass', []],
            ['pass', []],
        ]);
    });

    it('font display passes when every downloaded font uses swap or optional', async () => {
        const fixture = await fixturePage();
        await addFontDisplayArtifacts(fixture, {
            mobile: [{ url: 'https://example.com/fonts/swap.woff2', display: 'swap' }],
            desktop: [{ url: 'https://example.com/fonts/optional.woff2', display: 'optional' }],
        });
        const result = byRule(await prepare(fixture), 'performance/font-display');
        expect(result.decision.status).toBe('pass');
        expect(result.decision.summary).toMatch(/Every measured web font uses font-display: swap or optional/);
    });

    it('render-blocking font size counts preloaded and pre-LCP fonts once each, not fonts requested after LCP', async () => {
        const outputs = await prepare(await fixturePage());
        const fonts = byRule(outputs, 'performance/render-blocking-font-size');
        expect(fonts.decision.status).toBe('pass');
        expect(fonts.decision.summary).toBe(
            'Render-blocking fonts are within 75 KiB on every measured page (home 50 KiB in 2 files).'
        );
        const [page] = fonts.data.pages;
        expect([page.lighthouseArtifact, page.lcpMs, page.loadMs, page.renderBlockingBytes, page.laterBytes]).toEqual([
            'runs/mobile-cold-1/lhr.json',
            2100,
            1950,
            50 * 1024,
            48 * 1024,
        ]);
        // The late third-party font was requested twice but is one file; request times are aligned to navigation start.
        expect(
            page.fonts.map((font: any) => [
                font.requestMs,
                font.preloaded,
                font.renderBlocking,
                font.thirdParty,
                font.entry,
            ])
        ).toEqual([
            [311, true, true, false, 1],
            [901, false, true, false, 2],
            [9001, false, false, true, 3],
        ]);
    });

    it('render-blocking font size fails with each font and why it counts', async () => {
        const fixture = await fixturePage();
        await editLhr(fixture, (lhr) => {
            const requests = fontRequests(lhr);
            requests[2].resourceSize = 50 * 1024;
            // A font requested after LCP counts when it was preloaded.
            Object.assign(requests[3], { rendererStartTime: 2500, isLinkPreload: true, resourceSize: 10 * 1024 });
            requests.splice(4, 1);
            for (const [name, size] of [
                ['icons', 5],
                ['symbols', 4],
            ] as const)
                requests.push({
                    ...requests[1],
                    url: `https://example.com/fonts/${name}.woff2`,
                    resourceSize: size * 1024,
                });
        });
        const fonts = byRule(await prepare(fixture), 'performance/render-blocking-font-size');
        expect(fonts.decision.status).toBe('fail');
        expect(fonts.decision.summary).toBe(
            'Render-blocking fonts are over 75 KiB on home (99 KiB: brand-italic.woff2 50 KiB, brand-variable.woff2 30 KiB, inter-latin.woff2 10 KiB third-party, icons.woff2 5 KiB, +1 more).'
        );
        // Evidence is the largest fonts of each failing page, so one font-heavy page can't crowd out the others.
        expect(fonts.decision.evidence.map((item: any) => [item.pointer, item.value])).toEqual([
            [
                '/audits/network-requests/details/items/2/resourceSize',
                'brand-italic.woff2 50 KiB, requested at 901 ms, before LCP at 2100 ms',
            ],
            ['/audits/network-requests/details/items/1/resourceSize', 'brand-variable.woff2 30 KiB, preloaded'],
            [
                '/audits/network-requests/details/items/3/resourceSize',
                'inter-latin.woff2 10 KiB, third-party, preloaded',
            ],
            ['/audits/network-requests/details/items/4/resourceSize', 'icons.woff2 5 KiB, preloaded'],
        ]);
    });

    it('render-blocking font size stops counting at the load event when LCP comes later', async () => {
        const slowLcp = (lhr: any) => {
            lhr.audits.metrics.details.items[0].observedLargestContentfulPaint = 12000;
            // A font requested after the load event (1950 ms) but before the slow LCP is not render-blocking.
            fontRequests(lhr)[2].rendererStartTime = 2000;
            // Lighthouse fields that are null are treated like missing ones.
            Object.assign(fontRequests(lhr)[3], { entity: null, isLinkPreload: null });
        };
        const fixture = await fixturePage();
        await editLhr(fixture, slowLcp);
        const [page] = byRule(await prepare(fixture), 'performance/render-blocking-font-size').data.pages;
        expect([page.lcpMs, page.loadMs, page.renderBlockingBytes, page.laterBytes]).toEqual([
            12000,
            1950,
            30 * 1024,
            68 * 1024,
        ]);
        expect(page.fonts[2].thirdParty).toBe(true);

        // Without a load event the cutoff is LCP alone.
        const noLoad = await fixturePage();
        await editLhr(noLoad, (lhr) => {
            slowLcp(lhr);
            delete lhr.audits.metrics.details.items[0].observedLoad;
        });
        const fallback = byRule(await prepare(noLoad), 'performance/render-blocking-font-size');
        expect([
            fallback.data.pages[0].loadMs,
            fallback.data.pages[0].renderBlockingBytes,
            fallback.decision.status,
        ]).toEqual([null, 98 * 1024, 'fail']);
    });

    it('render-blocking font size reads the median mobile cold-cache run and passes a page without web fonts', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'summary.json'), (summary) => {
            summary.runs = [
                { runId: 'mobile-cold-1', formFactor: 'mobile', cacheState: 'cold', isMedian: false },
                { runId: 'mobile-cold-2', formFactor: 'mobile', cacheState: 'cold', isMedian: true },
            ];
        });
        await editLhr(
            fixture,
            (lhr) => {
                lhr.audits['network-requests'].details.items = fontRequests(lhr).slice(0, 1);
            },
            'mobile-cold-2'
        );
        const fonts = byRule(await prepare(fixture), 'performance/render-blocking-font-size');
        expect(fonts.data.pages[0].lighthouseArtifact).toBe('runs/mobile-cold-2/lhr.json');
        expect(fonts.decision.summary).toBe(
            'Render-blocking fonts are within 75 KiB on every measured page (home no render-blocking fonts).'
        );
    });

    it('render-blocking font size is not decided without the Lighthouse data it needs', async () => {
        const cases: [(lhr: any) => void, string][] = [
            [
                (lhr) => {
                    delete lhr.audits['network-requests'];
                },
                'The Lighthouse result has no network-requests audit.',
            ],
            [
                (lhr) => {
                    delete lhr.audits.metrics.details.items[0].observedLargestContentfulPaint;
                },
                'The Lighthouse result has no observed LCP.',
            ],
            [
                (lhr) => {
                    delete fontRequests(lhr)[2].rendererStartTime;
                },
                'The font request https://example.com/fonts/brand-italic.woff2 has no start time.',
            ],
        ];
        for (const [edit, reason] of cases) {
            const fixture = await fixturePage();
            await editLhr(fixture, edit);
            const fonts = byRule(await prepare(fixture), 'performance/render-blocking-font-size');
            expect(fonts.decision, reason).toBeUndefined();
            expect(fonts.data.skipped).toEqual([{ page: 'home', reason }]);
        }
    });

    it('third-party fonts passes when the only third-party font is requested after LCP', async () => {
        const fonts = byRule(await prepare(await fixturePage()), 'performance/third-party-fonts');
        expect(fonts.decision.status).toBe('pass');
        expect(fonts.decision.summary).toBe(
            'No measured page loads fonts from another origin before LCP (home 2 first-party fonts, 1 third-party after LCP or load).'
        );
        expect(
            fonts.data.pages[0].items.map((item: any) => [
                item.kind,
                item.host,
                item.requestMs,
                item.renderBlocking,
                item.entry,
            ])
        ).toEqual([['font', 'fonts.gstatic.com', 9001, false, 3]]);
    });

    it('third-party fonts fails on a Google Fonts stylesheet imported by the theme CSS before LCP', async () => {
        const fixture = await fixturePage();
        const appCss = 'https://example.com/assets/app.css';
        const googleCss = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';
        const font = 'https://fonts.gstatic.com/s/inter/v20/inter-latin.woff2';
        await editLhr(fixture, (lhr) => {
            const requests = fontRequests(lhr);
            requests[3].rendererStartTime = 600;
            requests.splice(4, 1);
            requests.push(
                {
                    ...requests[0],
                    url: appCss,
                    resourceType: 'Stylesheet',
                    rendererStartTime: 100,
                    resourceSize: 20000,
                },
                {
                    ...requests[3],
                    url: googleCss,
                    resourceType: 'Stylesheet',
                    rendererStartTime: 400,
                    resourceSize: 1500,
                }
            );
        });
        await editJson(path.join(fixture.archiveDir, 'runs', 'mobile-cold-1', 'network.har'), (har) => {
            for (const [url, initiator] of [
                [appCss, 'https://example.com/'],
                [googleCss, appCss],
                [font, googleCss],
            ])
                har.log.entries.push({
                    ...har.log.entries[0],
                    request: { ...har.log.entries[0].request, url },
                    _initiator: initiator,
                });
        });
        const fonts = byRule(await prepare(fixture), 'performance/third-party-fonts');
        expect(fonts.decision.status).toBe('fail');
        expect(fonts.decision.summary).toBe(
            'Fonts load from another origin before LCP on home (fonts.googleapis.com/css2?family=Inter:wght@400;700 imported by app.css; inter-latin.woff2 48 KiB from fonts.gstatic.com).'
        );
        expect(fonts.decision.evidence.map((item: any) => [item.pointer, item.value])).toEqual([
            [
                '/audits/network-requests/details/items/5/url',
                'Font stylesheet fonts.googleapis.com/css2?family=Inter:wght@400;700 from fonts.googleapis.com, requested at 401 ms, before LCP at 2100 ms, imported by app.css',
            ],
            [
                '/audits/network-requests/details/items/3/url',
                'Font inter-latin.woff2 48 KiB from fonts.gstatic.com, requested at 601 ms, before LCP at 2100 ms, loaded by fonts.googleapis.com/css2',
            ],
        ]);
        // The first-party stylesheet is not reported, and the HAR initiators are kept as data, with query values redacted.
        expect(fonts.data.pages[0].items.map((item: any) => [item.kind, item.stylesheet])).toEqual([
            ['stylesheet', appCss],
            ['font', 'https://fonts.googleapis.com/css2?family=%5BREDACTED%5D&display=%5BREDACTED%5D'],
        ]);
    });

    it('third-party fonts counts preloaded and unsized third-party fonts and is not decided without LCP', async () => {
        const preloaded = await fixturePage();
        await editLhr(preloaded, (lhr) => {
            fontRequests(lhr)[3].isLinkPreload = true;
        });
        const fonts = byRule(await prepare(preloaded), 'performance/third-party-fonts');
        expect(fonts.decision.status).toBe('fail');
        expect(fonts.decision.evidence[0].value).toBe(
            'Font inter-latin.woff2 48 KiB from fonts.gstatic.com, preloaded'
        );

        // Origin and timing decide, not bytes: a font Lighthouse reports without a size still counts.
        const unsized = await fixturePage();
        await editLhr(unsized, (lhr) => {
            Object.assign(fontRequests(lhr)[3], { rendererStartTime: 600, resourceSize: 0 });
            delete fontRequests(lhr)[4].resourceSize;
        });
        const zero = byRule(await prepare(unsized), 'performance/third-party-fonts');
        expect(zero.decision.status).toBe('fail');
        expect(zero.decision.evidence[0].value).toBe(
            'Font inter-latin.woff2 from fonts.gstatic.com, requested at 601 ms, before LCP at 2100 ms'
        );

        const noLcp = await fixturePage();
        await editLhr(noLcp, (lhr) => {
            delete lhr.audits.metrics.details.items[0].observedLargestContentfulPaint;
        });
        const undecided = byRule(await prepare(noLcp), 'performance/third-party-fonts');
        expect(undecided.decision).toBeUndefined();
        expect(undecided.data.skipped).toEqual([
            { page: 'home', reason: 'The Lighthouse result has no observed LCP.' },
        ]);
    });

    it('HSTS companion deterministically fails a below-baseline header', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'network-mobile-cold.har'), (har) => {
            har.log.entries[0].response.headers[1].value = 'max-age=60';
        });
        const hsts = byRule(await prepare(fixture), 'security/strict-transport-security');
        expect(hsts.decision.status).toBe('fail');
        expect(hsts.data.documents[0].reasons.join(' ')).toMatch(/below 15552000/);
    });

    it('companion discovery rejects orphan modules and can be disabled for custom catalogs', async () => {
        const fixture = await fixturePage();
        const catalog = await discoverCatalog(defaultCategoriesDir());
        expect(
            await prepareRuleResults({
                catalog,
                pages: [fixture.page],
                workspaceRoot: fixture.workspaceRoot,
                companionRoot: false,
            })
        ).toEqual([]);
        const companionRoot = path.join(fixture.root, 'companions');
        await mkdir(path.join(companionRoot, 'performance', 'rules'), { recursive: true });
        await writeFile(
            path.join(companionRoot, 'performance', 'rules', 'orphan.js'),
            'export default () => ({data:{}});'
        );
        await expect(
            prepareRuleResults({ catalog, pages: [fixture.page], workspaceRoot: fixture.workspaceRoot, companionRoot })
        ).rejects.toThrow(/no matching catalog rule/);
    });

    it('metric budget fails a page over its threshold and skips pages without a mobile cold cell', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'summary.json'), (summary) => {
            summary.cells[0].medianRun.tbt = 650;
            summary.cells[0].medianRun.ttfb = 1250;
            summary.runs = [
                { runId: 'mobile-cold-1', formFactor: 'mobile', cacheState: 'cold', row: { tbt: 640 } },
                { runId: 'desktop-cold-1', formFactor: 'desktop', cacheState: 'cold', row: { tbt: 10 } },
            ];
        });
        const other = await fixturePage();
        await editJson(path.join(other.archiveDir, 'summary.json'), (summary) => {
            summary.cells[0].formFactor = 'desktop';
        });
        const outputs = await prepare(fixture, [fixture.page, { ...other.page, label: 'pdp' }]);
        const tbt = byRule(outputs, 'performance/tbt-budget');
        expect(tbt.decision.status).toBe('fail');
        expect(tbt.decision.summary).toMatch(/home 650 ms/);
        expect(tbt.data.pages[0].runs).toEqual([640]);
        expect(tbt.data.skipped[0].page).toBe('pdp');
        const ttfb = byRule(outputs, 'performance/ttfb-budget');
        expect(ttfb.decision.status).toBe('fail');
        expect(ttfb.decision.severity).toBe('medium');
        expect(ttfb.decision.summary).toMatch(/home 1250 ms/);
        expect(ttfb.data.skipped[0].page).toBe('pdp');
    });

    it('metric budgets skip a page Playhouse could not measure, but still pass a real TBT and CLS of 0', async () => {
        const failed = await fixturePage();
        await editJson(path.join(failed.archiveDir, 'summary.json'), (summary) => {
            Object.assign(summary.cells[0].medianRun, { score: 0, lcp: 0, tbt: 0, cls: 0 });
        });
        const real = await fixturePage();
        await editJson(path.join(real.archiveDir, 'summary.json'), (summary) => {
            Object.assign(summary.cells[0].medianRun, { lcp: 1800, tbt: 0, cls: 0 });
            summary.runs = [
                {
                    runId: 'mobile-cold-1',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { lcp: 1800, tbt: 0, cls: 0 },
                },
                { runId: 'mobile-cold-2', formFactor: 'mobile', cacheState: 'cold', row: { lcp: 0, tbt: 0, cls: 0 } },
            ];
        });
        const reason = 'Not measured: no mobile/cold run in summary.json has a positive LCP.';

        const alone = await prepare(failed, [{ ...failed.page, label: 'pdp' }]);
        for (const ruleId of ['performance/lcp-budget', 'performance/tbt-budget', 'performance/cls-budget']) {
            const result = byRule(alone, ruleId);
            expect(result.decision, ruleId).toBeUndefined();
            expect(result.data.skipped, ruleId).toEqual([{ page: 'pdp', reason }]);
        }
        expect(byRule(alone, 'performance/ttfb-budget').data.skipped).toEqual([
            {
                page: 'pdp',
                reason: 'Not measured: no mobile/cold run in summary.json has a positive LCP and valid TTFB.',
            },
        ]);

        const mixed = await prepare(real, [real.page, { ...failed.page, label: 'pdp' }]);
        const tbt = byRule(mixed, 'performance/tbt-budget');
        expect(tbt.decision.status).toBe('pass');
        expect(tbt.data.pages.map((entry: any) => [entry.page, entry.value, entry.runs])).toEqual([['home', 0, [0]]]);
        expect(tbt.data.skipped).toEqual([{ page: 'pdp', reason }]);
        expect(byRule(mixed, 'performance/cls-budget').decision.status).toBe('pass');
        expect(byRule(mixed, 'performance/lcp-budget').decision.status).toBe('pass');
    });

    it('TTFB budget keeps its boundaries and uses the worst failing page for severity', async () => {
        const makePage = async (label: string, ttfb: number) => {
            const fixture = await fixturePage();
            await editJson(path.join(fixture.archiveDir, 'summary.json'), (summary) => {
                summary.cells[0].medianRun.ttfb = ttfb;
            });
            return { fixture, page: { ...fixture.page, label } };
        };
        const atBudget = await makePage('home', 800);
        const justOver = await makePage('plp', 801);
        const atHigh = await makePage('pdp', 1800);
        const overHigh = await makePage('cart', 1801);

        const pass = await prepare(atBudget.fixture, [atBudget.page]);
        expect(byRule(pass, 'performance/ttfb-budget').decision.status).toBe('pass');

        const medium = await prepare(justOver.fixture, [justOver.page, atHigh.page]);
        expect(byRule(medium, 'performance/ttfb-budget').decision.severity).toBe('medium');
        expect(byRule(medium, 'performance/ttfb-budget').decision.summary).toMatch(/plp 801 ms, pdp 1800 ms/);

        const high = await prepare(overHigh.fixture, [overHigh.page]);
        expect(byRule(high, 'performance/ttfb-budget').decision.severity).toBe('high');
    });

    it('TTFB budget excludes zero values and reselects from valid measured runs', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'summary.json'), (summary) => {
            summary.cells[0].medianRun = { score: 90, lcp: 2000, tbt: 50, cls: 0.01, ttfb: 0 };
            summary.runs = [
                {
                    runId: 'mobile-cold-1',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { score: 90, lcp: 2000, tbt: 50, cls: 0.01, ttfb: 0 },
                },
                {
                    runId: 'mobile-cold-2',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { score: 90, lcp: 2100, tbt: 50, cls: 0.01, ttfb: 1200 },
                },
                {
                    runId: 'mobile-cold-3',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { score: 90, lcp: 2200, tbt: 50, cls: 0.01, ttfb: 1300 },
                },
            ];
        });
        const ttfb = byRule(await prepare(fixture), 'performance/ttfb-budget');
        expect(ttfb.decision.status).toBe('fail');
        expect(ttfb.data.pages[0]).toEqual({
            page: 'home',
            value: 1200,
            threshold: 800,
            runs: [1200, 1300],
            unmeasuredRuns: 1,
        });
        expect(ttfb.decision.evidence).toEqual([
            {
                type: 'playhouse',
                page: 'home',
                artifact: 'summary.json',
                pointer: '/runs/1/row/ttfb',
                value: 'TTFB 1200 ms (budget 800 ms; measured spread 1200 ms–1300 ms; 1 run not measured, left out)',
            },
        ]);
    });

    it('metric-specific validity does not reselect the representative run for existing budgets', async () => {
        const fixture = await fixturePage();
        await editJson(path.join(fixture.archiveDir, 'summary.json'), (summary) => {
            delete summary.cells[0].medianRun.tbt;
            summary.runs = [
                {
                    runId: 'mobile-cold-1',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { score: 90, lcp: 1900, tbt: 100, cls: 0.01, ttfb: 500 },
                },
                {
                    runId: 'mobile-cold-2',
                    formFactor: 'mobile',
                    cacheState: 'cold',
                    row: { score: 90, lcp: 2100, tbt: 120, cls: 0.01, ttfb: 550 },
                },
            ];
        });
        const tbt = byRule(await prepare(fixture), 'performance/tbt-budget');
        expect(tbt.decision).toBeUndefined();
        expect(tbt.data.pages).toEqual([]);
        expect(tbt.data.skipped).toEqual([{ page: 'home', reason: 'No mobile/cold median TBT in summary.json.' }]);
    });

    it('metric budgets judge a partly failed page on its measured runs only', async () => {
        const fixture = await fixturePage();
        const row = (lcp: number) =>
            lcp ? { score: 60, lcp, tbt: 150, cls: 0.05 } : { score: 0, lcp: 0, tbt: 0, cls: 0 };
        const summary = await editJson(path.join(fixture.archiveDir, 'summary.json'), (value) => {
            // Playhouse's median of [0, 2400, 2600, 9000] is 2500; the tie picks the 2400 run, which would pass.
            value.cells[0].medianRun = row(2400);
            value.runs = [0, 2400, 2600, 9000].map((lcp, i) => ({
                runId: `mobile-cold-${i + 1}`,
                formFactor: 'mobile',
                cacheState: 'cold',
                row: row(lcp),
            }));
        });
        const lcp = byRule(await prepare(fixture), 'performance/lcp-budget');
        expect(lcp.decision.status).toBe('fail');
        expect(lcp.decision.evidence).toEqual([
            {
                type: 'playhouse',
                page: 'home',
                artifact: 'summary.json',
                pointer: '/runs/2/row/lcp',
                value: 'LCP 2600 ms (budget 2500 ms; 1 run not measured, left out)',
            },
        ]);
        expect(resolvePointer(summary, lcp.decision.evidence[0].pointer)).toBe(2600);
        expect(lcp.data.pages[0]).toEqual({
            page: 'home',
            value: 2600,
            threshold: 2500,
            runs: [2400, 2600, 9000],
            unmeasuredRuns: 1,
        });
    });

    it('header rules fail with the offending responses and skip pages without a HAR', async () => {
        const fixture = await fixturePage();
        const set = (entry: any, name: string, value: string | null) => {
            entry.response.headers = entry.response.headers.filter(
                (item: any) => item.name.toLowerCase() !== name.toLowerCase()
            );
            if (value !== null) entry.response.headers.push({ name, value });
        };
        await editJson(path.join(fixture.archiveDir, 'network-mobile-cold.har'), (har) => {
            const [doc, bundle] = har.log.entries;
            set(doc, 'Content-Security-Policy', null);
            set(doc, 'Content-Security-Policy-Report-Only', "default-src 'self'");
            set(doc, 'Referrer-Policy', 'no-referrer, unsafe-url');
            set(bundle, 'Content-Encoding', null);
            set(bundle, 'Cache-Control', 'public, max-age=600');
            set(doc, 'Cache-Control', null);
        });
        const empty = await fixturePage();
        await rm(path.join(empty.archiveDir, 'network-mobile-cold.har'));
        const outputs = await prepare(fixture, [fixture.page, { ...empty.page, label: 'pdp' }]);
        const reasons = (ruleId: string) =>
            byRule(outputs, ruleId).data.failures.flatMap((failure: any) => failure.reasons);
        expect(reasons('security/content-security-policy')).toEqual(['Content-Security-Policy is report-only.']);
        expect(reasons('security/browser-hardening-headers')).toEqual([
            'Neither CSP frame-ancestors nor X-Frame-Options is set.',
            'Referrer-Policy unsafe-url discloses more than the baseline allows.',
        ]);
        expect(reasons('performance/content-encoding')).toEqual([
            'JS response of 39 KiB has no br, gzip or zstd Content-Encoding.',
        ]);
        expect(reasons('performance/cache-control')).toEqual([
            'max-age=600 is under 31536000 seconds for a fingerprinted asset.',
        ]);
        const compression = byRule(outputs, 'performance/content-encoding');
        expect(compression.decision.status).toBe('fail');
        expect(compression.decision.evidence).toEqual([
            {
                type: 'playhouse',
                page: 'home',
                artifact: 'network-mobile-cold.har',
                pointer: '/log/entries/1/response/headers',
                value: 'https://example.com/assets/entry.client-Be9z2OkY.js: JS response of 39 KiB has no br, gzip or zstd Content-Encoding.',
            },
        ]);
        expect(compression.data.skipped[0].page).toBe('pdp');
    });

    it('header rules stay undecided when no page has a HAR', async () => {
        const fixture = await fixturePage();
        await rm(path.join(fixture.archiveDir, 'network-mobile-cold.har'));
        const outputs = await prepare(fixture);
        for (const ruleId of [
            'security/content-security-policy',
            'security/browser-hardening-headers',
            'performance/content-encoding',
            'performance/cache-control',
        ])
            expect(byRule(outputs, ruleId).decision, ruleId).toBeUndefined();
    });

    it('image rules flag a slow, contended LCP image, a raw oversized banner and a plausible layout shift', async () => {
        const fixture = await fixturePage();
        const json = (name: string, edit: (value: any) => void) => editJson(path.join(fixture.archiveDir, name), edit);
        const banner = 'https://example.com/on/demandware.static/-/Library-Sites-shared/default/banner.jpg';
        await json('summary-lcp.json', (summary) => {
            summary.cells[0].median.lcp = 3200;
        });
        await json('runs/mobile-cold-1/network.har', (har) => {
            Object.assign(har.log.entries[1], { _initialPriority: 'Low', _priority: 'High' });
            // Starts just before the hero and downloads alongside it.
            har.log.entries.push({
                _requestTime: 100.31,
                _resourceType: 'image',
                _priority: 'High',
                _initialPriority: 'High',
                time: 250,
                request: { method: 'GET', url: banner },
                response: { status: 200, bodySize: 200000, content: { size: 200000, mimeType: 'image/jpeg' } },
            });
        });
        await json('runs/mobile-cold-1/lhr.json', (lhr) => {
            lhr.audits['lcp-discovery-insight'].details.items[0].items.eagerlyLoaded.value = false;
            const node = {
                type: 'node',
                path: '1,HTML,1,BODY,0,DIV,0,IMG',
                selector: 'div.banner > img',
                snippet: `<img src="${banner}">`,
                boundingRect: { top: 100, bottom: 300, width: 360, height: 200 },
            };
            lhr.audits['image-delivery-insight'].details.items.push({
                url: banner,
                totalBytes: 200000,
                wastedBytes: 190000,
                node,
                subItems: {
                    items: [
                        {
                            reason: 'This image file is larger than it needs to be (2400x1333) for its displayed dimensions (360x200). Use responsive images to reduce the image download size.',
                            wastedBytes: 190000,
                        },
                    ],
                },
            });
            lhr.audits['unsized-images'].details.items.push({ url: banner, node });
            const row = (selector: string, top: number, score: number, culprit: unknown) => ({
                node: { type: 'node', selector, boundingRect: { top, bottom: top + 400 } },
                score,
                subItems: { items: [{ cause: 'Unsized image element', extra: culprit }] },
            });
            lhr.audits['cls-culprits-insight'].details.items = [
                {
                    type: 'table',
                    items: [
                        { node: { type: 'text', value: 'Total' }, score: 0.05 },
                        row('main > div.grid', 300, 0.05, node),
                    ],
                },
                // Lighthouse also blames a footer icon for moving content far above it.
                {
                    type: 'table',
                    items: [
                        { node: { type: 'text', value: 'Total' }, score: 0.2 },
                        row('main > h1', 50, 0.2, {
                            type: 'node',
                            selector: 'footer img',
                            boundingRect: { top: 4000, bottom: 4014 },
                        }),
                    ],
                },
            ];
        });
        const outputs = await prepare(fixture);

        const priority = byRule(outputs, 'performance/lcp-image-priority');
        expect(priority.decision.status).toBe('fail');
        // Over the 2.5 s LCP threshold, so the rule's full severity.
        expect(priority.decision.severity).toBe('high');
        expect(priority.data.pages[0].issues.map((issue: any) => issue.check)).toEqual([
            'lazy',
            'low-priority',
            'competing-images',
            'bandwidth',
        ]);
        expect(priority.data.pages[0].image.imageDelayMs).toBeGreaterThanOrEqual(100);
        expect(priority.decision.evidence.find((item: any) => item.value.startsWith('Other images')).pointer).toBe(
            '/log/entries/4'
        );

        const transformation = byRule(outputs, 'performance/image-transformation');
        expect(transformation.decision).toBeUndefined();
        expect(transformation.data.pages[0].images.map((image: any) => [image.url, image.problems])).toEqual([
            [banner, ['bypasses-dis']],
        ]);

        const large = byRule(outputs, 'performance/large-images');
        expect(large.decision).toBeUndefined();
        const [image] = large.data.pages[0].images;
        expect([
            image.url,
            image.reasons.map((reason: any) => reason.kind),
            image.aboveFold,
            image.requestedBeforeLcp,
        ]).toEqual([banner, ['oversized'], true, true]);
        // 1080x600 of 2400x1333 pixels is needed at 3x, so about 80% of the bytes can go.
        expect(image.savingsBytes).toBeGreaterThan(155000);
        expect(image.savingsBytes).toBeLessThan(165000);

        const dimensions = byRule(outputs, 'performance/image-dimensions');
        expect(dimensions.decision).toBeUndefined();
        const [page] = dimensions.data.pages;
        expect(page.unsizedShift).toBe(0.05);
        expect(
            page.shifts.map((shift: any) => shift.culprits.map((culprit: any) => [culprit.url, culprit.plausible]))
        ).toEqual([[[banner, true]], [[null, false]]]);
    });
});

describe('resultPathForRule', () => {
    it('derives result paths fixed by rule ID', () => {
        expect(resultPathForRule('performance/lcp-budget')).toBe(
            'results/categories/performance/rules/lcp-budget.json'
        );
        expect(() => resultPathForRule('../escape')).toThrow(/Invalid rule id/);
    });
});
