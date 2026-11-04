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
import type { PreparedRuleResult, RulePreparationFunction } from '../../../../preparation';
import {
    bytesDuring,
    fileName,
    isImage,
    kib,
    MIN_SAVINGS_BYTES,
    readImageRun,
    withoutQuery,
    type ImageRun,
} from '../../../../rule-helpers/images';

/** Delays shorter than this aren't worth a suggestion. */
const MIN_DELAY_MS = 100;
const LCP_GOOD_MS = 2500;
const HIGH = new Set(['High', 'VeryHigh']);

const issueSchema = z
    .object({
        check: z.enum([
            'not-in-html',
            'lazy',
            'low-priority',
            'preload-mismatch',
            'competing-images',
            'bandwidth',
            'render-blocking',
        ]),
        detail: z.string(),
        /** Where the evidence is: a HAR entry or a Lighthouse audit. */
        artifact: z.string(),
        pointer: z.string(),
    })
    .strict();
type Issue = z.infer<typeof issueSchema>;

export const dataSchema = z
    .object({
        cell: z.string(),
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    lcpMs: z.number().nullable(),
                    /** The LCP image, or null when the LCP element is text. */
                    image: z
                        .object({
                            url: z.string(),
                            entry: z.number(),
                            bytes: z.number(),
                            startMs: z.number(),
                            loadMs: z.number(),
                            initialPriority: z.string().nullable(),
                            priority: z.string().nullable(),
                            initiator: z.string().nullable(),
                            preloaded: z.boolean(),
                            /** Bytes other images and scripts downloaded while the LCP image did, and the estimated delay the images caused. */
                            concurrentImageBytes: z.number(),
                            concurrentScriptBytes: z.number(),
                            imageDelayMs: z.number(),
                        })
                        .strict()
                        .nullable(),
                    issues: z.array(issueSchema),
                })
                .strict()
        ),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type PageResult = Data['pages'][number];

/** The `{value}` of one of Lighthouse's LCP discovery checks, or undefined when it wasn't reported. */
function discovery(run: ImageRun, check: 'requestDiscoverable' | 'eagerlyLoaded'): boolean | undefined {
    // The insight's details are a list holding one checklist: `{type: 'checklist', items: {[check]: {label, value}}}`.
    for (const item of run.lhr.audits['lcp-discovery-insight']?.details?.items ?? []) {
        const value = (item.items as Record<string, { value?: unknown }> | undefined)?.[check]?.value;
        if (typeof value === 'boolean') return value;
    }
    return undefined;
}

function checkPage(run: ImageRun): PageResult | { reason: string } {
    if (!run.lcpUrl) return { page: run.page, lcpMs: run.lcpMs, image: null, issues: [] };
    const index = run.entries.findIndex((entry) => entry.request.url === run.lcpUrl);
    const lcp = run.entries[index];
    if (!lcp || lcp._requestTime === undefined)
        return { reason: 'The LCP image request was not found in the median run HAR.' };
    const har = (entry: number, path = '') => ({ artifact: run.harArtifact, pointer: `/log/entries/${entry}${path}` });
    const lighthouse = (id: string) => ({ artifact: run.lighthouseArtifact, pointer: `/audits/${id}` });
    const issues: Issue[] = [];
    const name = fileName(lcp.request.url);

    if (discovery(run, 'requestDiscoverable') === false || lcp._initiator_type === 'script') {
        issues.push({
            check: 'not-in-html',
            detail: `The LCP image ${name} is requested by JavaScript instead of being in the HTML, so the browser finds it late.`,
            ...lighthouse('lcp-discovery-insight'),
        });
    }
    if (discovery(run, 'eagerlyLoaded') === false) {
        issues.push({
            check: 'lazy',
            detail: `The LCP image ${name} uses loading="lazy", which waits for layout before downloading it.`,
            ...lighthouse('lcp-discovery-insight'),
        });
    }
    const initial = lcp._initialPriority ?? null;
    if (initial && !HIGH.has(initial)) {
        issues.push({
            check: 'low-priority',
            detail: `The LCP image ${name} starts at ${initial} priority${lcp._priority && lcp._priority !== initial ? ` and is raised to ${lcp._priority} only after layout` : ''}; it has no fetchpriority="high".`,
            ...har(index),
        });
    }

    const path = withoutQuery(lcp.request.url);
    const mismatch = run.entries.findIndex(
        (entry) =>
            entry.request._isLinkPreload &&
            entry.request.url !== lcp.request.url &&
            withoutQuery(entry.request.url) === path
    );
    if (mismatch >= 0) {
        issues.push({
            check: 'preload-mismatch',
            detail: `The page preloads ${name} at a different size from the one shown, so it downloads twice (${run.entries[mismatch].request.url}).`,
            ...har(mismatch),
        });
    }

    const competing = run.entries.flatMap((entry, at) =>
        entry !== lcp &&
        isImage(entry) &&
        HIGH.has(entry._priority ?? '') &&
        (entry._requestTime ?? Infinity) <= (lcp._requestTime ?? -Infinity) &&
        (entry.response.bodySize ?? 0) >= MIN_SAVINGS_BYTES
            ? [at]
            : []
    );
    if (competing.length) {
        issues.push({
            check: 'competing-images',
            detail: `${competing.length} other image${competing.length === 1 ? '' : 's'} at High priority start before the LCP image: ${competing
                .slice(0, 3)
                .map(
                    (at) => `${fileName(run.entries[at].request.url)} (${kib(run.entries[at].response.bodySize ?? 0)})`
                )
                .join(', ')}.`,
            ...har(competing[0]),
        });
    }

    // Bandwidth the LCP image shares: its load time, split by the bytes everything downloaded alongside it.
    const start = lcp._requestTime;
    const end = start + lcp.time / 1000;
    const during = run.entries.map((entry, at) => ({
        entry,
        at,
        bytes: entry === lcp ? 0 : bytesDuring(entry, start, end),
    }));
    const total = during.reduce((sum, item) => sum + item.bytes, lcp.response.bodySize ?? 0);
    const images = during
        .filter((item) => item.bytes > 0 && isImage(item.entry))
        .slice()
        .sort((a, b) => b.bytes - a.bytes);
    const imageBytes = images.reduce((sum, item) => sum + item.bytes, 0);
    const scriptBytes = during
        .filter((item) => item.entry._resourceType === 'script')
        .reduce((sum, item) => sum + item.bytes, 0);
    const imageDelayMs = total > 0 ? Math.round((lcp.time * imageBytes) / total) : 0;
    if (imageDelayMs >= MIN_DELAY_MS) {
        issues.push({
            check: 'bandwidth',
            detail: `Other images download ${kib(imageBytes)} while the ${kib(lcp.response.bodySize ?? 0)} LCP image loads, delaying it by about ${imageDelayMs} ms; the largest is ${fileName(images[0].entry.request.url)} (${kib(images[0].bytes)} during the LCP download).`,
            ...har(images[0].at),
        });
    }

    const blocking = run.lhr.audits['render-blocking-insight'];
    const blockingMs = blocking?.metricSavings?.LCP ?? 0;
    if (blockingMs >= MIN_DELAY_MS) {
        const urls = (blocking?.details?.items ?? []).map((item) => fileName(item.url));
        issues.push({
            check: 'render-blocking',
            detail: `${urls.length} render-blocking request${urls.length === 1 ? '' : 's'} (${urls.slice(0, 3).join(', ')}) delay the LCP by about ${Math.round(blockingMs)} ms.`,
            ...lighthouse('render-blocking-insight'),
        });
    }

    return {
        page: run.page,
        lcpMs: run.lcpMs,
        image: {
            url: lcp.request.url,
            entry: index,
            bytes: lcp.response.bodySize ?? 0,
            startMs: run.startMs(lcp),
            loadMs: Math.round(lcp.time),
            initialPriority: initial,
            priority: lcp._priority ?? null,
            initiator: lcp._initiator_type ?? null,
            preloaded: Boolean(lcp.request._isLinkPreload),
            concurrentImageBytes: imageBytes,
            concurrentScriptBytes: scriptBytes,
            imageDelayMs,
        },
        issues,
    };
}

