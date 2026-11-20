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
import { Component } from '@/lib/decorators/component';
import { AttributeDefinition } from '@/lib/decorators/attribute-definition';
import { RegionDefinition } from '@/lib/decorators';

export { default } from '@/components/hero/hero';

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('hero', {
    name: 'Hero Banner',
    description:
        'Prominent banner with image, title, subtitle, and call-to-action. Title and subtitle support typography presets, optional hex colors, and overlay placement. Button Style sets the CTA appearance. If CTA Link is empty, the button is not shown. Overlay Position places the content block; Overlay Alignment sets text alignment.',
    group: 'Content',
})
@RegionDefinition([])
export class HeroMetadata {
    @AttributeDefinition()
    title?: string;

    @AttributeDefinition({
        id: 'titleTypography',
        name: 'Title Typography',
        description: 'Visual typography for the title',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    titleTypography?: string;

    @AttributeDefinition({
        id: 'titleColor',
        name: 'Title Color',
        description: 'Hex color for the title (e.g. #FFFFFF or #fff)',
        type: 'string',
        required: false,
    })
    titleColor?: string;

    @AttributeDefinition({
        type: 'image',
    })
    imageUrl?: string;

    @AttributeDefinition()
    imageAlt?: string;

    @AttributeDefinition()
    imageTitle?: string;

    @AttributeDefinition()
    subtitle?: string;

    @AttributeDefinition({
        id: 'subtitleTypography',
        name: 'Subtitle Typography',
        description: 'Visual typography for the subtitle',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    subtitleTypography?: string;

    @AttributeDefinition({
        id: 'subtitleColor',
        name: 'Subtitle Color',
        description: 'Hex color for the subtitle (e.g. #FFFFFF or #fff)',
        type: 'string',
        required: false,
    })
    subtitleColor?: string;

    @AttributeDefinition()
    ctaText?: string;

    @AttributeDefinition({
        id: 'ctaLink',
        name: 'CTA Link',
        type: 'url',
        required: false,
    })
    ctaLink?: string;

    @AttributeDefinition({
        id: 'ctaAriaLabel',
        name: 'CTA Accessible Name',
        description:
            'Accessible name for the CTA link, read by screen readers instead of the visible button text. Use when the button text is generic (e.g. "Shop Now") and does not by itself describe the link\'s destination. Leave blank to use the title and button text together.',
        type: 'text',
        required: false,
    })
    ctaAriaLabel?: string;

    @AttributeDefinition({
        id: 'buttonStyle',
        name: 'Button Style',
        type: 'enum',
        values: ['Primary', 'Secondary', 'Tertiary'],
        defaultValue: 'Primary',
    })
    buttonStyle?: string;

    @AttributeDefinition({
        id: 'overlayPosition',
        name: 'Overlay Position',
        description: 'Placement of the content block within the hero',
        type: 'enum',
        values: [
            'Top Left',
            'Top Center',
            'Top Right',
            'Middle Left',
            'Middle Center',
            'Middle Right',
            'Bottom Left',
            'Bottom Center',
            'Bottom Right',
        ],
        defaultValue: 'Middle Center',
    })
    overlayPosition?: string;

    @AttributeDefinition({
        id: 'overlayAlignment',
        name: 'Overlay Alignment',
        description: 'Text alignment for title, subtitle, and call-to-action',
        type: 'enum',
        values: ['left', 'center', 'right'],
        defaultValue: 'center',
    })
    overlayAlignment?: string;

    @AttributeDefinition({
        id: 'height',
        name: 'Height',
        description: 'Height of the hero banner',
        type: 'enum',
        values: ['sm', 'md', 'lg', 'xl', 'full'],
        defaultValue: 'full',
    })
    height?: string;

    @AttributeDefinition({
        id: 'overlay',
        name: 'Overlay',
        description:
            'Gradient scrim behind the text to keep overlay copy legible on busy imagery. None shows no scrim; Dark/Light darken/lighten the image.',
        type: 'enum',
        values: ['None', 'Light', 'Dark'],
        defaultValue: 'None',
    })
    overlay?: string;

    @AttributeDefinition({
        id: 'styleOverride',
        name: 'Style Override',
        description:
            'CSS fragment scoped to this hero instance. Use & as the root selector — it maps to this hero element via CSS nesting and is automatically scoped with a unique attribute at render time. Supports any valid CSS including pseudo-classes, descendant selectors, and CSS custom properties (e.g. var(--primary)). Example: & { border-radius: var(--radius-xl); } & [data-slot="button"]:hover { transform: scale(1.05); }',
        type: 'text',
        required: false,
    })
    styleOverride?: string;
}
/* v8 ignore stop */
