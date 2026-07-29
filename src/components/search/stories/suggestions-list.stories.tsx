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
import SuggestionsList from '../suggestions-list';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { action } from 'storybook/actions';
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';

// ---------------------------------------------------------------------------
// SuggestionsList renders a vertical button list — one per `suggestion` —
// where each row optionally shows a circular image preview. Visible state is
// fully a function of (a) the suggestion type / count and (b) whether each
// entry has an `image` field. All three fold cleanly into Controls.
// `closeAndNavigate` binds to `action()` directly via component props. The
// empty case returns null — kept as a dedicated story.
// ---------------------------------------------------------------------------

const ALL_CATEGORY_SUGGESTIONS = [
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
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=100&h=100&fit=crop',
    },
    {
        name: 'Accessories',
        link: '/category/accessories',
        type: 'category',
        image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=100&h=100&fit=crop',
    },
    {
        name: 'Outerwear',
        link: '/category/outerwear',
        type: 'category',
        image: 'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=100&h=100&fit=crop',
    },
];
const ALL_PRODUCT_SUGGESTIONS = [
    {
        name: 'Running Shoes',
        link: '/products/running-shoes',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop',
    },
    {
        name: 'Hiking Boots',
        link: '/products/hiking-boots',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1608256246200-53bd35f3f44e?w=100&h=100&fit=crop',
    },
    {
        name: 'Casual Sneakers',
        link: '/products/casual-sneakers',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=100&h=100&fit=crop',
    },
    {
        name: 'Dress Shoes',
        link: '/products/dress-shoes',
        type: 'product',
        image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=100&h=100&fit=crop',
    },
];
const ALL_POPULAR_SUGGESTIONS = [
    { name: 'Shoes', link: '/search?q=shoes', type: 'popular' },
    { name: 'Boots', link: '/search?q=boots', type: 'popular' },
    { name: 'Jackets', link: '/search?q=jackets', type: 'popular' },
    { name: 'Bags', link: '/search?q=bags', type: 'popular' },
];

const SUGGESTION_LISTS: Record<'category' | 'product' | 'popular', typeof ALL_CATEGORY_SUGGESTIONS> = {
    category: ALL_CATEGORY_SUGGESTIONS,
    product: ALL_PRODUCT_SUGGESTIONS,
    popular: ALL_POPULAR_SUGGESTIONS as typeof ALL_CATEGORY_SUGGESTIONS,
};

const meta: Meta<typeof SuggestionsList> = {
    title: 'Search/Suggestions List',
    component: SuggestionsList,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Vertical list of search suggestions (categories, products, or popular searches). Each row is a button with an optional circular image preview to the left of the suggestion name.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    decorators: [
        (Story: ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
};

export default meta;

type SyntheticArgs = {
    suggestionType: 'category' | 'product' | 'popular';
    suggestionCount: number;
    showImages: boolean;
    searchPhrase: string;
    className: string;
};

/**
 * Rich-but-realistic baseline — 3 category suggestions with images. Use
 * Controls to switch between category / product / popular fixture sets,
 * adjust the count, or strip image fields.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        suggestionType: 'category',
        suggestionCount: 3,
        showImages: true,
        searchPhrase: '',
        className: '',
    },
    argTypes: {
        suggestionType: {
            description:
                'Synthetic: which canonical fixture list to render — categories (with images), products (with images), or popular searches (no images by default).',
            control: { type: 'inline-radio' },
            options: ['category', 'product', 'popular'],
            table: { category: 'Synthetic (data shape)' },
        },
        suggestionCount: {
            description: 'Synthetic: number of suggestion rows to render (0–4). Setting to 0 returns null.',
            control: { type: 'number', min: 0, max: 4, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        showImages: {
            description:
                'Synthetic: when off, strips the `image` field from each suggestion so the circular image slot is hidden.',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        searchPhrase: {
            description: 'Direct prop: the search phrase that triggered the list. Passed to analytics on click.',
            control: 'text',
        },
        className: {
            description: 'Direct prop: additional CSS classes applied to the outer wrapper.',
            control: 'text',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            suggestionType: args.suggestionType ?? 'category',
            suggestionCount: args.suggestionCount ?? 3,
            showImages: args.showImages ?? true,
            searchPhrase: args.searchPhrase ?? '',
            className: args.className ?? '',
        };
        const source = SUGGESTION_LISTS[synthetic.suggestionType];
        const clamped = Math.max(0, Math.min(synthetic.suggestionCount, source.length));
        const suggestions = source.slice(0, clamped).map((s) =>
            synthetic.showImages
                ? s
                : {
                      name: s.name,
                      link: s.link,
                      type: s.type,
                  }
        );
        return (
            <SuggestionsList
                suggestions={suggestions}
                searchPhrase={synthetic.searchPhrase}
                closeAndNavigate={action('closeAndNavigate')}
                className={synthetic.className || undefined}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const buttons = await canvas.findAllByRole('button', {}, { timeout: 5000 });
        await expect(buttons.length).toBeGreaterThan(0);
    },
};

/**
 * Empty `suggestions` makes the component return null. Worth a bookmarkable
 * URL so the null-render can be asserted explicitly.
 */
export const Empty: StoryObj<typeof SuggestionsList> = {
    args: {
        suggestions: [],
        closeAndNavigate: action('closeAndNavigate'),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const buttons = canvasElement.querySelectorAll('button');
        await expect(buttons.length).toBe(0);
    },
};
