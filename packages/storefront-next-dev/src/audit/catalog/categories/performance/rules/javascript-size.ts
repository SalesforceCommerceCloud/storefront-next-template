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
import { readLivePage, type LivePage } from '../../../../bundle/live';
import type { PreparedRuleResult, RulePreparationContext } from '../../../../preparation';

const BUDGET_BYTES = 1_400_000;
const HIGH_BYTES = 2_700_000;
const LARGEST = 10;

const pageSchema = z
    .object({
        page: z.string(),
        lighthouseArtifact: z.string(),
        scripts: z.number().int(),
        decodedBytes: z.number(),
        transferBytes: z.number(),
        /** Scripts requested at or before the run's own load event, and the rest. */
        beforeLoad: z.object({ scripts: z.number().int(), decodedBytes: z.number() }).strict(),
        afterLoad: z.object({ scripts: z.number().int(), decodedBytes: z.number() }).strict(),
        largest: z.array(
            z
                .object({
                    file: z.string(),
                    item: z.number().int(),
                    decodedBytes: z.number(),
                    transferBytes: z.number(),
                })
                .strict()
        ),
    })
    .strict();

export const dataSchema = z
    .object({
        budget: z.number(),
        pages: z.array(pageSchema),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;
type Page = z.infer<typeof pageSchema>;

const mb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(2)} MB`;
const kib = (bytes: number): string => `${Math.round(bytes / 1024)} KiB`;

function measured(live: LivePage): Page {
    const sum = (scripts: LivePage['scripts']) => scripts.reduce((total, script) => total + script.decodedBytes, 0);
    const before = live.scripts.filter((script) => script.beforeLoad);
    const after = live.scripts.filter((script) => !script.beforeLoad);
    return {
        page: live.page,
        lighthouseArtifact: live.lighthouseArtifact,
        scripts: live.scripts.length,
        decodedBytes: sum(live.scripts),
        transferBytes: live.scripts.reduce((total, script) => total + script.transferBytes, 0),
        beforeLoad: { scripts: before.length, decodedBytes: sum(before) },
        afterLoad: { scripts: after.length, decodedBytes: sum(after) },
        largest: live.scripts
            .slice()
            .sort((a, b) => b.decodedBytes - a.decodedBytes)
            .slice(0, LARGEST)
            .map(({ file, item, decodedBytes, transferBytes }) => ({ file, item, decodedBytes, transferBytes })),
    };
}

const totalEvidence = (page: Page) => ({
    type: 'playhouse' as const,
    page: page.page,
    artifact: page.lighthouseArtifact,
    pointer: '/audits/network-requests/details/items',
    value: `${mb(page.decodedBytes)} first-party JavaScript (${kib(page.transferBytes)} transferred) in ${page.scripts} scripts, ${page.beforeLoad.scripts} before load (budget ${mb(BUDGET_BYTES)})`,
});

/** Measured on the live site only: the local build may be built from other code, so it never adds to these numbers. */
export default async function javascriptSize({
    pages,
    playhouse,
}: RulePreparationContext): Promise<PreparedRuleResult<Data>> {
    const data: Data = { budget: BUDGET_BYTES, pages: [], skipped: [] };
    for (const { label } of pages) {
        const live = await readLivePage(playhouse, label);
        if ('reason' in live) {
            data.skipped.push({ page: label, reason: live.reason });
            continue;
        }
        if (!live.scripts.length) {
            data.skipped.push({
                page: label,
                reason: 'The run loaded no scripts from its own bundle path (mobify/bundle).',
            });
            continue;
        }
        data.pages.push(measured(live));
    }
    if (!data.pages.length) return { data };
    const over = data.pages.filter((page) => page.decodedBytes > BUDGET_BYTES);
    const list = data.pages.map((page) => `${page.page} ${mb(page.decodedBytes)}`).join(', ');
    if (!over.length)
        return {
            data,
            decision: {
                status: 'pass',
                summary: `First-party JavaScript is within ${mb(BUDGET_BYTES)} on every measured page (${list}).`,
                evidence: data.pages.map(totalEvidence),
            },
        };
    return {
        data,
        decision: {
            status: 'fail',
            severity: over.some((page) => page.decodedBytes >= HIGH_BYTES) ? 'high' : 'medium',
            summary: `First-party JavaScript is over ${mb(BUDGET_BYTES)} on ${over.map((page) => `${page.page} (${mb(page.decodedBytes)} in ${page.scripts} scripts)`).join('; ')}.`,
            evidence: over.flatMap((page) => [
                totalEvidence(page),
                ...page.largest.slice(0, 3).map((script) => ({
                    type: 'playhouse' as const,
                    page: page.page,
                    artifact: page.lighthouseArtifact,
                    pointer: `/audits/network-requests/details/items/${script.item}/resourceSize`,
                    value: `${script.file} ${kib(script.decodedBytes)}`,
                })),
            ]),
        },
    };
}
