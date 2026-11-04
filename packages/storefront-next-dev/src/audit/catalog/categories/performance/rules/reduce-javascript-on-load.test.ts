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
import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../__fixtures__/bundle';
import { analyzeBundle } from '../../../../bundle/analyze';
import type { BundleAnalysis, LocalPage } from '../../../../bundle/schema';
import { PlayhouseArtifactReader } from '../../../../evidence';
import reduceJavascript from './reduce-javascript-on-load';

describe('performance/reduce-javascript-on-load', () => {
    it('hands the local build to the AI, passes when nothing is large, and is not verified without a build', async () => {
        const { outputs, page } = await fixture();
        const bundle = await analyzeBundle(outputs, [page], new PlayhouseArtifactReader([page]));
        const undecided = reduceJavascript({ bundle } as never);
        expect(undecided.decision).toBeUndefined();
        // Only what could save 30 KiB reaches the AI: the drawer (with big-lib), not the 11 KiB header; big-lib, not
        // react-dom, which the app's start needs, and never the bundler's own bytes.
        const local = undecided.data.pages[0]?.local;
        expect(local?.candidates.map((item) => item.target)).toEqual(['src/components/drawer/index.tsx']);
        expect(local?.packages.map((owner) => owner.name)).toEqual(['big-lib']);
        expect(undecided.data.minSavedBytes).toBe(30 * 1024);
        const withLocal = (changes: Partial<LocalPage> | null): BundleAnalysis => ({
            ...bundle,
            pages: bundle.pages.map((item) => ({
                ...item,
                local: changes && item.local && { ...item.local, ...changes },
            })),
        });
        expect(
            reduceJavascript({ bundle: withLocal({ candidates: [], packages: [] }) } as never).decision?.status
        ).toBe('pass');
        // Without the module graph the AI still has the composition and the source.
        expect(reduceJavascript({ bundle: { ...bundle, status: 'partial' } } as never).decision).toBeUndefined();
        // A failed build never reaches the AI: the rule is decided as not verified, with the build's note.
        const failed = reduceJavascript({
            bundle: { ...withLocal(null), status: 'unavailable', notes: ['The analyze build failed (exit code 1).'] },
        } as never);
        expect([failed.decision?.status, failed.decision?.evidence]).toEqual(['not-verified', []]);
        expect(failed.decision?.summary).toMatch(
            /wasn't built, so its bundle wasn't analyzed: The analyze build failed \(exit code 1\)\./
        );
        expect(reduceJavascript({ bundle: withLocal(null) } as never).decision?.status).toBe('not-verified');
        const absent = reduceJavascript({} as never);
        expect([absent.data.status, absent.decision?.status]).toEqual(['unavailable', 'not-verified']);
    });
});
