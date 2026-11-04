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
/** Test-only: synthetic Playhouse archives for running one rule script against chosen artifacts. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PlayhouseArtifactReader } from '../evidence';
import type { PlayhouseCollection } from '../playhouse';
import type { PreparedRuleResult, RulePreparationFunction } from '../preparation';

export const PAGE_URL = 'https://shop.test/';

/** Artifacts by archive path; strings are written as is, undefined not at all, anything else as JSON. */
export type Files = Record<string, unknown>;

/** One archive per page label, with each page at `PAGE_URL`. */
export async function collections(pages: Record<string, Files>): Promise<PlayhouseCollection[]> {
    const result: PlayhouseCollection[] = [];
    for (const [label, files] of Object.entries(pages)) {
        const archiveDir = await mkdtemp(path.join(os.tmpdir(), `sfnext-audit-archive-${label}-`));
        for (const [name, value] of Object.entries(files)) {
            if (value === undefined) continue;
            await mkdir(path.dirname(path.join(archiveDir, name)), { recursive: true });
            await writeFile(path.join(archiveDir, name), typeof value === 'string' ? value : JSON.stringify(value));
        }
        result.push({ label, url: PAGE_URL, archiveDir, playhouseVersion: '0.0.0' });
    }
    return result;
}

/** Runs a rule script over one archive per page label. */
export async function runRule<T>(
    rule: RulePreparationFunction<T>,
    pages: Record<string, Files>
): Promise<PreparedRuleResult<T>> {
    const prepared = await collections(pages);
    return rule({ pages: prepared, playhouse: new PlayhouseArtifactReader(prepared) } as never);
}

type EntryOptions = {
    status?: number;
    headers?: Record<string, string>;
    mimeType?: string;
    size?: number;
    /** Merged into the response. */
    response?: Record<string, unknown>;
} & Record<string, unknown>;

/** A HAR entry; `headers` become response headers. */
export function harEntry(url: string, options: EntryOptions = {}): Record<string, unknown> {
    const { status = 200, headers = {}, mimeType, size, response = {}, ...rest } = options;
    return {
        request: { url },
        response: {
            status,
            headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
            content: { ...(mimeType ? { mimeType } : {}), ...(size === undefined ? {} : { size }) },
            ...response,
        },
        ...rest,
    };
}

/** The mobile cold-cache HAR and network summary whose final document is `documentUrl`. */
export const network = (entries: unknown[], documentUrl = PAGE_URL): Files => ({
    'network-mobile-cold.har': { log: { entries } },
    'network-mobile-cold.json': { document: { url: documentUrl } },
});

type HtmlPage = {
    htmlBytes: number;
    transferBytes?: number;
    /** Inline script texts, archived from the first mobile cold-cache measurement run. */
    scripts?: string[];
    /** Lighthouse's DOM size insight for that run. */
    elements?: number;
};

/** A page's HTML document with its archived inline scripts and Lighthouse DOM size. */
export function htmlPage({ htmlBytes, transferBytes, scripts = [], elements }: HtmlPage): Files {
    const files = network([
        harEntry(PAGE_URL, {
            mimeType: 'text/html',
            size: htmlBytes,
            response: transferBytes === undefined ? {} : { bodySize: transferBytes },
        }),
    ]);
    const observation = (sha256: string) => ({
        runId: 'mobile-cold-1',
        runKind: 'measurement',
        formFactor: 'mobile',
        cacheState: 'cold',
        url: PAGE_URL,
        body: { status: 'captured', sha256 },
    });
    if (scripts.length)
        files['scripts/index.json'] = { observations: scripts.map((_, index) => observation(`s${index}`)) };
    scripts.forEach((text, index) => {
        files[`scripts/s${index}.js`] = text;
    });
    if (elements !== undefined)
        files['runs/mobile-cold-1/lhr.json'] = {
            audits: {
                'dom-size-insight': {
                    details: {
                        items: [
                            { statistic: 'Total elements', value: { type: 'numeric', value: elements } },
                            { statistic: 'DOM depth', value: { type: 'numeric', value: 12 } },
                        ],
                    },
                },
            },
        };
    return files;
}

export const pageDataScript = (bytes: number): string =>
    `window.__reactRouterContext.streamController.enqueue("${'x'.repeat(bytes)}");`;
export const appConfigScript = (config: string): string => `window.__APP_CONFIG__ = ${config};`;

/** summary.json with a mobile cold-cache cell whose median run is `medianRun`, and its per-run rows. */
export const summary = (medianRun: Record<string, unknown>, rows: Record<string, unknown>[] = []): Files => ({
    'summary.json': {
        cells: [{ formFactor: 'mobile', cacheState: 'cold', medianRun }],
        runs: rows.map((row) => ({ formFactor: 'mobile', cacheState: 'cold', row })),
    },
});

type ImageRunOptions = {
    /** HAR entries of the median run. */
    entries?: unknown[];
    /** Lighthouse audits of the median run. */
    audits?: Record<string, unknown>;
    lcp?: number | null;
    /** The LCP image; omit for a text LCP. */
    lcpUrl?: string;
    breakdown?: Record<string, number | null>;
    dpr?: number;
};

/** summary-lcp.json and the mobile cold-cache median run (`mobile-cold-1`) that the image rules read. */
export const imageRun = ({
    entries = [],
    audits = {},
    lcp = 2000,
    lcpUrl,
    breakdown,
    dpr = 1.75,
}: ImageRunOptions = {}): Files => ({
    'summary-lcp.json': {
        cells: [
            {
                formFactor: 'mobile',
                cacheState: 'cold',
                median: {
                    runId: 'mobile-cold-1',
                    lcp,
                    ...(breakdown ? { breakdown } : {}),
                    ...(lcpUrl ? { resource: { url: lcpUrl } } : {}),
                },
            },
        ],
    },
    'runs/mobile-cold-1/network.har': { log: { entries } },
    'runs/mobile-cold-1/lhr.json': {
        configSettings: { screenEmulation: { deviceScaleFactor: dpr, height: 800 } },
        audits,
    },
});
