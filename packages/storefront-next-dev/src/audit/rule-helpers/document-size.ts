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
import type { PreparedRuleResult, RulePreparationFunction } from '../preparation';
import { matchDocument, normalizedUrl, REPRESENTATIVE_CELL } from './har';

const scriptIndexSchema = z
    .object({
        observations: z.array(
            z
                .object({
                    runId: z.string(),
                    runKind: z.string(),
                    formFactor: z.string(),
                    cacheState: z.string(),
                    url: z.string(),
                    body: z.object({ status: z.string(), sha256: z.string().optional() }).passthrough(),
                })
                .passthrough()
        ),
    })
    .passthrough();

const lhrSchema = z
    .object({
        audits: z
            .object({
                'dom-size-insight': z
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

export type InlinePart = 'pageData' | 'appConfig' | 'otherScripts';

/** What an inline `<script>` in the HTML holds, from its text. */
function inlinePart(text: string): InlinePart {
    if (text.includes('__reactRouterContext.streamController.enqueue(')) return 'pageData';
    if (text.includes('window.__APP_CONFIG__')) return 'appConfig';
    return 'otherScripts';
}

export const pageSizeSchema = z
    .object({
        page: z.string(),
        url: z.string(),
        /** Decoded (uncompressed) HTML bytes and the bytes sent over the network. */
        htmlBytes: z.number(),
        transferBytes: z.number().nullable(),
        /** Bytes of each kind of inline script, or null when Playhouse archived no scripts for the page. */
        pageDataBytes: z.number().nullable(),
        appConfigBytes: z.number().nullable(),
        otherScriptBytes: z.number().nullable(),
        /** Everything in the HTML outside inline scripts. */
        markupBytes: z.number().nullable(),
        /** Archived inline scripts by kind, largest first, as artifact paths (`scripts/<sha256>.js`). */
        scripts: z
            .object({ pageData: z.array(z.string()), appConfig: z.array(z.string()), other: z.array(z.string()) })
            .strict(),
        /** Bytes of each top-level app config section, largest first, or null when the config couldn't be read. */
        appConfigSections: z.record(z.string(), z.number()).nullable(),
        /** Elements after load, from Lighthouse's DOM size insight. */
        elements: z.number().nullable(),
        domDepth: z.number().nullable(),
        /** Artifacts the numbers come from. */
        harArtifact: z.string(),
        harEntry: z.number(),
        lighthouseArtifact: z.string().nullable(),
    })
    .strict();
export type PageSize = z.infer<typeof pageSizeSchema>;

export const documentSizeDataSchema = z
    .object({
        cell: z.string(),
        budget: z.number(),
        pages: z.array(pageSizeSchema),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof documentSizeDataSchema>;

const numeric = (value: unknown): number | null => {
    const inner = (value as { value?: unknown } | undefined)?.value;
    return typeof inner === 'number' && Number.isFinite(inner) ? inner : null;
};

/** Top-level sections of a `window.__APP_CONFIG__ = {...};` script by serialized size, largest first. */
function configSections(text: string): Record<string, number> | null {
    const json = text
        .slice(text.indexOf('=') + 1)
        .trim()
        .replace(/;$/, '');
    try {
        const config: unknown = JSON.parse(json);
        if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
        const sizes = Object.entries(config).map(
            ([key, value]) => [key, Buffer.byteLength(JSON.stringify(value) ?? '')] as const
        );
        return Object.fromEntries(sizes.slice().sort((a, b) => b[1] - a[1]));
    } catch {
        return null;
    }
}

/** Measures one page's HTML from its mobile cold-cache HAR, archived inline scripts and Lighthouse result. */
export async function measurePage(
    playhouse: PlayhouseArtifactReader,
    page: string
): Promise<PageSize | { reason: string }> {
    const match = await matchDocument(playhouse, page, REPRESENTATIVE_CELL);
    if ('reason' in match) return { reason: match.reason };
    const response = match.document.entry.response;
    const htmlBytes = response.content?.size;
    if (typeof htmlBytes !== 'number' || htmlBytes <= 0)
        return { reason: 'The HAR records no decoded size for the HTML document.' };
    // HAR `bodySize` is the compressed body as sent over the network.
    const transfer = (response as { bodySize?: unknown }).bodySize;

    const index = await playhouse.readJson(page, 'scripts/index.json', scriptIndexSchema);
    const runs = (index?.observations ?? []).filter(
        (item) => item.runKind === 'measurement' && `${item.formFactor}-${item.cacheState}` === REPRESENTATIVE_CELL
    );
    const runId = runs
        .map((item) => item.runId)
        .slice()
        .sort()[0];
    const documentUrl = normalizedUrl(match.finalUrl);
    const inline = runs.filter(
        (item) =>
            item.runId === runId &&
            normalizedUrl(item.url) === documentUrl &&
            item.body.status === 'captured' &&
            item.body.sha256
    );
    const bytes: Record<InlinePart, number> = { pageData: 0, appConfig: 0, otherScripts: 0 };
    let appConfigSections: Record<string, number> | null = null;
    const scripts: Record<'pageData' | 'appConfig' | 'other', { artifact: string; size: number }[]> = {
        pageData: [],
        appConfig: [],
        other: [],
    };
    for (const item of inline) {
        const artifact = `scripts/${item.body.sha256}.js`;
        const text = await playhouse.readText(page, artifact);
        if (text === undefined) continue;
        const part = inlinePart(text);
        const size = Buffer.byteLength(text);
        bytes[part] += size;
        scripts[part === 'otherScripts' ? 'other' : part].push({ artifact, size });
        if (part === 'appConfig') appConfigSections ??= configSections(text);
    }
    const measured = inline.length > 0;
    const inlineTotal = bytes.pageData + bytes.appConfig + bytes.otherScripts;

    const lighthouseArtifact = runId ? `runs/${runId}/lhr.json` : null;
    const lhr = lighthouseArtifact ? await playhouse.readJson(page, lighthouseArtifact, lhrSchema) : undefined;
    const statistics = lhr?.audits['dom-size-insight']?.details?.items ?? [];
    const statistic = (name: string) => numeric(statistics.find((item) => item.statistic === name)?.value);
    const largestFirst = (items: { artifact: string; size: number }[]) =>
        items
            .slice()
            .sort((a, b) => b.size - a.size)
            .map((item) => item.artifact);

    return {
        page,
        url: match.finalUrl,
        htmlBytes,
        transferBytes: typeof transfer === 'number' && transfer > 0 ? transfer : null,
        pageDataBytes: measured ? bytes.pageData : null,
        appConfigBytes: measured ? bytes.appConfig : null,
        otherScriptBytes: measured ? bytes.otherScripts : null,
        markupBytes: measured ? Math.max(0, htmlBytes - inlineTotal) : null,
        scripts: {
            pageData: largestFirst(scripts.pageData),
            appConfig: largestFirst(scripts.appConfig),
            other: largestFirst(scripts.other),
        },
        appConfigSections,
        elements: lhr ? statistic('Total elements') : null,
        domDepth: lhr ? statistic('DOM depth') : null,
        harArtifact: match.harArtifact,
        harEntry: match.document.index,
        lighthouseArtifact: lhr ? lighthouseArtifact : null,
    };
}

export const kib = (bytes: number): string => `${Math.round(bytes / 1024)} KiB`;
export const count = (value: number): string => value.toLocaleString('en-US');

/** "297 KiB page data, 15 KiB app config, 9 KiB other inline scripts, 181 KiB markup", or "" when no scripts were archived. */
export function htmlBreakdown(size: PageSize): string {
    if (size.markupBytes === null) return '';
    return [
        `${kib(size.pageDataBytes ?? 0)} page data`,
        `${kib(size.appConfigBytes ?? 0)} app config`,
        `${kib(size.otherScriptBytes ?? 0)} other inline scripts`,
        `${kib(size.markupBytes)} markup`,
    ].join(', ');
}

type Measure = {
    /** Unit name for summaries, e.g. "Page data". */
    label: string;
    budget: number;
    value: (size: PageSize) => number | null;
    format: (value: number) => string;
    evidence: (size: PageSize, value: number) => { artifact: string; pointer?: string } | null;
    /** When false, a page over budget leaves the rule undecided so the agent can trace the cause. */
    decideFailures: boolean;
};

/** A measured value, marked "just over" when it would otherwise read the same as the budget it exceeds. */
const shown = (measure: Measure, value: number): string => {
    const text = measure.format(value);
    return value > measure.budget && text === measure.format(measure.budget) ? `just over ${text}` : text;
};

const evidenceFor = (measure: Measure, size: PageSize, value: number) => {
    const source = measure.evidence(size, value) ?? {
        artifact: size.harArtifact,
        pointer: `/log/entries/${size.harEntry}/response/content/size`,
    };
    return {
        type: 'playhouse' as const,
        page: size.page,
        ...source,
        value: `${measure.label} ${shown(measure, value)} (budget ${measure.format(measure.budget)})`,
    };
};

/**
 * A rule script that checks one measurement of each page's HTML against a budget. It passes when every measured page is
 * within budget. A page over budget fails the rule, or, when `decideFailures` is false, leaves it undecided with the
 * measurements as data so the agent can trace the cause.
 */
export function documentSizeRule(measure: Measure): RulePreparationFunction<Data> {
    return async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
        const data: Data = { cell: REPRESENTATIVE_CELL, budget: measure.budget, pages: [], skipped: [] };
        const measured: { size: PageSize; value: number }[] = [];
        for (const page of pages) {
            const size = await measurePage(playhouse, page.label);
            if ('reason' in size) {
                data.skipped.push({ page: page.label, reason: size.reason });
                continue;
            }
            data.pages.push(size);
            const value = measure.value(size);
            if (value === null)
                data.skipped.push({
                    page: page.label,
                    reason: `No ${measure.label.toLowerCase()} measurement was archived.`,
                });
            else measured.push({ size, value });
        }
        if (!measured.length) return { data };
        const over = measured.filter((item) => item.value > measure.budget);
        const list = (items: typeof measured) =>
            items.map((item) => `${item.size.page} ${shown(measure, item.value)}`).join(', ');
        if (!over.length) {
            return {
                data,
                decision: {
                    status: 'pass',
                    summary: `${measure.label} is within ${measure.format(measure.budget)} on every measured page (${list(measured)}).`,
                    evidence: measured.map((item) => evidenceFor(measure, item.size, item.value)),
                },
            };
        }
        if (!measure.decideFailures) return { data };
        return {
            data,
            decision: {
                status: 'fail',
                summary: `${measure.label} is over ${measure.format(measure.budget)} on ${over
                    .map((item) => {
                        const breakdown = htmlBreakdown(item.size);
                        return `${item.size.page} (${shown(measure, item.value)}${breakdown ? `: ${breakdown}` : ''})`;
                    })
                    .join('; ')}.`,
                evidence: over.map((item) => {
                    const evidence = evidenceFor(measure, item.size, item.value);
                    const breakdown = htmlBreakdown(item.size);
                    return breakdown ? { ...evidence, value: `${evidence.value}: ${breakdown}` } : evidence;
                }),
            },
        };
    };
}
