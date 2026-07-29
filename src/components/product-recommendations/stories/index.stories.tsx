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
import { useState } from 'react';
import ProductRecommendations from '..';
import { ProductRecommendationSkeleton } from '@/components/product/skeletons';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';
import {
    mockStandardProductHit,
    mockMasterProductHitWithMultipleVariants,
    mockProductSearchItem,
} from '../../__mocks__/product-search-hit-data';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperSearch } from '@/scapi';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

// Six rich-but-realistic recommendation tiles. The component reads only the
// search-hit shape, so reusing existing mocks keeps tile rendering identical
// to ProductCarousel/ProductTile stories.
const RECOMMENDATION_FIXTURES: ProductSearchHit[] = [
    { ...mockStandardProductHit, productId: 'rec-1' },
    { ...mockMasterProductHitWithMultipleVariants, productId: 'rec-2' },
    { ...mockProductSearchItem, productId: 'rec-3' },
    { ...mockStandardProductHit, productId: 'rec-4' },
    { ...mockMasterProductHitWithMultipleVariants, productId: 'rec-5' },
    { ...mockProductSearchItem, productId: 'rec-6' },
];

type PlaygroundArgs = {
    recommenderTitle: string;
    recommenderSubtitle: string;
    shopAllText: string;
    productCount: number;
};

const meta: Meta<PlaygroundArgs> = {
    title: 'Products/Product Recommendations',
    component: ProductRecommendations,
    tags: ['autodocs'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
The ProductRecommendations component displays a single product recommendation carousel using Einstein.

**Two data paths:**
- Client-driven (default): the component calls \`useRecommenders\`, which fetches
  from \`/resource/recommendations\`. Used by Page Designer drops and ad-hoc
  client renders.
- Loader-driven (\`data\` prop): the component reads a pre-fetched
  \`Promise<Recommendation>\` and renders inside a \`<Suspense>\` boundary. Used
  by route loaders that pin the promise via \`useState(() => …)\` to avoid
  re-suspending across revalidations.

The story uses the loader-driven path with a pre-resolved promise so the
carousel renders without the BFF route, exercising the same code path
\`DeferredProductRecommendations\` consumes (see \`routes/_app.cart.tsx\`).
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <div className="p-8">
                        <Story />
                    </div>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
    argTypes: {
        recommenderTitle: {
            description: 'Carousel heading.',
            control: 'text',
            table: { category: 'Synthetic (rendered output)' },
        },
        recommenderSubtitle: {
            description: 'Optional subtitle below the heading. Empty string hides it.',
            control: 'text',
            table: { category: 'Synthetic (rendered output)' },
        },
        shopAllText: {
            description: 'Optional header link text. Empty string hides it.',
            control: 'text',
            table: { category: 'Synthetic (rendered output)' },
        },
        productCount: {
            description:
                'Number of recommendation tiles in the resolved data promise. 0 returns an empty `recs` array — the component renders nothing (returns null).',
            control: { type: 'range', min: 0, max: RECOMMENDATION_FIXTURES.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
    },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

/**
 * Controls-driven entry point. Toggle `productCount` to slice the recommendation
 * list (0 = component returns null), or edit the heading / subtitle / shop-all
 * inline. The story builds a resolved `Promise<Recommendation>` from search-hit
 * fixtures and feeds it through the `data` prop, exercising the same code path a
 * route loader would use in production.
 *
 * Snapshot opt-out: the component reads `data` through `<Await>` inside a
 * `<Suspense>` boundary, so the synchronous `render()` in the snapshot harness
 * captures the fallback (`null`) before the promise resolves. The "real" DOM
 * is covered by the dedicated Loading story (which renders the skeleton
 * synchronously) and by a11y, which awaits resolution. (Pattern 16 in the
 * audit playbook — opt out of snapshot when the story's primary rendering is
 * gated on async resolution that the snapshot harness can't await.)
 *
 * No play function: an interaction `play` here would either race the
 * suspension or assert presence-only against rendered DOM (Pattern 6
 * anti-pattern).
 */
// Wrapping the render body in a named (PascalCase) component lets it host a
// hook (the inline `render: () => …` arrow would trip
// `react-hooks/rules-of-hooks` because the linter doesn't recognize the arrow
// as a component).
function PlaygroundRender({ recommenderTitle, recommenderSubtitle, shopAllText, productCount }: PlaygroundArgs) {
    // Suspense tracks promises by identity — building a fresh promise inline on
    // every render would re-suspend the boundary forever. `useState(() => …)`
    // pins the promise to this component instance, exactly as the loader-driven
    // production path requires (see `deferred.tsx`'s Promise-stability note,
    // which pins the loader Promise at the route level via `useState(() => …)`).
    // `useMemo` is explicitly insufficient here — its cache is not a guaranteed
    // identity (React may drop it), per README-SUSPENSE.md's promise-identity
    // rule. The Playground `render` re-keys this component on
    // `productCount`/`recommenderTitle`, so changing either remounts it and
    // rebuilds the promise — no stale data, still a stable reference per mount.
    //
    // The `recommender.type` prop (`'recommender'` vs `'zone'`) is intentionally
    // not surfaced as a Control: it only changes which BFF helper the
    // client-driven `useRecommenders` path calls (`getRecommendations` vs
    // `getZoneRecommendations`), and this story uses the `data` prop path,
    // which bypasses both. Toggling it would produce no on-screen change —
    // see the Visible-Change Rule in the Storybook audit playbook.
    const [dataPromise] = useState<Promise<Recommendation>>(() =>
        Promise.resolve({
            recoUUID: 'storybook-reco-uuid',
            recommenderName: 'pdp-similar-items',
            displayMessage: recommenderTitle,
            recs: RECOMMENDATION_FIXTURES.slice(0, productCount),
        })
    );

    return (
        <ProductRecommendations
            recommender={{ name: 'pdp-similar-items', title: recommenderTitle, type: 'recommender' }}
            subtitle={recommenderSubtitle || undefined}
            shopAllText={shopAllText || undefined}
            data={dataPromise}
        />
    );
}

export const Playground: Story = {
    args: {
        recommenderTitle: 'You May Also Like',
        recommenderSubtitle: 'Hand-picked for you',
        shopAllText: 'Shop All',
        productCount: 4,
    },
    parameters: { snapshot: false },
    // Re-key on the args that feed the pinned promise so editing them remounts
    // PlaygroundRender (rebuilding the `useState` promise) rather than mutating
    // a live render — keeps Suspense's promise identity stable per mount.
    render: (args) => <PlaygroundRender key={`${args.productCount}:${args.recommenderTitle}`} {...args} />,
};

/**
 * Dedicated story for the loading-skeleton render path. The carousel uses
 * `ProductRecommendationSkeleton` while the `data` promise is pending or while
 * `useRecommenders` is in flight; capturing it in its own story gives us:
 *
 * - A bookmarkable URL for QA to inspect the skeleton in isolation.
 * - Real (non-null) snapshot coverage. Without this, the only DOM the snapshot
 *   suite saw for this component was an empty wrapper `<div class="p-8" />`,
 *   which catches no regressions.
 *
 * Renders the skeleton directly (the public component pivots on `data` /
 * `recommendation`; no skeleton-only escape hatch exists, but the skeleton is
 * already a public export and is what `index.tsx` mounts during the loading
 * state).
 */
export const Loading: Story = {
    render: () => (
        <div>
            <ProductRecommendationSkeleton title="You May Also Like" />
        </div>
    ),
    parameters: {
        docs: {
            description: {
                story: 'Skeleton rendered while a `data` promise is pending or `useRecommenders` is in flight.',
            },
        },
    },
};
