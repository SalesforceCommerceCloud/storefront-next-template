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
import { breakpointWidthPx, maxWidthBelowQuery, minWidthQuery } from '@/lib/theme/breakpoints';
import type { PictureLink, PictureSource } from '@/components/picture';

/**
 * One image of an art-directed set. It serves viewports from `breakpoint` (a theme breakpoint name such as `md`) up
 * to the next entry's breakpoint. An entry without a breakpoint serves the smallest viewports.
 */
export interface ArtDirectedImageSource {
    src: string;
    breakpoint?: string;
}

interface ResolvedRendition {
    breakpoint?: string;
    sources: PictureSource[];
    links: PictureLink[];
    src: string;
}

const widthFloor = (entry: ArtDirectedImageSource) => (entry.breakpoint ? breakpointWidthPx(entry.breakpoint) : 0);

/** Orders entries from the smallest viewport to the largest so callers can pass them in any order. */
export function sortArtDirectedSources(entries: ArtDirectedImageSource[]): ArtDirectedImageSource[] {
    return [...entries].sort((a, b) => widthFloor(a) - widthFloor(b));
}

const allOf = (...queries: Array<string | undefined>) => queries.filter(Boolean).join(' and ');

/**
 * Combines the renditions of an art-directed image (ordered smallest viewport first) into one `<picture>` source list
 * plus the matching preload links. Every source and link is narrowed to the viewport range its rendition serves, so
 * the ranges never overlap: the browser downloads only the rendition it will paint, and, unlike `<source>` elements,
 * preload links do not stop at the first match, so each needs an exclusive range.
 *
 * A rendition that resolves to a bare URL (bundled asset, DIS off) is represented by that URL alone.
 */
export function scopeArtDirection(renditions: ResolvedRendition[]) {
    const scoped = renditions.map((rendition, index) => {
        const next = renditions[index + 1];
        const range = allOf(
            index > 0 && rendition.breakpoint ? minWidthQuery(rendition.breakpoint) : undefined,
            next?.breakpoint ? maxWidthBelowQuery(next.breakpoint) : undefined
        );
        const sources: PictureSource[] = (
            rendition.sources.length > 0 ? rendition.sources : [{ srcSet: rendition.src }]
        ).map((source) => ({ ...source, media: allOf(source.media, range) }));
        const links: PictureLink[] = (rendition.links.length > 0 ? rendition.links : [{ href: rendition.src }]).map(
            (link) => ({ ...link, media: allOf(link.media, range) })
        );
        return { sources, links };
    });

    return {
        sources: scoped.flatMap((rendition) => rendition.sources),
        links: scoped.flatMap((rendition) => rendition.links),
    };
}
