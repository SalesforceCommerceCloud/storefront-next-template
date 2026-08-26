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

/**
 * Per-page UI configuration.
 *
 * The global app config (`config.server.ts`) is a single static module — it is
 * not resolved per build target and there is no merge layer, so a value placed
 * there is identical everywhere. This module is the override seam: the default
 * export below is the baseline, and a build target can shadow the whole module
 * with its own `lib/config.ui.ts` (resolved via the `@/` alias chain and
 * flattened at build time — same mechanism as `@/lib/fonts`).
 *
 * The shape intentionally mirrors the global config's `pages.*` tree so that if
 * an SDK-level config-override mechanism lands later, consumers can swap
 * `uiConfig.pages.cart.X` for `getConfig(context).pages.cart.X` with no other
 * change. Keep keys aligned with `config.server.ts`. Add new page sections here
 * as they need overridable UI flags.
 */
export interface UIConfig {
    pages: {
        cart: {
            /**
             * When true, the cart fetches and renders the below-the-fold
             * recommendation carousels. Gated in both the loader (skips the
             * Einstein calls when false) and the route render.
             *
             * @default true
             */
            showRecommendations: boolean;
            /**
             * When true, the cart line item (default variant) shows the
             * variation-attributes row (e.g. "Color: …", "Size: …").
             *
             * @default true
             */
            showLineItemVariantAttributes: boolean;
            /**
             * When true, the cart line item (default variant) shows the
             * strikethrough list price alongside the current price. When false,
             * only the current price renders (no list price, "From" prefix, or
             * inline `ProductPrice` promo callout). Note: this is the price
             * column's inline callout, NOT the separate "Saved $X" badge —
             * that is gated independently by `showLineItemPromoBadge`.
             *
             * @default true
             */
            showLineItemListPrice: boolean;
            /**
             * When true, the cart line item (default variant) shows the
             * "Saved $X" promotion badge in the price column.
             *
             * @default true
             */
            showLineItemPromoBadge: boolean;
            /**
             * When true, the cart line item (default variant) shows the
             * "Bonus Product" badge next to the title for bonus line items.
             *
             * @default true
             */
            showLineItemBonusBadge: boolean;
        };
        category: {
            /**
             * When true, the category page's QuickFilters renders a
             * "Shop by {label}" header (with a leading sparkles icon) before the
             * subcategory chips. The label is the active `cgid` refinement label.
             * The route computes the label and passes it to QuickFilters only
             * when this flag is on, so the chips-only baseline stays unchanged.
             *
             * @default false
             */
            showCategoryLabel: boolean;
            /**
             * How the product listing paginates its results.
             *
             * - `'load-more'`: a "Load more" button appends the next batch below the grid
             *   without a page reload.
             * - `'traditional'`: numbered previous/next pagination that navigates the URL
             *   `offset` and reloads the page.
             *
             * @default 'load-more'
             */
            pagination: PaginationConfig;
            /**
             * Opt-in: keep the category (`cgid`) refinement in the side-panel filters and
             * render it as a single-select radio group (`cgid` is single-valued per SCAPI),
             * instead of excluding it (the default,
             * where category navigation is owned by QuickFilters). When enabled, the category
             * route also suppresses the QuickFilters chip row so the same category level is not
             * filterable in two UIs at once. Used by verticals that surface a category level
             * (e.g. footwear "Shop by Activity") as a sidebar facet.
             *
             * @default undefined (cgid excluded from the sidebar — unchanged for all verticals)
             */
            sidebarCategoryRefinement?: {
                enabled: boolean;
            };
        };
        product: {
            /**
             * When true, the PDP rating summary (below the product description)
             * shows the numeric average and a "{count} reviews" label beside the
             * stars (e.g. "★★★★☆ 4.8 (124 reviews)"). When false, only the review
             * count in parentheses renders (e.g. "★★★★☆ (124)"). The average and
             * distribution are always available to the component; this only gates
             * the extra label, so the count-only baseline stays unchanged.
             *
             * @default false
             */
            showRatingAverage: boolean;
            /**
             * Variation-attribute ids that render as a grouped/tabbed selector on the PDP.
             * For a listed axis, each value's localized display name is treated as
             * "Label, Family" (comma-separated): the part before the first comma is the
             * SHORT label shown on the swatch, the part after it is the family. The PDP
             * then renders a family filter row (`["All", ...families]`) above the swatch
             * set and shows only the selected family's swatches. Image swatches still use
             * the `image` tile shape when the value carries a swatch image.
             *
             * Every axis NOT listed here renders exactly as today (full display name, no
             * split, no filter row), so this is backward-safe for every other axis and
             * vertical.
             *
             * @default undefined (no axis is grouped)
             */
            groupedSwatchAxes?: string[];
            /**
             * Variation-attribute ids whose image swatches render as larger "option cards" on the
             * PDP — a 4:3 image thumb stacked above the option name + price hint, all inside one
             * bordered, padded card (vs. the compact inline image tile). Only takes effect for a
             * listed axis that actually ships swatch imagery; every axis NOT listed keeps the compact
             * tile, so this is backward-safe for every other axis and vertical.
             *
             * @default undefined (no axis renders as option cards)
             */
            imageCardAxes?: string[];
            /**
             * When true, each variation-attribute swatch section on the PDP is wrapped in a
             * `<CollapsibleSection>` whose collapsed summary shows the selected value's thumbnail +
             * attribute label + selected value name. The section collapses after a value is selected
             * (remount on selection change). Off ⇒ sections render inline/expanded as today.
             *
             * @default false
             */
            collapsibleSwatchSections?: boolean;
            /**
             * PDP product-image gallery layout. `'stacked'` (default) = hero image + thumbnail
             * selector. `'mosaic'` = a flat 2-column grid of all images (index 0 + every `index % 3 === 0`
             * span both columns) — read by `product-view.tsx` and passed to `<ImageGallery layout>`.
             * Only affects the PDP gallery; non-PDP `ImageGallery` callers are unchanged.
             *
             * @default 'stacked'
             */
            galleryLayout?: 'stacked' | 'mosaic';
        };
    };
}

/**
 * Product-listing pagination behavior. `mode` selects the interaction; the batch sizes and
 * DOM cap only apply to `'load-more'`. Batch size falls back to the global
 * `config.search.products.hits.limit` (SCAPI page size) when a mode-specific value is omitted.
 */
export interface PaginationConfig {
    /** Pagination interaction mode. @default 'load-more' */
    mode: 'load-more' | 'traditional';
    /** Products fetched per "Load more" batch on desktop/tablet viewports. @default 24 */
    batchSize: number;
    /** Products fetched per "Load more" batch on mobile viewports (smaller for performance). @default 12 */
    mobileBatchSize: number;
    /**
     * Maximum number of products kept in the DOM before the "Load more" control is replaced with
     * a prompt to refine filters. Prevents DOM bloat / jank on low-end devices. @default 200
     */
    maxProducts: number;
}

export const uiConfig: UIConfig = {
    pages: {
        cart: {
            showRecommendations: true,
            showLineItemVariantAttributes: true,
            showLineItemListPrice: true,
            showLineItemPromoBadge: true,
            showLineItemBonusBadge: true,
        },
        category: {
            showCategoryLabel: false,
            pagination: {
                mode: 'load-more',
                batchSize: 24,
                mobileBatchSize: 12,
                maxProducts: 200,
            },
        },
        product: {
            showRatingAverage: false,
        },
    },
};
