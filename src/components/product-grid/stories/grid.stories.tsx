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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { ComponentType } from 'react';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperSearch } from '@/scapi';
import ProductGrid from '../grid';

const { t } = getTranslation();
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { WishlistProvider } from '@/providers/wishlist';
import { EMPTY_WISHLIST_STATE } from '@/lib/wishlist/state';
import {
    mockProductSearchItem,
    mockStandardProductHit,
    mockMasterProductHitWithOneVariant,
    mockMasterProductHitWithMultipleVariants,
    mockProductSetHit,
} from '@/components/__mocks__/product-search-hit-data';

// ---------------------------------------------------------------------------
// ProductGrid renders a 2/3/4-column responsive grid of product tiles. Visible
// state is driven by:
//   - the lengths of `critical` / `nonCritical` (and the mix of hit types)
//   - `hasRefinementsPanel` (toggles responsive image widths)
//   - `isLoading` (replaces grid with skeleton)
//   - `skeletonCount` (appends pending-tile skeletons after the hits)
//   - `topCategoryName`, `showPickupAvailable` (forwarded to each tile)
// All variation in the prior story set folds into Controls; the empty-state
// and loading-state visuals are kept as dedicated stories because the empty
// "no products found" message and the skeleton-only render are bookmarkable.
// ---------------------------------------------------------------------------

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

function cloneHit(base: ProductSearchHit, overrides: Partial<ProductSearchHit> = {}): ProductSearchHit {
    return {
        ...base,
        ...overrides,
    } as ProductSearchHit;
}

const ALL_PRODUCTS: ProductSearchHit[] = Array.from({ length: 24 }).map((_, idx) => {
    const bases = [
        mockStandardProductHit,
        mockMasterProductHitWithOneVariant,
        mockMasterProductHitWithMultipleVariants,
        mockProductSearchItem,
        mockProductSetHit,
    ];
    const base = bases[idx % bases.length];
    return cloneHit(base, {
        productId: `PROD-${idx + 1}`,
        productName: `Product ${idx + 1}`,
        price: (base.price ?? 50) + (idx % 5) * 3,
    });
});
const MAX_PRODUCTS = ALL_PRODUCTS.length;

const meta: Meta<typeof ProductGrid> = {
    title: 'PRODUCTS/Product Grid',
    component: ProductGrid,
    tags: ['autodocs', 'interaction', 'chromatic-core'],
    parameters: {
        docs: {
            description: {
                component:
                    'Responsive 2/3/4-column grid of product tiles. Splits hits into a critical (eager-loading, high-priority images) prefix and a non-critical remainder. Supports loading skeletons, an empty-state message, and a BOPIS pickup-availability flag. Image widths and hydration scope are controlled by `hasRefinementsPanel`.',
            },
        },
    },
    decorators: [
        (Story: ComponentType) => (
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <WishlistProvider initialState={EMPTY_WISHLIST_STATE}>
                    <div className="section-container py-8 bg-background">
                        <Story />
                    </div>
                </WishlistProvider>
            </SiteProvider>
        ),
    ],
};

export default meta;

type SyntheticArgs = {
    criticalCount: number;
    nonCriticalCount: number;
    hasRefinementsPanel: boolean;
    topCategoryName: string;
    skeletonCount: number;
    showPickupAvailable: boolean;
};

