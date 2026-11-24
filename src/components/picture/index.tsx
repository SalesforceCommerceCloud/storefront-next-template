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
import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { isServer } from '@/lib/utils';

export interface PictureSource {
    type?: string;
    srcSet: string;
    sizes?: string;
    /** Media query that must match for the browser to pick this source. Omit for an unconditional source. */
    media?: string;
}

export interface PictureLink {
    href: string;
    srcSet?: string;
    sizes?: string;
    type?: string;
    media?: string;
}

interface PictureProps {
    /** Already-resolved `<source>` entries, in the order the browser should evaluate them (first match wins). */
    sources: PictureSource[];
    /** When set, each link is preloaded at high priority during SSR. Pass it only for the LCP image. */
    preloadLinks?: PictureLink[];
    /** The image element, also used by browsers when no source matches. */
    children: ReactNode;
}

/**
 * Renders a `<picture>` from pre-resolved sources, or just the image when there are none. It does no URL math: callers
 * decide the sources, so the same markup serves DIS-resolved responsive images and art-directed pairs alike. It also
 * owns the SSR preload hints, so the `<link rel="preload">` set always matches the `<source>` set it was derived from.
 */
export function Picture({ sources, preloadLinks, children }: PictureProps) {
    if (preloadLinks && isServer()) {
        for (const { href, srcSet, sizes, type, media } of preloadLinks) {
            preload(href, { as: 'image', fetchPriority: 'high', imageSrcSet: srcSet, imageSizes: sizes, type, media });
        }
    }

    if (sources.length === 0) {
        return <>{children}</>;
    }

    return (
        <picture>
            {sources.map(({ type, srcSet, sizes, media }) => (
                <source
                    key={`${media ?? ''}|${type ?? ''}|${srcSet}`}
                    type={type}
                    {...(media && { media })}
                    sizes={sizes}
                    srcSet={srcSet}
                />
            ))}
            {children}
        </picture>
    );
}
