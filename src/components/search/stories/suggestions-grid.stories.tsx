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
import SuggestionsGrid from '../suggestions-grid';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

// ---------------------------------------------------------------------------
// SuggestionsGrid renders a horizontal product grid in the search dropdown.
// Visible state is fully a function of (a) how many suggestions are present
// and (b) whether each entry has an `image` and/or `price` field. All three
// fold cleanly into Controls. `closeAndNavigate` binds to `action()` directly
// via component props. The empty case renders null — kept as a dedicated
// story so the null-render is bookmarkable.
// ---------------------------------------------------------------------------

const ALL_PRODUCTS = [
    {
        name: 'Running Shoes',
        link: '/products/running-shoes',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
        price: 99.99,
    },
    {
        name: 'Hiking Boots',
        link: '/products/hiking-boots',
        image: 'https://images.unsplash.com/photo-1608256246200-53bd35f3f44e?w=400&h=400&fit=crop',
        price: 149.99,
    },
    {
        name: 'Casual Sneakers',
        link: '/products/casual-sneakers',
        image: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=400&h=400&fit=crop',
        price: 79.99,
    },
    {
        name: 'Dress Shoes',
        link: '/products/dress-shoes',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop',
        price: 199.99,
    },
    {
        name: 'Sandals',
        link: '/products/sandals',
        image: 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=400&h=400&fit=crop',
        price: 49.99,
    },
];
const MAX_PRODUCTS = ALL_PRODUCTS.length;

const meta: Meta<typeof SuggestionsGrid> = {
    title: 'Search/Suggestions Grid',
    component: SuggestionsGrid,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Horizontal product grid used in the search-suggestions dropdown. Each tile shows image, name, and price; missing image/price fields fall back to a placeholder icon and a hidden price line.',
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
    productCount: number;
    showImages: boolean;
    showPrices: boolean;
    searchPhrase: string;
};

/**
 * Rich-but-realistic baseline — 3-tile grid with images and prices, mid-search.
 * Use Controls to adjust `productCount`, strip `image` or `price` fields, or
 * change the `searchPhrase` that's passed through to analytics.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        productCount: 3,
        showImages: true,
        showPrices: true,
        searchPhrase: 'shoes',
    },
    argTypes: {
        productCount: {
            description: `Synthetic: number of product tiles to render (0–${MAX_PRODUCTS}). Setting to 0 falls through to the null-render branch.`,
            control: { type: 'number', min: 0, max: MAX_PRODUCTS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        showImages: {
            description:
                'Synthetic: when off, strips the `image` field from each suggestion so tiles fall back to the ImageOff placeholder.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        showPrices: {
            description:
                'Synthetic: when off, strips the `price` field from each suggestion so the price line is hidden under each tile.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        searchPhrase: {
            description: 'Direct prop: the search phrase that triggered the suggestions. Passed to analytics on click.',
            control: 'text',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            productCount: args.productCount ?? 3,
            showImages: args.showImages ?? true,
            showPrices: args.showPrices ?? true,
            searchPhrase: args.searchPhrase ?? '',
        };
        const clamped = Math.max(0, Math.min(synthetic.productCount, MAX_PRODUCTS));
        const suggestions = ALL_PRODUCTS.slice(0, clamped).map((p) => ({
            name: p.name,
            link: p.link,
            ...(synthetic.showImages ? { image: p.image } : {}),
            ...(synthetic.showPrices ? { price: p.price } : {}),
        }));
        return (
            <SuggestionsGrid
                suggestions={suggestions}
                searchPhrase={synthetic.searchPhrase}
                closeAndNavigate={action('closeAndNavigate')}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const links = await canvas.findAllByRole('link', {}, { timeout: 5000 });
        await expect(links.length).toBeGreaterThan(0);
    },
};

/**
 * Empty `suggestions` makes the component return null. Worth a bookmarkable
 * URL so the null-render can be asserted explicitly.
 */
export const Empty: StoryObj<typeof SuggestionsGrid> = {
    args: {
        suggestions: [],
        closeAndNavigate: action('closeAndNavigate'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const links = canvasElement.querySelectorAll('a');
        await expect(links.length).toBe(0);
    },
};
