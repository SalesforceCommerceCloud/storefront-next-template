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
import { describe, expect, test, vi } from 'vitest';

vi.mock('virtual:storefront-next/theme-breakpoints', () => ({
    default: { md: '48rem', lg: '64rem' },
}));

const { scopeArtDirection, sortArtDirectedSources } = await import('./art-direction');

const MD_AND_UP = '(min-width: 48rem)';
const BELOW_MD = '(max-width: 47.99875rem)';
const LG_AND_UP = '(min-width: 64rem)';
const BELOW_LG = '(max-width: 63.99875rem)';

describe('sortArtDirectedSources', () => {
    test('orders entries from the smallest viewport to the largest', () => {
        const sorted = sortArtDirectedSources([
            { src: 'desktop.jpg', breakpoint: 'lg' },
            { src: 'phone.jpg' },
            { src: 'tablet.jpg', breakpoint: 'md' },
        ]);

        expect(sorted.map((entry) => entry.src)).toEqual(['phone.jpg', 'tablet.jpg', 'desktop.jpg']);
    });

    test('does not mutate the caller array', () => {
        const entries = [{ src: 'desktop.jpg', breakpoint: 'lg' }, { src: 'phone.jpg' }];

        sortArtDirectedSources(entries);

        expect(entries.map((entry) => entry.src)).toEqual(['desktop.jpg', 'phone.jpg']);
    });

    test('throws for a breakpoint the theme does not define', () => {
        expect(() => sortArtDirectedSources([{ src: 'a.jpg' }, { src: 'b.jpg', breakpoint: 'xl' }])).toThrow(
            '--breakpoint-xl'
        );
    });
});

describe('scopeArtDirection', () => {
    test('uses the bare URL as an unconditional source and link for a single rendition', () => {
        const result = scopeArtDirection([{ src: 'only.jpg', sources: [], links: [] }]);

        expect(result.sources).toEqual([{ srcSet: 'only.jpg', media: '' }]);
        expect(result.links).toEqual([{ href: 'only.jpg', media: '' }]);
    });

    test('gives two bare-URL renditions exclusive, non-overlapping ranges', () => {
        const result = scopeArtDirection([
            { src: 'phone.jpg', sources: [], links: [] },
            { src: 'desktop.jpg', breakpoint: 'md', sources: [], links: [] },
        ]);

        expect(result.sources).toEqual([
            { srcSet: 'phone.jpg', media: BELOW_MD },
            { srcSet: 'desktop.jpg', media: MD_AND_UP },
        ]);
        expect(result.links).toEqual([
            { href: 'phone.jpg', media: BELOW_MD },
            { href: 'desktop.jpg', media: MD_AND_UP },
        ]);
    });

    test('bounds a middle rendition on both sides', () => {
        const result = scopeArtDirection([
            { src: 'phone.jpg', sources: [], links: [] },
            { src: 'tablet.jpg', breakpoint: 'md', sources: [], links: [] },
            { src: 'desktop.jpg', breakpoint: 'lg', sources: [], links: [] },
        ]);

        expect(result.sources.map((source) => source.media)).toEqual([
            BELOW_MD,
            `${MD_AND_UP} and ${BELOW_LG}`,
            LG_AND_UP,
        ]);
    });

    test('keeps each resolved source and appends the range to its own media query', () => {
        const result = scopeArtDirection([
            {
                src: 'phone.jpg',
                sources: [
                    {
                        srcSet: 'phone-400.webp 400w',
                        type: 'image/webp',
                        media: '(min-width: 20rem)',
                    },
                ],
                links: [
                    {
                        href: 'phone-400.webp',
                        srcSet: 'phone-400.webp 400w',
                        media: '(min-width: 20rem)',
                    },
                ],
            },
            {
                src: 'desktop.jpg',
                breakpoint: 'md',
                sources: [{ srcSet: 'desktop-1200.webp 1200w', type: 'image/webp' }],
                links: [{ href: 'desktop-1200.webp', srcSet: 'desktop-1200.webp 1200w' }],
            },
        ]);

        expect(result.sources).toEqual([
            {
                srcSet: 'phone-400.webp 400w',
                type: 'image/webp',
                media: `(min-width: 20rem) and ${BELOW_MD}`,
            },
            {
                srcSet: 'desktop-1200.webp 1200w',
                type: 'image/webp',
                media: MD_AND_UP,
            },
        ]);
        expect(result.links).toEqual([
            {
                href: 'phone-400.webp',
                srcSet: 'phone-400.webp 400w',
                media: `(min-width: 20rem) and ${BELOW_MD}`,
            },
            {
                href: 'desktop-1200.webp',
                srcSet: 'desktop-1200.webp 1200w',
                media: MD_AND_UP,
            },
        ]);
    });

    test('lists sources in rendition order so the first match is the smallest viewport', () => {
        const result = scopeArtDirection([
            { src: 'phone.jpg', sources: [], links: [] },
            { src: 'desktop.jpg', breakpoint: 'md', sources: [], links: [] },
        ]);

        expect(result.sources.map((source) => source.srcSet)).toEqual(['phone.jpg', 'desktop.jpg']);
    });
});
