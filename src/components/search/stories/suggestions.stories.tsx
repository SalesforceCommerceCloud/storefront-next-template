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
import Suggestions from '../suggestions';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { SearchSuggestions } from '../types';

// ---------------------------------------------------------------------------
// Suggestions branches on its inputs:
//   - if searchSuggestions has at least one of categories/products/popular →
//     renders SuggestionSection
//   - else → renders RecentSearches
// Visible state is driven by the counts in each suggestion bucket and the
// recent-searches list. All of those fold cleanly into Controls. Callbacks
// (closeAndNavigate, clearRecentSearches) bind to `action()` directly via
// component props.
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = [
    { name: 'Footwear', link: '/category/footwear', type: 'category' },
    { name: 'Outerwear', link: '/category/outerwear', type: 'category' },
    { name: 'Accessories', link: '/category/accessories', type: 'category' },
];
const ALL_PRODUCTS = [
    {
        name: 'Running Shoes',
        link: '/products/running-shoes',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
        price: 99.99,
    },
    {
        name: 'Hiking Boots',
        link: '/products/hiking-boots',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
        price: 149.99,
    },
    {
        name: 'Casual Sneakers',
        link: '/products/casual-sneakers',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
        price: 79.99,
    },
];
const ALL_POPULAR = [
    { name: 'Shoes', link: '/search?q=shoes', type: 'popular' },
    { name: 'Boots', link: '/search?q=boots', type: 'popular' },
    { name: 'Sneakers', link: '/search?q=sneakers', type: 'popular' },
];
const ALL_RECENT = ['shoes', 'boots', 'sneakers', 'jackets', 'bags'];

const meta: Meta<typeof Suggestions> = {
    title: 'Search/Suggestions',
    component: Suggestions,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Search dropdown that branches between a populated suggestion section (categories, products, popular searches) and a recent-searches list.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    decorators: [
        (Story: ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <Story />
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

type SyntheticArgs = {
    categoryCount: number;
    productCount: number;
    popularCount: number;
    recentCount: number;
};

/**
 * Rich-but-realistic baseline — populated suggestion section with all three
 * buckets (categories + products + popular). Use Controls to slice each
 * bucket independently or zero them all out to fall through to the
 * recent-searches branch.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        categoryCount: 3,
        productCount: 3,
        popularCount: 3,
        recentCount: 3,
    },
    argTypes: {
        categoryCount: {
            description: `Synthetic: number of category suggestions (0–${ALL_CATEGORIES.length}).`,
            control: { type: 'number', min: 0, max: ALL_CATEGORIES.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        productCount: {
            description: `Synthetic: number of product suggestions (0–${ALL_PRODUCTS.length}).`,
            control: { type: 'number', min: 0, max: ALL_PRODUCTS.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        popularCount: {
            description: `Synthetic: number of popular-search suggestions (0–${ALL_POPULAR.length}).`,
            control: { type: 'number', min: 0, max: ALL_POPULAR.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        recentCount: {
            description: `Synthetic: number of recent searches (0–${ALL_RECENT.length}). Only renders when all three suggestion buckets are empty.`,
            control: { type: 'number', min: 0, max: ALL_RECENT.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            categoryCount: args.categoryCount ?? 0,
            productCount: args.productCount ?? 0,
            popularCount: args.popularCount ?? 0,
            recentCount: args.recentCount ?? 0,
        };
        const categories = ALL_CATEGORIES.slice(0, synthetic.categoryCount);
        const products = ALL_PRODUCTS.slice(0, synthetic.productCount);
        const popular = ALL_POPULAR.slice(0, synthetic.popularCount);
        const recents = ALL_RECENT.slice(0, synthetic.recentCount);
        const hasAnySuggestion = categories.length || products.length || popular.length;
        const searchSuggestions: SearchSuggestions | null = hasAnySuggestion
            ? {
                  ...(categories.length ? { categorySuggestions: categories } : {}),
                  ...(products.length ? { productSuggestions: products } : {}),
                  ...(popular.length ? { popularSearchSuggestions: popular } : {}),
              }
            : null;
        return (
            <Suggestions
                searchSuggestions={searchSuggestions}
                recentSearches={recents}
                closeAndNavigate={action('closeAndNavigate')}
                clearRecentSearches={action('clearRecentSearches')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const categoriesLabels = await canvas.findAllByText(/categories/i, {}, { timeout: 5000 });
        await expect(categoriesLabels.length).toBeGreaterThan(0);
    },
};

/**
 * No suggestions and no recent searches. Branch falls through to the
 * RecentSearches component which renders an empty-state message. Worth a
 * bookmarkable URL because the visible content is fundamentally different
 * (just the empty-state copy, no lists).
 */
export const Empty: Story = {
    args: {
        searchSuggestions: null,
        recentSearches: [],
        closeAndNavigate: action('closeAndNavigate'),
        clearRecentSearches: action('clearRecentSearches'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const container = canvasElement.firstChild;
        await expect(container).toBeInTheDocument();
    },
};
