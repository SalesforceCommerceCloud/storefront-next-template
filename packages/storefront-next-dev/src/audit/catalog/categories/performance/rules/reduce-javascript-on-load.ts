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
import {
    MIN_RECOMMENDED_BYTES,
    bundleCandidateSchema,
    bundlePackageSchema,
    bundlePageSchema,
    type BundlePackage,
} from '../../../../bundle/schema';
import type { PreparedRuleResult, RulePreparationContext } from '../../../../preparation';

const MAX_PACKAGES = 30;

/**
 * Only what could save `MIN_RECOMMENDED_BYTES` reaches the AI. An npm package the app's start needs (`deferrableBytes`
 * 0, or entry.client's own import) can't load later, so it's left out unless two versions of it are bundled.
 */
function worthALook(owner: BundlePackage, graph: boolean): boolean {
    if (owner.kind === 'build' || owner.bytes < MIN_RECOMMENDED_BYTES) return false;
    if (owner.kind === 'project' || !graph || owner.versions) return true;
    return (owner.deferrableBytes ?? 0) >= MIN_RECOMMENDED_BYTES;
}

const pageSchema = z
    .object({
        page: z.string(),
        route: bundlePageSchema.shape.route,
        /** What the live page downloaded, for context only: the live site may be built from other code. */
        liveDecodedBytes: z.number(),
        /** The page's routes in the local build. */
        local: z
            .object({
                chunks: z.number().int(),
                bytes: z.number(),
                candidates: z.array(bundleCandidateSchema),
                packages: z.array(bundlePackageSchema),
            })
            .strict(),
    })
    .strict();

export const dataSchema = z
    .object({
        status: z.enum(['complete', 'partial', 'unavailable']),
        notes: z.array(z.string()),
        /** The build's visualizer report, in the run folder. */
        visualizer: z.string().nullable(),
        minSavedBytes: z.number(),
        pages: z.array(pageSchema),
        skipped: z.array(z.object({ page: z.string(), reason: z.string() }).strict()),
    })
    .strict();
type Data = z.infer<typeof dataSchema>;

/** Without a local build there is nothing to recommend from, so the AI isn't asked. */
function notVerified(data: Data, reason: string): PreparedRuleResult<Data> {
    return {
        data,
        decision: {
            status: 'not-verified',
            summary: `${reason} Re-run the audit once the project's build script succeeds.`,
            evidence: [],
        },
    };
}

export default function reduceJavascriptOnLoad({ bundle }: RulePreparationContext): PreparedRuleResult<Data> {
    if (!bundle)
        return notVerified(
            {
                status: 'unavailable',
                notes: ['prepare produced no bundle analysis.'],
                visualizer: null,
                minSavedBytes: MIN_RECOMMENDED_BYTES,
                pages: [],
                skipped: [],
            },
            'The run has no bundle analysis.'
        );
    const data: Data = {
        status: bundle.status,
        notes: bundle.notes,
        visualizer: bundle.build?.visualizer ?? null,
        minSavedBytes: MIN_RECOMMENDED_BYTES,
        skipped: bundle.skipped,
        pages: bundle.pages.flatMap((page) =>
            page.local
                ? [
                      {
                          page: page.page,
                          route: page.route,
                          liveDecodedBytes: page.live.decodedBytes,
                          local: {
                              chunks: page.local.chunks,
                              bytes: page.local.bytes,
                              candidates: page.local.candidates.filter(
                                  (item) => item.savedBytes >= MIN_RECOMMENDED_BYTES
                              ),
                              packages: page.local.packages
                                  .filter((owner) => worthALook(owner, bundle.status === 'complete'))
                                  .slice(0, MAX_PACKAGES),
                          },
                      },
                  ]
                : []
        ),
    };
    if (bundle.status === 'unavailable')
        return notVerified(data, `The project wasn't built, so its bundle wasn't analyzed: ${bundle.notes.join(' ')}`);
    if (!data.pages.length)
        return notVerified(data, "No page's route was found in the local build, so no page was analyzed.");
    if (
        data.pages.some(
            (page) => page.local.candidates.length || page.local.packages.some((owner) => owner.kind === 'npm')
        )
    )
        return { data };
    // Nothing on any page is big enough to change: decided without the AI.
    return {
        data,
        decision: {
            status: 'pass',
            summary: `In the local build, nothing that ${data.pages.map((page) => page.page).join(', ')} load up front could load later and save ${MIN_RECOMMENDED_BYTES / 1024} KiB or more.`,
            evidence: data.pages.map((page) => ({
                type: 'manual' as const,
                description: `Local build: ${page.local.chunks} chunks, ${Math.round(page.local.bytes / 1024)} KiB up front.`,
                location: page.page,
            })),
        },
    };
}
