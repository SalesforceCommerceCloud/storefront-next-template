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
/* oxlint-disable typescript/ban-ts-comment -- Parser fixtures intentionally use loose archive shapes. */
// @ts-nocheck
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { discoverCatalog, defaultCategoriesDir } from './catalog';
import { prepareRuleResults } from './preparation';

const deferredUi = await import('./rule-helpers/deferred-ui');
const prepareDeferredUiRule = (await import('./catalog/categories/best-practices/rules/deferred-ui')).default;

test('hidden markup measurement follows mobile and desktop visibility rules', () => {
    const html = `<!doctype html><html><body>
    <main></main>
    <div id="desktop" class="hidden lg:block"><span></span></div>
    <section id="mobile" class="md:hidden"><b></b></section>
    <div id="always" hidden><i></i></div>
    <div id="S:1" hidden><em></em></div>
    <script>const fake = '<div hidden><span></span></div>'</script>
    <style>.hidden { display: none }</style>
  </body></html>`;
    assert.deepEqual(deferredUi.measureHiddenMarkup?.(html), {
        bodyElements: 12,
        mobile: {
            hiddenElements: 4,
            share: 4 / 12,
            largestRoots: [
                { selector: 'div#desktop', elements: 2 },
                { selector: 'div#always', elements: 2 },
            ],
        },
        desktop: {
            hiddenElements: 4,
            share: 4 / 12,
            largestRoots: [
                { selector: 'section#mobile', elements: 2 },
                { selector: 'div#always', elements: 2 },
            ],
        },
    });
});

test('hidden markup candidates require both 100 elements and a 20 percent share', () => {
    assert.equal(deferredUi.isHiddenMarkupCandidate?.(100, 500), true);
    assert.equal(deferredUi.isHiddenMarkupCandidate?.(99, 100), false);
    assert.equal(deferredUi.isHiddenMarkupCandidate?.(100, 501), false);
});

test('larger Tailwind breakpoints override earlier display utilities', () => {
    const html = `<body>
    <div class="md:hidden lg:block"><span></span></div>
    <div class="hidden lg:block xl:hidden 2xl:flex"><b></b></div>
  </body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 2);
    assert.equal(measured?.desktop.hiddenElements, 0);
});

test('effective inline display overrides hidden sources using CSS declaration precedence', () => {
    const html = `<body>
    <div id="class-visible" class="hidden" style="display:block"><span></span></div>
    <div id="attribute-visible" hidden style="display:flex"><span></span></div>
    <div id="later-visible" style="display:none;display:grid"><span></span></div>
    <div id="later-hidden" style="display:block;display:none"><span></span></div>
    <div id="important-hidden" style="display:none!important;display:block"><span></span></div>
  </body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 4);
    assert.deepEqual(
        measured?.mobile.largestRoots.map((root) => root.selector),
        ['div#later-hidden', 'div#important-hidden']
    );
});

test('inherited object properties are not accepted as Tailwind breakpoints', () => {
    Object.defineProperty(Object.prototype, 'inherited-breakpoint', {
        configurable: true,
        value: 100,
    });
    try {
        const measured = deferredUi.measureHiddenMarkup?.(
            '<body><div class="inherited-breakpoint:hidden"><span></span></div></body>'
        );
        assert.equal(measured?.mobile.hiddenElements, 0);
    } finally {
        delete Object.prototype['inherited-breakpoint'];
    }
});

test('hexadecimal React streaming segments are not counted as hidden UI', () => {
    const html = `<body>
    <div hidden id="S:a"><span></span></div>
    <div hidden id="S:ff"><b></b></div>
    <div hidden id="not-a-segment"><i></i></div>
  </body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 2);
    assert.equal(measured?.desktop.hiddenElements, 2);
    assert.deepEqual(measured?.mobile.largestRoots, [{ selector: 'div#not-a-segment', elements: 2 }]);
});

test('React streaming wrappers for SVG, MathML, and table contexts are not hidden UI', () => {
    const html = `<body>
    <div hidden id="shop-S:a"><span></span></div>
    <svg aria-hidden="true" style="display:none" id="shop-S:b"><g></g></svg>
    <math aria-hidden="true" style="display:none" id="shop-S:c"><mi></mi></math>
    <table hidden id="shop-S:d"><tbody><tr><td></td></tr></tbody></table>
    <table hidden><tbody id="shop-S:e"><tr><td></td></tr></tbody></table>
    <table hidden><tr id="shop-S:f"><td></td></tr></table>
    <table hidden><colgroup id="shop-S:10"><col></colgroup></table>
  </body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 0);
    assert.equal(measured?.desktop.hiddenElements, 0);
});

