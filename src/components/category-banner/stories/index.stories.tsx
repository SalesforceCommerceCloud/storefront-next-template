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
import { waitForStorybookReady } from '@storybook/test-utils';
import CategoryBanner from '../index';

// ---------------------------------------------------------------------------
// Mock loader data
// The component reads route loader data via useRouteLoaderData(routeId).
// The Storybook memory router in preview.tsx supports `parameters.routeLoaderData`
// to inject ancestor-route data — each key is a route ID, value is the loader payload.
// ---------------------------------------------------------------------------

const PLP_ROUTE_ID = 'routes/_app.category.$categoryId';

const menCategory = {
    id: 'men',
    name: 'Men',
    parentCategoryTree: [{ id: 'root', name: 'Root' }],
    c_slotBannerImage: 'https://via.placeholder.com/1920x600/2d3748/ffffff?text=Men+Collection',
};

const suitsCategory = {
    id: 'mens-suits',
    name: 'Suits',
    parentCategoryTree: [
        { id: 'root', name: 'Root' },
        { id: 'men', name: 'Men' },
    ],
    image: 'https://via.placeholder.com/1920x600/1a365d/ffffff?text=Suits+Collection',
};

const womenCategory = {
    id: 'women',
    name: 'Women',
    parentCategoryTree: [{ id: 'root', name: 'Root' }],
    c_slotBannerImage: 'https://via.placeholder.com/1920x600/553c9a/ffffff?text=Women+Collection',
};

const noBannerCategory = {
    id: 'seasonal-specials',
    name: 'Seasonal Specials',
    parentCategoryTree: [{ id: 'root', name: 'Root' }],
};

const plpLoaderData = (category: object, total: number) => ({
    [PLP_ROUTE_ID]: { category, searchResultCritical: { total } },
});

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof CategoryBanner> = {
    title: 'Category/Category Banner',
    component: CategoryBanner,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Fallback banner for Product Listing Pages when no hero component is configured
in the \`plpTopFullWidth\` Page Designer region. Displays category name, product
count, and an optional background image sourced from the category's SCAPI data.

### Image resolution
- \`category.c_slotBannerImage\` — custom attribute with a full DIS URL
- \`category.image\` — standard category image, transformed via \`toImageUrl()\`
- \`bg-muted\` placeholder when no image is available

### Accessibility
The decorative image, category name and breadcrumb are \`aria-hidden\`. Only the product
count is exposed to assistive technology via an \`aria-live="polite"\` region.
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof CategoryBanner>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/**
 * Top-level category with c_slotBannerImage set.
 */
export const Default: Story = {
    parameters: {
        routeLoaderData: plpLoaderData(menCategory, 245),
        docs: {
            description: {
                story: 'Top-level category (Men) with 245 products. Image sourced from `c_slotBannerImage`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const canvas = within(canvasElement);

        const name = await canvas.findByText('Men', {}, { timeout: 5000 });
        expect(name).toBeInTheDocument();

        const count = await canvas.findByText('245 products available', {}, { timeout: 5000 });
        expect(count).toBeInTheDocument();
    },
};

/**
 * Subcategory with a root-category breadcrumb label and standard category image.
 */
export const SubCategory: Story = {
    parameters: {
        routeLoaderData: plpLoaderData(suitsCategory, 38),
        docs: {
            description: {
                story: 'Subcategory (Suits → Men). Image falls back to `category.image` since no `c_slotBannerImage` is set.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const canvas = within(canvasElement);

        const rootLabel = await canvas.findByText('Men', {}, { timeout: 5000 });
        expect(rootLabel).toBeInTheDocument();

        const categoryName = await canvas.findByText('Suits', {}, { timeout: 5000 });
        expect(categoryName).toBeInTheDocument();

        const count = await canvas.findByText('38 products available', {}, { timeout: 5000 });
        expect(count).toBeInTheDocument();
    },
};

/**
 * Singular product count — "1 product available" instead of "n products available".
 */
export const SingleProduct: Story = {
    parameters: {
        routeLoaderData: plpLoaderData(womenCategory, 1),
        docs: {
            description: {
                story: 'Edge case: exactly 1 product — renders the singular translation key.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const canvas = within(canvasElement);
        const count = await canvas.findByText('1 product available', {}, { timeout: 5000 });
        expect(count).toBeInTheDocument();
    },
};

/**
 * No category image configured — renders bg-muted placeholder.
 */
export const NoImage: Story = {
    parameters: {
        routeLoaderData: plpLoaderData(noBannerCategory, 7),
        docs: {
            description: {
                story: 'When no `c_slotBannerImage` or `category.image` is set, the banner shows a `bg-muted` placeholder background.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const canvas = within(canvasElement);
        const name = await canvas.findByText('Seasonal Specials', {}, { timeout: 5000 });
        expect(name).toBeInTheDocument();

        expect(canvasElement.querySelector('img')).not.toBeInTheDocument();
    },
};

/**
 * Rendered outside a PLP context — no route loader data is available.
 */
export const OutsidePLPContext: Story = {
    parameters: {
        docs: {
            description: {
                story: 'When placed outside a PLP (no route loader data), the banner renders without category name, product count, or image.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        expect(canvasElement.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
    },
};