/**
 * Rich-but-realistic baseline — 2 critical + 6 non-critical product tiles
 * with refinements panel enabled (default merchant config). Use Controls to
 * slice either bucket independently (0–24 each), toggle the refinements
 * layout, append loading skeletons after the hits, or flip the BOPIS pickup
 * flag.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        criticalCount: 2,
        nonCriticalCount: 6,
        hasRefinementsPanel: true,
        topCategoryName: '',
        skeletonCount: 0,
        showPickupAvailable: false,
    },
    argTypes: {
        criticalCount: {
            description: `Synthetic: number of critical (above-the-fold, high-priority image) tiles (0–${MAX_PRODUCTS}).`,
            control: { type: 'number', min: 0, max: MAX_PRODUCTS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        nonCriticalCount: {
            description: `Synthetic: number of non-critical (below-the-fold) tiles appended after the critical ones (0–${MAX_PRODUCTS}).`,
            control: { type: 'number', min: 0, max: MAX_PRODUCTS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        hasRefinementsPanel: {
            description:
                'Direct prop: when true (default), the grid uses tighter responsive image widths to leave room for a refinements sidebar at lg/xl breakpoints. When false, tiles use a wider responsive image range.',
            control: 'boolean',
        },
        topCategoryName: {
            description:
                'Direct prop: forwarded to every tile for analytics / breadcrumb context (e.g. "Mens" or "Womens"). Empty by default.',
            control: 'text',
        },
        skeletonCount: {
            description:
                'Direct prop: number of extra tile skeletons rendered after the hits (e.g. while a fetch for additional pages is in flight). 0 = no skeletons.',
            control: { type: 'number', min: 0, max: 8, step: 1 },
        },
        showPickupAvailable: {
            description:
                'Direct prop (BOPIS extension): when true, each tile shows a "Pickup available" indicator. Defaults to whatever the URL `pickup` query param indicates.',
            control: 'boolean',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            criticalCount: args.criticalCount ?? 0,
            nonCriticalCount: args.nonCriticalCount ?? 0,
            hasRefinementsPanel: args.hasRefinementsPanel ?? true,
            topCategoryName: args.topCategoryName ?? '',
            skeletonCount: args.skeletonCount ?? 0,
            showPickupAvailable: args.showPickupAvailable ?? false,
        };
        const clampedCritical = Math.max(0, Math.min(synthetic.criticalCount, MAX_PRODUCTS));
        const clampedNonCritical = Math.max(0, Math.min(synthetic.nonCriticalCount, MAX_PRODUCTS - clampedCritical));
        const critical = ALL_PRODUCTS.slice(0, clampedCritical);
        const nonCritical = ALL_PRODUCTS.slice(clampedCritical, clampedCritical + clampedNonCritical);
        return (
            <ProductGrid
                critical={critical}
                nonCritical={nonCritical}
                hasRefinementsPanel={synthetic.hasRefinementsPanel}
                topCategoryName={synthetic.topCategoryName || undefined}
                skeletonCount={synthetic.skeletonCount}
                showPickupAvailable={synthetic.showPickupAvailable}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const productLinks = canvas.queryAllByRole('link', { name: /product/i });
        await expect(productLinks.length).toBeGreaterThan(0);
    },
};

/**
 * Empty `critical` and `nonCritical` arrays. The grid renders a single
 * "no products found" message inside the column-spanning empty cell. Worth a
 * bookmarkable URL because the resulting visual is fundamentally different
 * (no tiles, just one centered message).
 */
export const EmptyState: StoryObj<typeof ProductGrid> = {
    args: {
        critical: [],
        nonCritical: [],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const emptyMessage = canvasElement.querySelector('p');
        await expect(emptyMessage).toHaveTextContent(t('common:noProductsFound'));
    },
};

/**
 * BOPIS pickup availability. With `showPickupAvailable`, the grid forwards the
 * flag to every tile, each of which renders a "pickup available" indicator.
 * Worth a dedicated story (rather than only the Controls toggle) because it
 * pins the contract that the flag reaches all tiles — the play asserts one
 * indicator per rendered tile.
 */
export const WithPickupAvailable: StoryObj<typeof ProductGrid> = {
    args: {
        critical: ALL_PRODUCTS.slice(0, 4),
        nonCritical: [],
        showPickupAvailable: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Four critical tiles → four pickup-available indicators, one per tile.
        // This count already confirms the flag reached every rendered tile, so an
        // additional product-link count would be redundant — and brittle: each tile
        // renders several `/product/i`-matching links (the "View {name}" overlay, the
        // name heading, and lazy-loaded swatch links), so the total is not 1:1 with
        // tiles at the composed grid level.
        const indicators = canvasElement.querySelectorAll('[data-testid="pickup-available-indicator"]');
        await expect(indicators.length).toBe(4);
    },
};

/**
 * `isLoading=true` short-circuits the grid render and shows a fixed-count
 * skeleton block instead. Worth a dedicated story because the loading layout
 * (no tiles, no empty message — only skeletons) is fundamentally different
 * from any populated grid state and is the canonical entry point for the
 * `data-testid="product-grid-loading-state"` selector that LCP / a11y tests
 * rely on.
 */
export const Loading: StoryObj<typeof ProductGrid> = {
    args: {
        critical: ALL_PRODUCTS.slice(0, 2),
        nonCritical: ALL_PRODUCTS.slice(2, 8),
        isLoading: true,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const loadingState = canvasElement.querySelector('[data-testid="product-grid-loading-state"]');
        await expect(loadingState).toBeInTheDocument();
        await expect(loadingState).toHaveAttribute('aria-busy');
    },
};
