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
import { assetName, parseRouteModulesScript, type RenderedRoutes } from './parse';

const CELL = { formFactor: 'mobile', cacheState: 'cold' } as const;

/** Storefront Next serves the app's build from this path on Managed Runtime. */
export const BUNDLE_PATH = '/mobify/bundle/';

const lcpSummarySchema = z
    .object({
        cells: z.array(
            z
                .object({
                    formFactor: z.string(),
                    cacheState: z.string(),
                    median: z.object({ runId: z.string() }).passthrough().nullable().optional(),
                })
                .passthrough()
        ),
    })
    .passthrough();

const requestSchema = z
    .object({
        url: z.string(),
        resourceType: z.string().optional(),
        statusCode: z.number().optional(),
        resourceSize: z.number().optional(),
        transferSize: z.number().optional(),
        networkRequestTime: z.number().optional(),
    })
    .passthrough();
const lhrSchema = z
    .object({
        audits: z
            .object({
                'network-requests': z
                    .object({
                        details: z
                            .object({ items: z.array(requestSchema) })
                            .passthrough()
                            .optional(),
                    })
                    .passthrough()
                    .optional(),
                metrics: z
                    .object({
                        details: z
                            .object({ items: z.array(z.object({ observedLoad: z.number().optional() }).passthrough()) })
                            .passthrough()
                            .optional(),
                    })
                    .passthrough()
                    .optional(),
            })
            .passthrough(),
    })
    .passthrough();

const scriptsIndexSchema = z
    .object({
        observations: z.array(
            z
                .object({
                    runId: z.string(),
                    url: z.string(),
                    body: z.object({ sha256: z.string() }).passthrough().nullable().optional(),
                })
                .passthrough()
        ),
    })
    .passthrough();

export type LiveScript = {
    url: string;
    file: string;
    /** Index in `audits['network-requests'].details.items`. */
    item: number;
    decodedBytes: number;
    transferBytes: number;
    /** Request start, ms after the navigation started. */
    startMs: number | null;
    /** Requested at or before the run's own load event. */
    beforeLoad: boolean;
};

export type LivePage = {
    page: string;
    runId: string;
    lighthouseArtifact: string;
    observedLoadMs: number | null;
    scripts: LiveScript[];
    rendered?: RenderedRoutes;
};

/** A first-party script: served from the storefront's bundle path. */
export function isFirstParty(url: string): boolean {
    try {
        return new URL(url).pathname.includes(BUNDLE_PATH);
    } catch {
        return false;
    }
}

/** The page's median mobile cold-cache run's first-party scripts, or why they can't be read. */
export async function readLivePage(
    playhouse: PlayhouseArtifactReader,
    page: string
): Promise<LivePage | { reason: string }> {
    const summary = await playhouse.readJson(page, 'summary-lcp.json', lcpSummarySchema);
    const runId = summary?.cells.find(
        (cell) => cell.formFactor === CELL.formFactor && cell.cacheState === CELL.cacheState
    )?.median?.runId;
    if (!runId) return { reason: 'summary-lcp.json has no mobile cold-cache median run.' };
    const lighthouseArtifact = `runs/${runId}/lhr.json`;
    const lhr = await playhouse.readJson(page, lighthouseArtifact, lhrSchema);
    const items = lhr?.audits['network-requests']?.details?.items;
    if (!items) return { reason: `${lighthouseArtifact} has no network-requests audit.` };
    const load = lhr.audits.metrics?.details?.items[0]?.observedLoad;
    const observedLoadMs = typeof load === 'number' && load > 0 ? load : null;
    const scripts = items.flatMap((request, item): LiveScript[] => {
        if (request.resourceType !== 'Script' || (request.statusCode ?? 200) >= 400 || !isFirstParty(request.url))
            return [];
        const startMs = request.networkRequestTime ?? null;
        return [
            {
                url: request.url,
                file: assetName(request.url),
                item,
                decodedBytes: request.resourceSize ?? 0,
                transferBytes: request.transferSize ?? 0,
                startMs,
                beforeLoad: observedLoadMs === null || (startMs !== null && startMs <= observedLoadMs),
            },
        ];
    });
    const rendered = await readRenderedRoutes(playhouse, page, runId);
    return { page, runId, lighthouseArtifact, observedLoadMs, scripts, ...(rendered ? { rendered } : {}) };
}

/** The route branch from React Router's inline script in the run's HTML, when Playhouse archived it. */
async function readRenderedRoutes(
    playhouse: PlayhouseArtifactReader,
    page: string,
    runId: string
): Promise<RenderedRoutes | undefined> {
    const index = await playhouse.readJson(page, 'scripts/index.json', scriptsIndexSchema);
    const seen = new Set<string>();
    for (const observation of index?.observations ?? []) {
        const sha = observation.body?.sha256;
        // Inline scripts carry the page URL rather than an asset URL.
        if (
            observation.runId !== runId ||
            !sha ||
            !/^[a-f0-9]{64}$/.test(sha) ||
            seen.has(sha) ||
            /\.m?js(?:[?#]|$)/.test(observation.url)
        )
            continue;
        seen.add(sha);
        const code = await playhouse.readText(page, `scripts/${sha}.js`);
        const rendered = code === undefined ? undefined : parseRouteModulesScript(code);
        if (rendered) return rendered;
    }
    return undefined;
}
