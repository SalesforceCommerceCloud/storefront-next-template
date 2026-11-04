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
import type { PlayhouseArtifactReader } from '../evidence';

/**
 * Image rules read the mobile cold-cache median run: its own HAR and Lighthouse result, so request timings line up with
 * the LCP that `summary-lcp.json` reports for that run.
 */
const CELL = { formFactor: 'mobile', cacheState: 'cold' } as const;

/** Savings smaller than this aren't worth a suggestion. */
export const MIN_SAVINGS_BYTES = 10 * 1024;

const lcpSummarySchema = z
    .object({
        cells: z.array(
            z
                .object({
                    formFactor: z.string(),
                    cacheState: z.string(),
                    median: z
                        .object({
                            runId: z.string(),
                            lcp: z.number().nullable().optional(),
                            breakdown: z.record(z.string(), z.number().nullable()).nullable().optional(),
                            resource: z.object({ url: z.string() }).passthrough().nullable().optional(),
                        })
                        .passthrough()
                        .nullable()
                        .optional(),
                })
                .passthrough()
        ),
    })
    .passthrough();

const entrySchema = z
    .object({
        _requestTime: z.number().optional(),
        _priority: z.string().optional(),
        _initialPriority: z.string().optional(),
        _resourceType: z.string().optional(),
        _initiator_type: z.string().optional(),
        _renderBlocking: z.string().optional(),
        time: z.number(),
        request: z.object({ url: z.string(), _isLinkPreload: z.boolean().optional() }).passthrough(),
        response: z
            .object({
                status: z.number(),
                bodySize: z.number().optional(),
                content: z
                    .object({ size: z.number().optional(), mimeType: z.string().optional() })
                    .passthrough()
                    .optional(),
            })
            .passthrough(),
    })
    .passthrough();
const harSchema = z.object({ log: z.object({ entries: z.array(entrySchema) }).passthrough() }).passthrough();
export type RunEntry = z.infer<typeof entrySchema>;

const rectSchema = z.object({ top: z.number(), width: z.number(), height: z.number() }).passthrough();
const nodeSchema = z
    .object({
        path: z.string().optional(),
        selector: z.string().optional(),
        nodeLabel: z.string().optional(),
        snippet: z.string().optional(),
        boundingRect: rectSchema.optional(),
    })
    .passthrough();
const tableItem = z.record(z.string(), z.unknown());
const audit = <T extends z.ZodTypeAny>(details: T) =>
    z
        .object({
            score: z.number().nullable().optional(),
            numericValue: z.number().optional(),
            metricSavings: z.record(z.string(), z.number()).optional(),
            details: details.optional(),
        })
        .passthrough()
        .optional();

const lhrSchema = z
    .object({
        configSettings: z
            .object({ screenEmulation: z.object({ deviceScaleFactor: z.number(), height: z.number() }).passthrough() })
            .passthrough(),
        audits: z
            .object({
                'image-delivery-insight': audit(
                    z
                        .object({
                            items: z
                                .array(
                                    z
                                        .object({
                                            url: z.string(),
                                            totalBytes: z.number(),
                                            wastedBytes: z.number(),
                                            node: nodeSchema.optional(),
                                            subItems: z
                                                .object({
                                                    items: z.array(
                                                        z
                                                            .object({ reason: z.string(), wastedBytes: z.number() })
                                                            .passthrough()
                                                    ),
                                                })
                                                .passthrough()
                                                .optional(),
                                        })
                                        .passthrough()
                                )
                                .optional(),
                        })
                        .passthrough()
                ),
                'lcp-discovery-insight': audit(z.object({ items: z.array(tableItem).optional() }).passthrough()),
                'unsized-images': audit(
                    z
                        .object({
                            items: z
                                .array(
                                    z.object({ url: z.string().optional(), node: nodeSchema.optional() }).passthrough()
                                )
                                .optional(),
                        })
                        .passthrough()
                ),
                'cls-culprits-insight': audit(z.object({ items: z.array(tableItem).optional() }).passthrough()),
                'render-blocking-insight': audit(
                    z.object({ items: z.array(z.object({ url: z.string() }).passthrough()).optional() }).passthrough()
                ),
                'cumulative-layout-shift': audit(z.unknown()),
            })
            .passthrough(),
    })
    .passthrough();
export type Lighthouse = z.infer<typeof lhrSchema>;

export type ImageRun = {
    page: string;
    runId: string;
    harArtifact: string;
    lighthouseArtifact: string;
    entries: RunEntry[];
    lhr: Lighthouse;
    /** Emulated device pixel ratio and viewport height. */
    dpr: number;
    viewportHeight: number;
    lcpMs: number | null;
    lcpBreakdown: Record<string, number | null>;
    /** The LCP image's URL, or null when the LCP element is text. */
    lcpUrl: string | null;
    /** Milliseconds from the document request to an entry's request. */
    startMs: (entry: RunEntry) => number;
};

/** The mobile cold-cache median run of one page, or why it can't be read. */
export async function readImageRun(
    playhouse: PlayhouseArtifactReader,
    page: string
): Promise<ImageRun | { reason: string }> {
    const summary = await playhouse.readJson(page, 'summary-lcp.json', lcpSummarySchema);
    const median = summary?.cells.find(
        (cell) => cell.formFactor === CELL.formFactor && cell.cacheState === CELL.cacheState
    )?.median;
    if (!median) return { reason: 'summary-lcp.json has no mobile cold-cache median run.' };
    const harArtifact = `runs/${median.runId}/network.har`;
    const lighthouseArtifact = `runs/${median.runId}/lhr.json`;
    const [har, lhr] = await Promise.all([
        playhouse.readJson(page, harArtifact, harSchema),
        playhouse.readJson(page, lighthouseArtifact, lhrSchema),
    ]);
    if (!har || !lhr) return { reason: `The median run's ${har ? 'Lighthouse result' : 'HAR'} was not archived.` };
    const entries = har.log.entries;
    const origin = Math.min(...entries.map((entry) => entry._requestTime ?? Infinity));
    return {
        page,
        runId: median.runId,
        harArtifact,
        lighthouseArtifact,
        entries,
        lhr,
        dpr: lhr.configSettings.screenEmulation.deviceScaleFactor,
        viewportHeight: lhr.configSettings.screenEmulation.height,
        lcpMs: median.lcp ?? null,
        lcpBreakdown: median.breakdown ?? {},
        lcpUrl: median.resource?.url ?? null,
        startMs: (entry) =>
            entry._requestTime === undefined || !Number.isFinite(origin)
                ? NaN
                : Math.round((entry._requestTime - origin) * 1000),
    };
}

export const kib = (bytes: number): string => `${Math.round(bytes / 1024)} KiB`;

/** Bytes an entry downloaded during [start, end] seconds, assuming it downloaded at an even rate. */
export function bytesDuring(entry: RunEntry, start: number, end: number): number {
    const from = entry._requestTime;
    const bytes = entry.response.bodySize ?? 0;
    if (from === undefined || bytes <= 0) return 0;
    const to = from + entry.time / 1000;
    const overlap = Math.min(to, end) - Math.max(from, start);
    return overlap > 0 ? Math.round((bytes * overlap) / Math.max(to - from, 0.001)) : 0;
}

export const isImage = (entry: RunEntry): boolean =>
    entry._resourceType === 'image' || (entry.response.content?.mimeType ?? '').startsWith('image/');

/** A URL's file name without its query, for readable summaries. */
export function fileName(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
    } catch {
        return url;
    }
}

/** URL without its query string, to match the same image requested at different sizes. */
export function withoutQuery(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url;
    }
}
