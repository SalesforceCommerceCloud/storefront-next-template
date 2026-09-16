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

import { describe, expect, it, vi } from 'vitest';
import { dedupePreloadResources, resolvePreloadResources, type PageDesignerPreloadManifest } from '.';

const manifest: PageDesignerPreloadManifest = {
    resources: [
        { file: 'assets/shared.js', kind: 'module' },
        { file: 'assets/hero.js', kind: 'module' },
        { file: 'assets/hero.css', kind: 'style' },
    ],
    components: {
        'Content.hero': { dependencies: [0], entries: [1], styles: [2] },
        'Layout.banner': { dependencies: [0] },
    },
};

describe('resolvePreloadResources', () => {
    it('deduplicates resources by kind and href', () => {
        const module = { kind: 'module' as const, href: '/assets/shared.js' };
        const style = { kind: 'style' as const, href: '/assets/shared.js' };

        expect(dedupePreloadResources([module, module, style])).toEqual([module, style]);
    });

    it('dedupes and returns styles, entries, then dependencies with one asset prefix', () => {
        expect(
            resolvePreloadResources(manifest, ['Content.hero', 'Layout.banner'], {
                bundlePath: '/mobify/bundle/42/client/assets/',
            })
        ).toEqual([
            { kind: 'style', href: '/mobify/bundle/42/client/assets/hero.css' },
            { kind: 'module', href: '/mobify/bundle/42/client/assets/hero.js' },
            { kind: 'module', href: '/mobify/bundle/42/client/assets/shared.js' },
        ]);
    });

    it('promotes a shared dependency to entry priority when another component uses it as its entry', () => {
        const dependency = {
            file: 'assets/a-dependency.js',
            kind: 'module' as const,
        };
        const dependencyIndex = manifest.resources.length;

        expect(
            resolvePreloadResources(
                {
                    ...manifest,
                    resources: [...manifest.resources, dependency],
                    components: {
                        'Content.dependencyOwner': { dependencies: [0, dependencyIndex] },
                        'Content.entryOwner': { entries: [0] },
                    },
                },
                ['Content.dependencyOwner', 'Content.entryOwner'],
                { bundlePath: '/' }
            )
        ).toEqual([
            { kind: 'module', href: '/assets/shared.js' },
            { kind: 'module', href: '/assets/a-dependency.js' },
        ]);
    });

    it('preserves encounter order for resources with the same role', () => {
        expect(
            resolvePreloadResources(
                { ...manifest, components: { 'Layout.shared': { dependencies: [0, 1] } } },
                ['Layout.shared'],
                { bundlePath: '/' }
            )
        ).toEqual([
            { kind: 'module', href: '/assets/shared.js' },
            { kind: 'module', href: '/assets/hero.js' },
        ]);
    });

    it('preserves stylesheet encounter order instead of sorting hashed filenames', () => {
        const styles = [
            {
                file: 'assets/z-dependency.css',
                kind: 'style' as const,
            },
            {
                file: 'assets/a-component.css',
                kind: 'style' as const,
            },
        ];
        const firstStyleIndex = manifest.resources.length;

        expect(
            resolvePreloadResources(
                {
                    ...manifest,
                    resources: [...manifest.resources, ...styles],
                    components: { 'Content.ordered': { styles: [firstStyleIndex, firstStyleIndex + 1] } },
                },
                ['Content.ordered'],
                { bundlePath: '/' }
            )
        ).toEqual([
            { kind: 'style', href: '/assets/z-dependency.css' },
            { kind: 'style', href: '/assets/a-component.css' },
        ]);
    });

    it('warns for unknown IDs and warns at the resource threshold without truncating', () => {
        const onWarning = vi.fn();
        const result = resolvePreloadResources(manifest, ['missing', 'Content.hero'], {
            bundlePath: '/',
            warnAtResources: 3,
            onWarning,
        });
        expect(result).toHaveLength(3);
        expect(onWarning).toHaveBeenCalledWith({ code: 'unknown-type-ids', typeIds: ['missing'] });
        expect(onWarning).toHaveBeenCalledWith({ code: 'resource-count', selectedResources: 3, warnAtResources: 3 });
    });

    it.each([
        null,
        { ...manifest, resources: null },
        { ...manifest, components: null },
    ])('rejects malformed manifests', (invalidManifest) => {
        expect(() =>
            resolvePreloadResources(invalidManifest as unknown as PageDesignerPreloadManifest, [], {
                bundlePath: '/',
            })
        ).toThrow('Malformed');
    });

    it('rejects component references to missing resources', () => {
        expect(() =>
            resolvePreloadResources(
                {
                    ...manifest,
                    components: { 'Content.broken': { entries: [manifest.resources.length] } },
                },
                ['Content.broken'],
                { bundlePath: '/' }
            )
        ).toThrow('references missing resource');
    });
});
