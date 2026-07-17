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
import SuggestionSection from '../suggestions-section';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { SearchSuggestions } from '../types';

// ---------------------------------------------------------------------------
// SuggestionSection is the populated branch of the search dropdown — it shows
// up to four sections (categories, products, popular searches, "did you
// mean") arranged differently on mobile vs. desktop. Visible state is fully
// a function of which buckets are populated. All four counts plus the
// did-you-mean toggle fold cleanly into Controls. `closeAndNavigate` binds to
// `action()` directly via component props.
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = [
    {
        name: 'Footwear',
        link: '/category/footwear',
        type: 'category',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop',
    },
    {
        name: 'Clothing',
        link: '/category/clothing',
        type: 'category',
    },
    {
        name: 'Accessories',
        link: '/category/accessories',
        type: 'category',
    },
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
        image: 'https://images.unsplash.com/photo-1608256246200-53bd35f3f44e?w=400&h=400&fit=crop',
        price: 149.99,
    },
    {
        name: 'Casual Sneakers',
        link: '/products/casual-sneakers',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=400&h=400&fit=crop',
        price: 79.99,
    },
];
const ALL_POPULAR = [
    { name: 'Shoes', link: '/search?q=shoes', type: 'popular' },
    { name: 'Boots', link: '/search?q=boots', type: 'popular' },
    { name: 'Sneakers', link: '/search?q=sneakers', type: 'popular' },
];

const meta: Meta<typeof SuggestionSection> = {
    title: 'Search/Suggestions Section',
    component: SuggestionSection,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Populated branch of the search dropdown. Renders up to four sections — categories, products, popular searches, and an optional "did you mean" phrase suggestion — arranged vertically on mobile and horizontally on desktop.',
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

type SyntheticArgs = {
    categoryCount: number;
    productCount: number;
    popularCount: number;
    showDidYouMean: boolean;
    searchPhrase: string;
};

/**
 * Rich-but-realistic baseline — all three buckets populated and a search
 * phrase set. Use Controls to slice each bucket independently or toggle the
 * "Did you mean?" phrase suggestion on/off.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        categoryCount: 2,
        productCount: 3,
        popularCount: 2,
        showDidYouMean: false,
        searchPhrase: 'shoes',
    },
    argTypes: {
        categoryCount: {
            description: `Synthetic: number of category suggestions (0–${ALL_CATEGORIES.length}).`,
            control: { type: 'number', min: 0, max: ALL_CATEGORIES.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        productCount: {
            description: `Synthetic: number of product suggestions (0–${ALL_PRODUCTS.length}). Drives both the desktop product grid and the mobile product list.`,
            control: { type: 'number', min: 0, max: ALL_PRODUCTS.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        popularCount: {
            description: `Synthetic: number of popular-search suggestions (0–${ALL_POPULAR.length}).`,
            control: { type: 'number', min: 0, max: ALL_POPULAR.length, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        showDidYouMean: {
            description:
                'Synthetic: when on, adds a non-exact-match `phraseSuggestions[0]` so the "Did you mean?" line renders above the lists.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        searchPhrase: {
            description: 'Direct prop: the search phrase used in the "Did you mean?" comparison and the View All link.',
            control: 'text',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            categoryCount: args.categoryCount ?? 0,
            productCount: args.productCount ?? 0,
            popularCount: args.popularCount ?? 0,
            showDidYouMean: args.showDidYouMean ?? false,
            searchPhrase: args.searchPhrase ?? '',
        };
        const categories = ALL_CATEGORIES.slice(0, synthetic.categoryCount);
        const products = ALL_PRODUCTS.slice(0, synthetic.productCount);
        const popular = ALL_POPULAR.slice(0, synthetic.popularCount);
        const searchSuggestions: SearchSuggestions = {
            ...(categories.length ? { categorySuggestions: categories } : {}),
            ...(products.length ? { productSuggestions: products } : {}),
            ...(popular.length ? { popularSearchSuggestions: popular } : {}),
            ...(synthetic.showDidYouMean
                ? {
                      phraseSuggestions: [
                          {
                              name: synthetic.searchPhrase || 'shoes',
                              link: `/search?q=${synthetic.searchPhrase || 'shoes'}`,
                              type: 'phrase',
                              exactMatch: false,
                          },
                      ],
                  }
                : {}),
            searchPhrase: synthetic.searchPhrase,
        };
        return (
            <SuggestionSection searchSuggestions={searchSuggestions} closeAndNavigate={action('closeAndNavigate')} />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const labels = await canvas.findAllByText(/categories|products|popular searches/i, {}, { timeout: 5000 });
        await expect(labels.length).toBeGreaterThan(0);
    },
};