test('a hidden outer table is not mistaken for a nested React table scaffold', () => {
    const html = `<body><table hidden id="real-ui"><tbody><tr><td>
    <table hidden><tbody id="shop-S:a"><tr><td></td></tr></tbody></table>
  </td></tr></tbody></table></body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 8);
    assert.deepEqual(measured?.mobile.largestRoots, [{ selector: 'table#real-ui', elements: 8 }]);
});

test('a hidden table with a React-shaped sibling section remains hidden UI', () => {
    const html = `<body><table hidden id="real-ui">
    <tbody><tr><td>${'<i></i>'.repeat(110)}</td></tr></tbody>
    <tbody id="shop-S:a"></tbody>
  </table></body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.ok(measured?.mobile.hiddenElements > 100);
    assert.equal(measured?.mobile.largestRoots[0]?.selector, 'table#real-ui');
});

test('Tailwind display utilities can override hidden at larger breakpoints', () => {
    const utilities = ['inline-grid', 'list-item', 'flow-root', 'table-cell'];
    const html = `<body>${utilities.map((utility) => `<div class="lg:hidden xl:${utility}"><span></span></div>`).join('')}</body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 0);
    assert.equal(measured?.desktop.hiddenElements, 0);
});

test('Tailwind range and arbitrary breakpoints apply at each measured viewport', () => {
    const html = `<body>
    <div id="mobile-range" class="max-lg:hidden"><span></span></div>
    <div id="wide-range" class="max-[2000px]:hidden"><b></b></div>
    <div id="mobile-visible" class="hidden max-lg:block"><i></i></div>
  </body>`;
    const measured = deferredUi.measureHiddenMarkup?.(html);
    assert.equal(measured?.mobile.hiddenElements, 4);
    assert.equal(measured?.desktop.hiddenElements, 4);
    assert.deepEqual(
        measured?.mobile.largestRoots.map((root) => root.selector),
        ['div#mobile-range', 'div#wide-range']
    );
    assert.deepEqual(
        measured?.desktop.largestRoots.map((root) => root.selector),
        ['div#wide-range', 'div#mobile-visible']
    );
});

test('deep HTML trees are rejected at a bounded nesting limit', () => {
    const depth = 5000;
    const html = `<body>${'<div>'.repeat(depth)}${'</div>'.repeat(depth)}</body>`;
    assert.throws(() => deferredUi.measureHiddenMarkup?.(html), /nesting limit/i);
});

test('HTML self-closing syntax cannot bypass the nesting limit', () => {
    assert.throws(() => deferredUi.measureHiddenMarkup?.(`<body>${'<div/>'.repeat(5000)}</body>`), /nesting limit/i);
});

test('self-closing SVG siblings do not consume the HTML nesting budget', () => {
    const width = 2100;
    const measured = deferredUi.measureHiddenMarkup?.(`<body><svg>${'<path/>'.repeat(width)}</svg></body>`);
    assert.equal(measured?.bodyElements, width + 2);
});

test('HTML breakout tags cannot use SVG self-closing rules to bypass the nesting limit', () => {
    assert.throws(
        () => deferredUi.measureHiddenMarkup?.(`<body><svg>${'<div/>'.repeat(5000)}</body>`),
        /nesting limit/i
    );
});

test('annotation-xml only enters HTML mode for supported encodings', () => {
    const width = 2100;
    const foreign = deferredUi.measureHiddenMarkup?.(
        `<body><math><annotation-xml encoding="application/xml">${'<path/>'.repeat(width)}</annotation-xml></math></body>`
    );
    assert.equal(foreign?.bodyElements, width + 3);
    assert.throws(
        () =>
            deferredUi.measureHiddenMarkup?.(
                `<body><math><annotation-xml encoding="text/html">${'<div/>'.repeat(5000)}</annotation-xml></math></body>`
            ),
        /nesting limit/i
    );
});

test('foreign font data attributes and quoted text are not HTML breakout attributes', () => {
    const foreignFonts = `${'<font data-color="red"/>'.repeat(1050)}${'<font title="color=red"/>'.repeat(1050)}`;
    const measured = deferredUi.measureHiddenMarkup?.(`<body><svg>${foreignFonts}</svg></body>`);
    assert.equal(measured?.bodyElements, 2102);
});

test('wide HTML trees are measured without overflowing argument limits', () => {
    const width = 130000;
    const measured = deferredUi.measureHiddenMarkup?.(`<body>${'<i></i>'.repeat(width)}</body>`);
    assert.equal(measured?.bodyElements, width + 1);
    assert.equal(measured?.mobile.hiddenElements, 0);
});

async function preparedDeferredUi(mobileHtml, desktopHtml) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sfnext-deferred-ui-'));
    const archiveDir = path.join(root, 'archive');
    const workspaceRoot = path.join(root, 'workspace');
    await cp(new URL('./__fixtures__/playhouse-archive/', import.meta.url), archiveDir, { recursive: true });
    await mkdir(workspaceRoot);
    const summaryPath = path.join(archiveDir, 'summary.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    summary.runs = ['mobile', 'desktop'].map((formFactor) => ({
        runId: `${formFactor}-cold-1`,
        formFactor,
        cacheState: 'cold',
        isMedian: true,
    }));
    await writeFile(summaryPath, JSON.stringify(summary));
    for (const [runId, html] of [
        ['mobile-cold-1', mobileHtml],
        ['desktop-cold-1', desktopHtml],
    ]) {
        const runDir = path.join(archiveDir, 'runs', runId);
        await mkdir(runDir, { recursive: true });
        await writeFile(path.join(runDir, 'main-document.html'), html);
    }
    const outputs = await prepareRuleResults({
        catalog: await discoverCatalog(defaultCategoriesDir()),
        pages: [{ label: 'home', url: 'https://example.com/', archiveDir, playhouseVersion: '0.1.2' }],
        workspaceRoot,
    });
    return outputs.find((output) => output.reference.ruleId === 'best-practices/deferred-ui')?.result;
}

test('deferred UI passes when both server-rendered viewports are below the candidate gate', async () => {
    const result = await preparedDeferredUi('<body><main><p></p></main></body>', '<body><main><p></p></main></body>');
    assert.equal(result?.decision?.status, 'pass');
    assert.deepEqual(
        result?.data.pages[0].cells.map((cell) => [cell.cell, cell.candidate]),
        [
            ['mobile-cold', false],
            ['desktop-cold', false],
        ]
    );
});

test('deferred UI leaves a hidden-markup candidate for source attribution', async () => {
    const hidden = `<div id="duplicate" hidden>${'<i></i>'.repeat(99)}</div>`;
    const visible = `<main>${'<i></i>'.repeat(300)}</main>`;
    const result = await preparedDeferredUi(`<body>${hidden}${visible}</body>`, `<body>${hidden}${visible}</body>`);
    assert.equal(result?.decision, undefined);
    assert.deepEqual(
        result?.data.pages[0].cells.map((cell) => [cell.cell, cell.hiddenElements, cell.bodyElements, cell.candidate]),
        [
            ['mobile-cold', 100, 402, true],
            ['desktop-cold', 100, 402, true],
        ]
    );
    assert.deepEqual(result?.data.pages[0].cells[0].largestHiddenRoots, [{ selector: 'div#duplicate', elements: 100 }]);
});

test('deferred UI leaves bounded-complexity HTML incomplete instead of aborting preparation', async () => {
    const depth = 5000;
    const deepHtml = `<body>${'<div>'.repeat(depth)}${'</div>'.repeat(depth)}</body>`;
    const result = await preparedDeferredUi(deepHtml, '<body><main></main></body>');
    assert.equal(result?.decision, undefined);
    assert.deepEqual(result?.data.skipped, [
        {
            page: 'home',
            cell: 'mobile-cold',
            reason: 'runs/mobile-cold-1/main-document.html could not be measured safely.',
        },
    ]);
});

test('deferred UI bounds concurrent page work while overlapping independent viewport reads', async () => {
    let activeReads = 0;
    let maximumReads = 0;
    const playhouse = {
        readJson: () =>
            Promise.resolve({
                runs: [
                    { runId: 'mobile-cold-1', formFactor: 'mobile', cacheState: 'cold', isMedian: true },
                    { runId: 'desktop-cold-1', formFactor: 'desktop', cacheState: 'cold', isMedian: true },
                ],
            }),
        readText: async () => {
            activeReads += 1;
            maximumReads = Math.max(maximumReads, activeReads);
            await new Promise((resolve) => setTimeout(resolve, 10));
            activeReads -= 1;
            return '<body><main></main></body>';
        },
    };
    const pages = ['first', 'second', 'third'].map((label) => ({ label }));
    const result = await prepareDeferredUiRule?.({ pages, playhouse });
    assert.equal(maximumReads, 4);
    assert.deepEqual(
        result?.data.pages.map((page) => page.page),
        ['first', 'second', 'third']
    );
});
