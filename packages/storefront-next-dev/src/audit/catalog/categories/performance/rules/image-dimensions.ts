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
import { readImageRun, type ImageRun } from '../../../../rule-helpers/images';

/** Shifts smaller than this aren't noticeable. */
const MIN_SHIFT = 0.01;
const UNSIZED_CAUSE = 'Unsized image element';

const elementSchema = z
    .object({ selector: z.string().nullable(), top: z.number().nullable(), bottom: z.number().nullable() })
    .strict();

export const dataSchema = z
    .object({
        cell: z.string(),
        minShift: z.number(),
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    lighthouseArtifact: z.string(),
                    cls: z.number().nullable(),
                    /** The worst cluster's shift from unsized images that could have caused it; CLS is the worst cluster's score too. */
                    unsizedShift: z.number(),
                    /** Shifted elements Lighthouse blames on an unsized image, and the images it names. */
                    shifts: z.array(
                        z
                            .object({
                                cluster: z.number(),
                                score: z.number(),
                                element: elementSchema,
                                culprits: z.array(
                                    elementSchema
                                        .extend({
                                            url: z.string().nullable(),
                                            /** False when the image starts below the shifted element's top, so its loading can't have moved it. */
                                            plausible: z.boolean(),
                                        })
                                        .strict()
                                ),
                            })
                            .strict()
                    ),
                    /** Images without width and height; they shift the layout only when their CSS doesn't fix their size. */
                    unsizedImages: z.array(elementSchema.extend({ url: z.string() }).strict()),
                })
                .strict()
        ),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type Page = Data['pages'][number];

type Node = { path?: string; selector?: string; snippet?: string; boundingRect?: { top?: number; bottom?: number } };
type Row = { node?: Node; score?: number; subItems?: { items?: { cause?: string; extra?: Node }[] } };

const SRC = /\ssrc="([^"]+)"/;
const element = (node: Node | undefined) => ({
    selector: node?.selector ?? null,
    top: node?.boundingRect?.top ?? null,
    bottom: node?.boundingRect?.bottom ?? null,
});

/**
 * Lighthouse's layout shift culprits insight links a shift to unsized images by timing, so it can name an image that
 * is nowhere near the shifted element. An image moves an element only from above it or beside it, so culprits that
 * start below the element's top are marked implausible and don't count.
 */
function unsizedShifts(run: ImageRun): Pick<Page, 'unsizedShift' | 'shifts'> {
    // Lighthouse truncates long URLs in snippets, so the full URL comes from the unsized images audit when it lists the node.
    const urls = new Map(
        (run.lhr.audits['unsized-images']?.details?.items ?? []).flatMap((item) =>
            item.url && item.node?.path ? [[item.node.path, item.url] as const] : []
        )
    );
    const shifts: Page['shifts'] = [];
    let unsizedShift = 0;
    (run.lhr.audits['cls-culprits-insight']?.details?.items ?? []).forEach((cluster, index) => {
        let clusterShift = 0;
        for (const row of (cluster as { items?: Row[] }).items ?? []) {
            const causes = (row.subItems?.items ?? []).filter((item) => item.cause === UNSIZED_CAUSE);
            // The cluster's Total row has a text node and no causes.
            if (!causes.length || !row.node?.selector) continue;
            const shifted = element(row.node);
            const culprits = causes.flatMap(({ extra }) => {
                if (!extra?.selector) return [];
                const src = extra.snippet?.match(SRC)?.[1];
                const url = (extra.path && urls.get(extra.path)) || (src && !src.includes('…') ? src : null);
                const image = element(extra);
                return [
                    {
                        ...image,
                        url,
                        plausible: image.top === null || shifted.top === null || image.top <= shifted.top,
                    },
                ];
            });
            const score = row.score ?? 0;
            shifts.push({ cluster: index, score, element: shifted, culprits });
            // A cause without a named image may still be an image; only a named, impossible culprit is ruled out.
            if (causes.length > culprits.length || culprits.some((culprit) => culprit.plausible)) clusterShift += score;
        }
        unsizedShift = Math.max(unsizedShift, clusterShift);
    });
    return { unsizedShift, shifts };
}

const round = (value: number): string => value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

const run: RulePreparationFunction<Data> = async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
    const data: Data = { cell: 'mobile-cold', minShift: MIN_SHIFT, pages: [], skipped: [] };
    for (const page of pages) {
        const imageRun = await readImageRun(playhouse, page.label);
        if ('reason' in imageRun) {
            data.skipped.push({ page: page.label, reason: imageRun.reason });
            continue;
        }
        if (!imageRun.lhr.audits['cls-culprits-insight']) {
            data.skipped.push({
                page: page.label,
                reason: 'The Lighthouse result has no layout shift culprits insight.',
            });
            continue;
        }
        data.pages.push({
            page: page.label,
            lighthouseArtifact: imageRun.lighthouseArtifact,
            cls: imageRun.lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
            ...unsizedShifts(imageRun),
            unsizedImages: (imageRun.lhr.audits['unsized-images']?.details?.items ?? []).flatMap((item) =>
                item.url ? [{ url: item.url, ...element(item.node) }] : []
            ),
        });
    }
    if (!data.pages.length) return { data };
    // A noticeable shift goes to the agent, which checks in the source whether an image without dimensions can cause it.
    if (data.pages.some((item) => item.unsizedShift >= MIN_SHIFT)) return { data };
    const unsized = data.pages.reduce((total, item) => total + item.unsizedImages.length, 0);
    return {
        data,
        decision: {
            status: 'pass',
            summary: `Images without dimensions cause no noticeable layout shift on ${data.pages.map((item) => item.page).join(', ')}${unsized ? `; Lighthouse lists ${unsized} image${unsized === 1 ? '' : 's'} without width and height, but their layout reserves the space` : ''}.`,
            evidence: data.pages.map((item) => ({
                type: 'playhouse' as const,
                page: item.page,
                artifact: item.lighthouseArtifact,
                pointer: '/audits/cls-culprits-insight',
                value: `CLS ${round(item.cls ?? 0)}, ${round(item.unsizedShift)} from unsized images`,
            })),
        },
    };
};

export default run;
