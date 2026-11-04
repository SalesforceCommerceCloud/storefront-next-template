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
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { PlayhouseArtifactReader } from '../../../../evidence';
import type { RulePreparationContext } from '../../../../preparation';
import run from './font-display';

const TRACE_LIMIT = 256 * 1024 * 1024;
const pages = ['home', 'pdp'].map((label) => ({
    label,
    url: `https://example.com/${label}`,
    archiveDir: `/archive/${label}`,
    playhouseVersion: '9.9.9',
}));
const summary = {
    runs: ['mobile', 'desktop'].map((formFactor) => ({
        runId: `${formFactor}-cold-1`,
        formFactor,
        cacheState: 'cold',
        isMedian: true,
    })),
};
const har = { log: { entries: [] } };

function context(playhouse: PlayhouseArtifactReader, selected = pages.slice(0, 1)): RulePreparationContext {
    return { rule: {} as RulePreparationContext['rule'], pages: selected, playhouse };
}

describe('font display artifact isolation', () => {
    it('reads bounded trace text and skips each cell when trace parsing fails', async () => {
        const traceReads: { artifact: string; maxBytes?: number }[] = [];
        const playhouse = {
            readJson<T>(_page: string, artifact: string, _schema: z.ZodType<T>): Promise<T | undefined> {
                if (artifact === 'summary.json') return Promise.resolve(summary as T);
                if (artifact.endsWith('/network.har')) return Promise.resolve(har as T);
                throw new Error('Trace JSON must be read through bounded text.');
            },
            readText(_page: string, artifact: string, maxBytes?: number): Promise<string | undefined> {
                traceReads.push({ artifact, maxBytes });
                return Promise.resolve('{broken json');
            },
        } as unknown as PlayhouseArtifactReader;

        const result = await run(context(playhouse));

        expect(traceReads).toEqual([
            { artifact: 'runs/mobile-cold-1/trace.json', maxBytes: TRACE_LIMIT },
            { artifact: 'runs/desktop-cold-1/trace.json', maxBytes: TRACE_LIMIT },
        ]);
        expect(result.data.pages).toEqual([{ page: 'home', cells: [] }]);
        expect(result.data.skipped).toEqual([
            {
                page: 'home',
                cell: 'mobile-cold',
                reason: 'runs/mobile-cold-1/trace.json could not be read or parsed safely.',
            },
            {
                page: 'home',
                cell: 'desktop-cold',
                reason: 'runs/desktop-cold-1/trace.json could not be read or parsed safely.',
            },
        ]);
    });

    it('finishes one page before measuring the next', async () => {
        let activePage: string | undefined;
        const playhouse = {
            readJson<T>(_page: string, artifact: string, _schema: z.ZodType<T>): Promise<T | undefined> {
                if (artifact === 'summary.json') return Promise.resolve(summary as T);
                if (artifact.endsWith('/network.har')) return Promise.resolve(har as T);
                return Promise.resolve(undefined);
            },
            async readText(page: string, _artifact: string, maxBytes?: number): Promise<string | undefined> {
                expect(maxBytes).toBe(TRACE_LIMIT);
                if (activePage && activePage !== page) throw new Error(`overlapped ${activePage} and ${page}`);
                activePage = page;
                await new Promise((resolve) => setTimeout(resolve, 5));
                activePage = undefined;
                return JSON.stringify({ traceEvents: [] });
            },
        } as unknown as PlayhouseArtifactReader;

        const result = await run(context(playhouse, pages));

        expect(result.decision?.status).toBe('pass');
        expect(result.data.pages.map((page) => page.page)).toEqual(['home', 'pdp']);
    });
});
