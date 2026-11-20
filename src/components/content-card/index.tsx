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
import type { Image } from '@/types';

// oxlint-disable-next-line react/only-export-components -- Page Designer entry point re-exports the renderer alongside metadata
export { default, ContentCard } from '@/components/content-card/card';
export type { ContentCardProps, ContentCardLayout } from '@/components/content-card/card';

/* v8 ignore start - do not test decorators in unit tests, decorator functionality is tested separately*/
@Component('contentCard', {
    name: 'Content Card',
    description: 'Flexible card component with optional image, title, description, and call-to-action button',
    group: 'Content',
})
// oxlint-disable-next-line react/only-export-components -- Page Designer metadata is intentionally co-exported with its renderer
export class ContentCardMetadata {
    @AttributeDefinition()
    title?: string;

    // `values` must be an inline string-literal array: the cartridge metadata generator
    // (`sfnext cartridge:generate`) statically parses this decorator via ts-morph and cannot expand
    // a spread of an imported const (`[...CONTENT_CARD_TYPOGRAPHY_VALUES]`) — it emits the string
    // "...CONTENT_CARD_TYPOGRAPHY_VALUES" verbatim, yielding an invalid enum that SFCC rejects on
    // import (Content Card then never appears in the Page Designer palette). Keep this list in sync
    // with CONTENT_CARD_TYPOGRAPHY_VALUES in ./typography (the runtime source of truth).
    @AttributeDefinition({
        id: 'titleTypography',
        name: 'Title Typography',
        description: 'Visual typography for the title',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    titleTypography?: string;

    @AttributeDefinition()
    description?: string;

    // Inline literal — see the titleTypography note above (generator cannot expand a const spread).
    @AttributeDefinition({
        id: 'descriptionTypography',
        name: 'Description Typography',
        description: 'Visual typography for the description',
        type: 'enum',
        values: ['Default', 'Paragraph', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'],
        defaultValue: 'Default',
    })
    descriptionTypography?: string;

    @AttributeDefinition({ type: 'image' })
    imageUrl?: Image;

    @AttributeDefinition()
    imageAlt?: string;

    @AttributeDefinition()
    buttonText?: string;

    @AttributeDefinition({
        id: 'buttonLink',
        name: 'Button Link',
        type: 'url',
        required: false,
    })
    buttonLink?: string;

    @AttributeDefinition({ defaultValue: true })
    showBackground?: boolean;

    @AttributeDefinition({ defaultValue: true })
    showBorder?: boolean;
}
/* v8 ignore stop */
