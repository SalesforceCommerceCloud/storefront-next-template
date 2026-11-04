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
import { kib, MIN_SAVINGS_BYTES, readImageRun, type ImageRun } from '../../../../rule-helpers/images';

/** An image is oversized when it has at least this many times the pixels the screen needs (srcset steps leave some slack). */
const MIN_PIXEL_RATIO = 2;

const reasonSchema = z
    .object({
        kind: z.enum(['oversized', 'animated-gif', 'format']),
        savingsBytes: z.number(),
        detail: z.string(),
    })
    .strict();

const imageSchema = z
    .object({
        url: z.string(),
        /** Index in the Lighthouse insight's items. */
        item: z.number(),
        bytes: z.number(),
        shown: z.object({ width: z.number(), height: z.number() }).strict().nullable(),
        intrinsic: z.object({ width: z.number(), height: z.number() }).strict().nullable(),
        savingsBytes: z.number(),
        reasons: z.array(reasonSchema),
        selector: z.string().nullable(),
        /** The element's accessible name (usually its alt text), to tell apart images with the same selector. */
        label: z.string().nullable(),
        aboveFold: z.boolean().nullable(),
        requestedBeforeLcp: z.boolean().nullable(),
    })
    .strict();

export const dataSchema = z
    .object({
        cell: z.string(),
        minSavingsBytes: z.number(),
        minPixelRatio: z.number(),
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    dpr: z.number(),
                    lcpMs: z.number().nullable(),
                    lighthouseArtifact: z.string(),
                    harArtifact: z.string(),
                    /** Images Lighthouse listed, and how many of those this rule dropped as right-sized for the pixel density. */
                    lighthouseItems: z.number(),
                    dropped: z.number(),
                    totalSavingsBytes: z.number(),
                    images: z.array(imageSchema),
                })
                .strict()
        ),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type Image = z.infer<typeof imageSchema>;

const SIZE_REASON = /\((\d+)x(\d+)\) for its displayed dimensions/;

/**
 * Lighthouse's compression-only estimate isn't used: it targets a fixed number of bytes per CSS pixel, so it counts
 * an image right-sized for a 3× screen as badly compressed (it put a q=70 DIS WebP of 21 KiB at 4 KiB, below what
 * DIS produces even at q=30).
 */
function otherReason(reason: string): Image['reasons'][number]['kind'] | null {
    if (/video formats/i.test(reason)) return 'animated-gif';
    if (/modern image format|webp|avif/i.test(reason)) return 'format';
    return null;
}

/**
 * Lighthouse's image delivery insight compares each image with its displayed size in CSS pixels, which overstates the
 * savings on high-density screens. This recomputes the resize savings at the emulated pixel density, and keeps
 * Lighthouse's format and animated GIF savings.
 */
