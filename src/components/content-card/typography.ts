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
import { typographyVariants } from '@/components/typography';

/**
 * Page Designer typography presets for the Content Card title and description.
 * Mirrors the Hero component's value set so a merchant sees the same options
 * across both "Content" components. `Default` preserves each field's original
 * hardcoded look; the remaining presets derive from the shared
 * `typographyVariants` scale so there is a single source of truth for those
 * sizes.
 *
 * Kept in this sibling module (not the component file) so the component,
 * its metadata test, and its stories can share one definition without tripping
 * `react-refresh/only-export-components`.
 */
export const CONTENT_CARD_TYPOGRAPHY_VALUES = [
    'Default',
    'Paragraph',
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Heading 4',
    'Heading 5',
    'Heading 6',
] as const;

export type ContentCardTypography = (typeof CONTENT_CARD_TYPOGRAPHY_VALUES)[number];

/**
 * `align: null` opts out of the cva `align` default — ContentCard never sets
 * text-alignment on the title/description, so these presets must emit
 * size/weight only. `Default` is card-specific (no cva equivalent) and stays
 * local so untouched cards render exactly as before.
 */
export const TITLE_TYPOGRAPHY_CLASS: Record<ContentCardTypography, string> = {
    Default: 'text-2xl font-semibold leading-[120%] tracking-[-0.6px]',
    Paragraph: typographyVariants({ variant: 'body', align: null }),
    'Heading 1': typographyVariants({ variant: 'h1', align: null }),
    'Heading 2': typographyVariants({ variant: 'h2', align: null }),
    'Heading 3': typographyVariants({ variant: 'h3', align: null }),
    'Heading 4': typographyVariants({ variant: 'h4', align: null }),
    'Heading 5': typographyVariants({ variant: 'h5', align: null }),
    'Heading 6': typographyVariants({ variant: 'h6', align: null }),
};

export const DESCRIPTION_TYPOGRAPHY_CLASS: Record<ContentCardTypography, string> = {
    Default: 'text-sm font-normal leading-5',
    Paragraph: typographyVariants({ variant: 'body', align: null }),
    'Heading 1': typographyVariants({ variant: 'h1', align: null }),
    'Heading 2': typographyVariants({ variant: 'h2', align: null }),
    'Heading 3': typographyVariants({ variant: 'h3', align: null }),
    'Heading 4': typographyVariants({ variant: 'h4', align: null }),
    'Heading 5': typographyVariants({ variant: 'h5', align: null }),
    'Heading 6': typographyVariants({ variant: 'h6', align: null }),
};

export function normalizeTypography(value: string | undefined): ContentCardTypography {
    if (value && (CONTENT_CARD_TYPOGRAPHY_VALUES as readonly string[]).includes(value)) {
        return value as ContentCardTypography;
    }
    return 'Default';
}
