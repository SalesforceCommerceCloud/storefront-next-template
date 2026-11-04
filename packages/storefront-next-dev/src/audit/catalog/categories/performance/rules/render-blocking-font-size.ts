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
import { z } from 'zod';
import type { PlayhouseArtifactReader } from '../../../../evidence';
import type { PreparedRuleResult, RulePreparationFunction } from '../../../../preparation';
import { kib } from '../../../../rule-helpers/document-size';

// No published standard sets a font budget. 75 KiB fits one or two subset WOFF2 families: the Storefront Next template sends 22 KiB and an observed production storefront sends 72 KiB.
const BUDGET = 75 * 1024;
const CELL = 'mobile-cold';
/** Fonts listed per failing page, in the summary and as evidence. */
const MAX_FILES = 4;

const summarySchema = z
    .object({
        runs: z
            .array(
                z
                    .object({
                        runId: z.string().optional(),
                        formFactor: z.string().optional(),
                        cacheState: z.string().optional(),
                        isMedian: z.boolean().optional(),
                    })
                    .passthrough()
            )
            .optional()
            .default([]),
    })
    .passthrough();

const requestSchema = z
    .object({
        url: z.string(),
        resourceType: z.string().nullish(),
        statusCode: z.number().nullish(),
        rendererStartTime: z.number().nullish(),
        resourceSize: z.number().nullish(),
        isLinkPreload: z.boolean().nullish(),
        entity: z.string().nullish(),
    })
    .passthrough();

const lhrSchema = z
    .object({
        audits: z
            .object({
                'network-requests': z
                    .object({
                        details: z
                            .object({
                                items: z.array(requestSchema).optional(),
                                debugData: z
                                    .object({ networkStartTimeTs: z.number().nullish() })
                                    .passthrough()
                                    .optional(),
                            })
                            .passthrough()
                            .optional(),
                    })
                    .passthrough()
                    .optional(),
                metrics: z
                    .object({
                        details: z
                            .object({ items: z.array(z.record(z.string(), z.unknown())).optional() })
                            .passthrough()
                            .optional(),
                    })
                    .passthrough()
                    .optional(),
            })
            .passthrough(),
    })
    .passthrough();

const fontSchema = z
    .object({
        url: z.string(),
        bytes: z.number(),
        /** When the page requested the font, in ms from navigation start. */
        requestMs: z.number(),
        preloaded: z.boolean(),
        renderBlocking: z.boolean(),
        thirdParty: z.boolean(),
        /** Index of the font's first request in the `network-requests` audit. */
        entry: z.number(),
    })
    .strict();

const pageSchema = z
    .object({
        page: z.string(),
        url: z.string(),
        lighthouseArtifact: z.string(),
        lcpMs: z.number(),
        /** The run's load event; null when Lighthouse didn't record it. */
        loadMs: z.number().nullable(),
        renderBlockingBytes: z.number(),
        /** Fonts requested after LCP or the load event; reported, not budgeted. */
        laterBytes: z.number(),
        fonts: z.array(fontSchema),
    })
    .strict();

export const dataSchema = z
    .object({
        cell: z.string(),
        budget: z.number(),
        pages: z.array(pageSchema),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type PageFonts = z.infer<typeof pageSchema>;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The median mobile cold-cache run, so the fonts come from the same run as the page's reported metrics. */
async function medianRun(playhouse: PlayhouseArtifactReader, page: string): Promise<string> {
    const summary = await playhouse.readJson(page, 'summary.json', summarySchema);
    const runs = (summary?.runs ?? []).filter((run) => run.runId && `${run.formFactor}-${run.cacheState}` === CELL);
    return (runs.find((run) => run.isMedian) ?? runs[0])?.runId ?? `${CELL}-1`;
}

function host(url: string): string | undefined {
    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
}

/** Every font one page downloaded in its median mobile cold-cache run, each URL once, marked render-blocking when preloaded or requested before both LCP and the load event. */
async function measurePage(playhouse: PlayhouseArtifactReader, page: string): Promise<PageFonts | { reason: string }> {
    const lighthouseArtifact = `runs/${await medianRun(playhouse, page)}/lhr.json`;
    const lhr = await playhouse.readJson(page, lighthouseArtifact, lhrSchema);
    if (!lhr) return { reason: `${lighthouseArtifact} is missing.` };
    const network = lhr.audits['network-requests']?.details;
    const requests = network?.items;
    const metrics = lhr.audits.metrics?.details?.items?.[0];
    if (!requests) return { reason: 'The Lighthouse result has no network-requests audit.' };
    const lcpMs = metrics?.observedLargestContentfulPaint;
    if (!finite(lcpMs)) return { reason: 'The Lighthouse result has no observed LCP.' };
    // Request times count from the first request, LCP from navigation start; the gap is usually under a millisecond.
    const networkStart = network.debugData?.networkStartTimeTs;
    const navigationStart = metrics?.observedNavigationStartTs;
    const offsetMs = finite(networkStart) && finite(navigationStart) ? (networkStart - navigationStart) / 1000 : 0;
    // On a slow page, LCP can come after a tag manager has already added its fonts; those come after the load event.
    const loadMs = metrics?.observedLoad;
    const cutoffMs = finite(loadMs) ? Math.min(lcpMs, loadMs) : lcpMs;

    const document = requests.find((request) => request.resourceType === 'Document');
    const fonts = new Map<string, PageFonts['fonts'][number]>();
    for (const [entry, request] of requests.entries()) {
        if (request.resourceType !== 'Font' || !finite(request.resourceSize) || request.resourceSize <= 0) continue;
        if (finite(request.statusCode) && request.statusCode >= 400) continue;
        if (!finite(request.rendererStartTime)) return { reason: `The font request ${request.url} has no start time.` };
        const requestMs = Math.round(request.rendererStartTime + offsetMs);
        const preloaded = request.isLinkPreload === true;
        const known = fonts.get(request.url);
        // A repeated request for the same URL is one file: keep the earliest start and the preload flag of any request.
        if (known) {
            if (requestMs < known.requestMs) Object.assign(known, { requestMs, entry });
            known.preloaded ||= preloaded;
            known.renderBlocking = known.preloaded || known.requestMs < cutoffMs;
            continue;
        }
        // Without the document request there is nothing to compare against, so the font is treated as first-party.
        const thirdParty = !document
            ? false
            : document.entity && request.entity
              ? request.entity !== document.entity
              : host(request.url) !== host(document.url);
        fonts.set(request.url, {
            url: request.url,
            bytes: request.resourceSize,
            requestMs,
            preloaded,
            renderBlocking: preloaded || requestMs < cutoffMs,
            thirdParty,
            entry,
        });
    }
    const list = [...fonts.values()];
    const total = (items: typeof list) => items.reduce((sum, font) => sum + font.bytes, 0);
    return {
        page,
        url: document?.url ?? '',
        lighthouseArtifact,
        lcpMs: Math.round(lcpMs),
        loadMs: finite(loadMs) ? Math.round(loadMs) : null,
        renderBlockingBytes: total(list.filter((font) => font.renderBlocking)),
        laterBytes: total(list.filter((font) => !font.renderBlocking)),
        fonts: list,
    };
}

/** A size, marked "just over" when it would otherwise read the same as the budget it exceeds. */
const shown = (bytes: number): string =>
    bytes > BUDGET && kib(bytes) === kib(BUDGET) ? `just over ${kib(BUDGET)}` : kib(bytes);

function fileName(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname.split('/').at(-1) || url);
    } catch {
        return url;
    }
}