function oversizedImages(run: ImageRun): Image[] {
    const result: Image[] = [];
    (run.lhr.audits['image-delivery-insight']?.details?.items ?? []).forEach((item, index) => {
        const rect = item.node?.boundingRect;
        const shown =
            rect && rect.width > 0 && rect.height > 0
                ? { width: Math.round(rect.width), height: Math.round(rect.height) }
                : null;
        const reasons: Image['reasons'] = [];
        let intrinsic: Image['intrinsic'] = null;
        for (const sub of item.subItems?.items ?? []) {
            const size = sub.reason.match(SIZE_REASON);
            if (size) {
                intrinsic = { width: Number(size[1]), height: Number(size[2]) };
                // Without a node there is no layout size to apply the pixel density to.
                if (!shown) continue;
                const needed = {
                    width: Math.min(intrinsic.width, Math.ceil(shown.width * run.dpr)),
                    height: Math.min(intrinsic.height, Math.ceil(shown.height * run.dpr)),
                };
                const ratio = (intrinsic.width * intrinsic.height) / (needed.width * needed.height);
                const savings = Math.round(item.totalBytes * (1 - 1 / ratio));
                if (ratio >= MIN_PIXEL_RATIO && savings >= MIN_SAVINGS_BYTES) {
                    reasons.push({
                        kind: 'oversized',
                        savingsBytes: savings,
                        detail: `${intrinsic.width}×${intrinsic.height} delivered; ${needed.width}×${needed.height} shows it at ${shown.width}×${shown.height} on a ${run.dpr}× screen`,
                    });
                }
                continue;
            }
            const kind = otherReason(sub.reason);
            if (kind && sub.wastedBytes >= MIN_SAVINGS_BYTES)
                reasons.push({ kind, savingsBytes: Math.round(sub.wastedBytes), detail: sub.reason });
        }
        if (!reasons.length) return;
        const entry = run.entries.find((candidate) => candidate.request.url === item.url);
        const start = entry ? run.startMs(entry) : NaN;
        result.push({
            url: item.url,
            item: index,
            bytes: Math.round(item.totalBytes),
            shown,
            intrinsic,
            // The reasons overlap (a right-sized image is also a smaller re-encode), so the largest is the estimate.
            savingsBytes: Math.max(...reasons.map((reason) => reason.savingsBytes)),
            reasons,
            selector: item.node?.selector ?? null,
            label: item.node?.nodeLabel ?? null,
            aboveFold: rect ? rect.top < run.viewportHeight : null,
            requestedBeforeLcp: Number.isFinite(start) && run.lcpMs !== null ? start < run.lcpMs : null,
        });
    });
    return result.slice().sort((a, b) => b.savingsBytes - a.savingsBytes);
}

const run: RulePreparationFunction<Data> = async ({ pages, playhouse }): Promise<PreparedRuleResult<Data>> => {
    const data: Data = {
        cell: 'mobile-cold',
        minSavingsBytes: MIN_SAVINGS_BYTES,
        minPixelRatio: MIN_PIXEL_RATIO,
        pages: [],
        skipped: [],
    };
    for (const page of pages) {
        const imageRun = await readImageRun(playhouse, page.label);
        if ('reason' in imageRun) {
            data.skipped.push({ page: page.label, reason: imageRun.reason });
            continue;
        }
        const insight = imageRun.lhr.audits['image-delivery-insight'];
        if (!insight) {
            data.skipped.push({ page: page.label, reason: 'The Lighthouse result has no image delivery insight.' });
            continue;
        }
        const items = insight.details?.items?.length ?? 0;
        const images = oversizedImages(imageRun);
        data.pages.push({
            page: page.label,
            dpr: imageRun.dpr,
            lcpMs: imageRun.lcpMs,
            lighthouseArtifact: imageRun.lighthouseArtifact,
            harArtifact: imageRun.harArtifact,
            lighthouseItems: items,
            dropped: items - images.length,
            totalSavingsBytes: images.reduce((total, image) => total + image.savingsBytes, 0),
            images,
        });
    }
    if (!data.pages.length) return { data };
    // Images worth a suggestion go to the agent, which finds the component that renders them.
    if (data.pages.some((item) => item.images.length)) return { data };
    return {
        data,
        decision: {
            status: 'pass',
            summary: `No image on ${data.pages.map((item) => item.page).join(', ')} would save ${kib(MIN_SAVINGS_BYTES)} or more by resizing, converting to WebP or AVIF, or replacing an animated GIF.`,
            evidence: data.pages.map((item) => ({
                type: 'playhouse' as const,
                page: item.page,
                artifact: item.lighthouseArtifact,
                pointer: '/audits/image-delivery-insight',
                value: item.lighthouseItems
                    ? `Lighthouse listed ${item.lighthouseItems} image${item.lighthouseItems === 1 ? '' : 's'}; each is right-sized for a ${item.dpr}× screen or would save less than ${kib(MIN_SAVINGS_BYTES)}`
                    : 'Lighthouse found no image delivery savings',
            })),
        },
    };
};

export default run;
