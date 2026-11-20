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
import { forwardRef, type ComponentProps } from 'react';
import { usePageDesignerMode } from '@salesforce/storefront-next-runtime/design/react/core';
import ContentCard, { type ContentCardProps } from '@/components/content-card/card';

export interface ImageBannerProps
    extends Omit<ComponentProps<'div'>, 'children'>,
        Pick<
            ContentCardProps,
            | 'imageUrl'
            | 'imageAlt'
            | 'loading'
            | 'imagePriority'
            | 'imageWidths'
            | 'regionId'
            | 'component'
            | 'componentData'
            | 'designMetadata'
            | 'data'
        > {
    /** Optional destination for the entire artwork. */
    linkUrl?: string;
    /** Defaults to the image's alternative text. */
    linkAriaLabel?: string;
    /** Optional disclosure supplied by the merchant, for example "Sponsored". */
    disclosure?: string;
}

/** Campaign artwork at its intrinsic aspect ratio, rendered through the shared Content Card. */
export const ImageBanner = forwardRef<HTMLDivElement, ImageBannerProps>(
    ({ imageUrl, imageAlt, linkUrl, linkAriaLabel, disclosure, imageWidths = ['100vw'], ...props }, ref) => {
        const { isDesignMode } = usePageDesignerMode();
        const hasImage = Boolean(typeof imageUrl === 'string' ? imageUrl.trim() : imageUrl?.url?.trim());
        if (!hasImage && !isDesignMode) return null;

        return (
            <ContentCard
                data-slot="image-banner"
                {...props}
                ref={ref}
                layout="image"
                imageAspectRatio={hasImage ? 'auto' : '16:9'}
                imageUrl={hasImage ? imageUrl : undefined}
                imageAlt={imageAlt}
                imageWidths={imageWidths}
                buttonLink={hasImage ? linkUrl : undefined}
                buttonAriaLabel={linkAriaLabel}
                badge={hasImage ? disclosure : undefined}
                showBackground={false}
                showBorder={false}
            />
        );
    }
);
ImageBanner.displayName = 'ImageBanner';
export default ImageBanner;