const why = (font: PageFonts['fonts'][number], lcpMs: number): string =>
    font.preloaded ? 'preloaded' : `requested at ${font.requestMs} ms, before LCP at ${lcpMs} ms`;

const blocking = (size: PageFonts) =>
    size.fonts
        .filter((font) => font.renderBlocking)
        .slice()
        .sort((a, b) => b.bytes - a.bytes);

const pageTotal = (size: PageFonts): string => {
    const count = blocking(size).length;
    return count
        ? `${shown(size.renderBlockingBytes)} in ${count} file${count === 1 ? '' : 's'}`
        : 'no render-blocking fonts';
};

/** "pdp (96 KiB: inter.woff2 48 KiB, playfair.woff2 48 KiB third-party)". */
function breakdown(size: PageFonts): string {
    const fonts = blocking(size);
    const files = fonts
        .slice(0, MAX_FILES)
        .map((font) => `${fileName(font.url)} ${kib(font.bytes)}${font.thirdParty ? ' third-party' : ''}`);
    if (fonts.length > MAX_FILES) files.push(`+${fonts.length - MAX_FILES} more`);
    return `${size.page} (${shown(size.renderBlockingBytes)}: ${files.join(', ')})`;
}

export default (async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
    const data: Data = { cell: CELL, budget: BUDGET, pages: [], skipped: [] };
    for (const page of pages) {
        const size = await measurePage(playhouse, page.label);
        if ('reason' in size) data.skipped.push({ page: page.label, reason: size.reason });
        else data.pages.push(size);
    }
    if (!data.pages.length) return { data };
    const over = data.pages.filter((size) => size.renderBlockingBytes > BUDGET);
    if (!over.length) {
        return {
            data,
            decision: {
                status: 'pass',
                summary: `Render-blocking fonts are within ${kib(BUDGET)} on every measured page (${data.pages.map((size) => `${size.page} ${pageTotal(size)}`).join(', ')}).`,
                evidence: data.pages.map((size) => ({
                    type: 'playhouse' as const,
                    page: size.page,
                    artifact: size.lighthouseArtifact,
                    pointer: '/audits/network-requests/details/items',
                    value: `Render-blocking fonts: ${pageTotal(size)} (budget ${kib(BUDGET)})`,
                })),
            },
        };
    }
    return {
        data,
        decision: {
            status: 'fail',
            summary: `Render-blocking fonts are over ${kib(BUDGET)} on ${over.map(breakdown).join('; ')}.`,
            evidence: over.flatMap((size) =>
                blocking(size)
                    .slice(0, MAX_FILES)
                    .map((font) => ({
                        type: 'playhouse' as const,
                        page: size.page,
                        artifact: size.lighthouseArtifact,
                        pointer: `/audits/network-requests/details/items/${font.entry}/resourceSize`,
                        value: `${fileName(font.url)} ${kib(font.bytes)}${font.thirdParty ? ', third-party' : ''}, ${why(font, size.lcpMs)}`,
                    }))
            ),
        },
    };
}) satisfies RulePreparationFunction<Data>;