const run: RulePreparationFunction<Data> = async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
    const data: Data = { cell: 'mobile-cold', pages: [], skipped: [] };
    const harArtifacts = new Map<string, string>();
    for (const page of pages) {
        const imageRun = await readImageRun(playhouse, page.label);
        if ('reason' in imageRun) {
            data.skipped.push({ page: page.label, reason: imageRun.reason });
            continue;
        }
        const result = checkPage(imageRun);
        if ('reason' in result) {
            data.skipped.push({ page: page.label, reason: result.reason });
            continue;
        }
        data.pages.push(result);
        harArtifacts.set(page.label, imageRun.harArtifact);
    }
    if (!data.pages.length) return { data };
    const withImage = data.pages.filter((item) => item.image);
    const failing = withImage.filter((item) => item.issues.length);
    const text = data.pages.filter((item) => !item.image).map((item) => item.page);
    const textNote = text.length ? ` The LCP element is text on ${text.join(', ')}.` : '';
    if (!failing.length) {
        return {
            data,
            decision: {
                status: 'pass',
                summary: withImage.length
                    ? `The LCP image on ${withImage.map((item) => item.page).join(', ')} is in the HTML, starts at High priority, isn't lazy-loaded and has no image competing for bandwidth.${textNote}`
                    : `The LCP element is text on every measured page (${text.join(', ')}), so there is no LCP image to prioritize.`,
                evidence: withImage.length
                    ? withImage.flatMap((item) => {
                          const image = item.image;
                          const artifact = harArtifacts.get(item.page);
                          if (!image || !artifact) return [];
                          return [
                              {
                                  type: 'playhouse' as const,
                                  page: item.page,
                                  artifact,
                                  pointer: `/log/entries/${image.entry}`,
                                  value: `${fileName(image.url)}: ${image.initialPriority ?? 'unknown'} priority, ${image.preloaded ? 'preloaded' : `found by the ${image.initiator ?? 'parser'}`}, ${kib(image.bytes)} in ${image.loadMs} ms`,
                              },
                          ];
                      })
                    : data.pages.map((item) => ({
                          type: 'playhouse' as const,
                          page: item.page,
                          artifact: 'summary-lcp.json',
                          value: 'LCP element is text',
                      })),
            },
        };
    }
    // The issues matter most where the LCP misses the Core Web Vitals threshold.
    const slow = failing.some((item) => (item.lcpMs ?? 0) > LCP_GOOD_MS);
    return {
        data,
        decision: {
            status: 'fail',
            severity: slow ? 'high' : 'medium',
            summary:
                failing
                    .map(
                        (item) =>
                            `${item.page} (LCP ${item.lcpMs === null ? 'unknown' : `${Math.round(item.lcpMs)} ms`}): ${item.issues.map((issue) => issue.detail).join(' ')}`
                    )
                    .join(' ') + textNote,
            evidence: failing.flatMap((item) =>
                item.issues.map((issue) => ({
                    type: 'playhouse' as const,
                    page: item.page,
                    artifact: issue.artifact,
                    pointer: issue.pointer,
                    value: issue.detail,
                }))
            ),
        },
    };
};

export default run;
