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
import { JsonLd } from '../index';

const meta: Meta<typeof JsonLd> = {
    title: 'Core/SEO/JSON-LD',
    component: JsonLd,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Injects schema.org structured data as a \`<script type="application/ld+json">\` tag for SEO and AI crawlers. Rendered server-side so crawlers see it in the initial HTML.

Non-visual: the script tag produces nothing on screen — inspect the page source (or read the autodocs) to see the emitted JSON-LD. Behavior (stringification, \`id\` handling, multiple scripts, invalid-data guards) is exhaustively covered by \`index.test.tsx\` (16 unit tests).

The two stories below mirror the only production call sites: the PDP (\`Product\` schema) and the PLP/category page (\`CollectionPage\` schema wrapping an \`ItemList\`).
                `,
            },
        },
    },
    argTypes: {
        data: {
            description: 'The schema.org structured-data object to inject (stringified to JSON).',
            control: 'object',
        },
        id: {
            description: 'Optional id for the script tag (used when a page emits multiple JSON-LD scripts).',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof JsonLd>;

/**
 * Product schema mirroring `generateProductSchema` output (PDP → `<JsonLd data={…} id="product-schema" />`).
 * Matches the real generator's shape: `sku` + `productID` (both the product id), a `url`, and an `offers`
 * object with `availability`, `itemCondition`, and a product `url`. The generator does NOT emit
 * `aggregateRating` in its base output (that only appears via custom JSON-LD metadata merging), so it's
 * omitted here.
 */
export const ProductSchema: Story = {
    args: {
        id: 'product-schema',
        data: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'Classic Leather Jacket',
            description: 'Premium full-grain leather jacket with a tailored fit.',
            image: 'https://via.placeholder.com/800',
            sku: 'classic-leather-jacket',
            productID: 'classic-leather-jacket',
            url: 'https://store.example.com/product/classic-leather-jacket',
            brand: {
                '@type': 'Brand',
                name: 'Example Brand',
            },
            offers: {
                '@type': 'Offer',
                price: '199.00',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
                itemCondition: 'https://schema.org/NewCondition',
                url: 'https://store.example.com/product/classic-leather-jacket',
            },
        },
    },
};

/**
 * Category/listing schema mirroring `generateCategorySchema` output (PLP / category page →
 * `<JsonLd data={…} id="category-schema" />`). Production emits a `CollectionPage` whose
 * `mainEntity` is the `ItemList` (with `numberOfItems` + `itemListElement`) — not a top-level
 * `ItemList` — so the fixture uses that wrapper shape.
 */
export const CategorySchema: Story = {
    args: {
        id: 'category-schema',
        data: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Electronics',
            description: 'Browse our selection of electronics products',
            url: 'https://store.example.com/category/electronics',
            mainEntity: {
                '@type': 'ItemList',
                numberOfItems: 3,
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        item: { '@type': 'Product', name: 'Wireless Headphones', url: '/products/wireless-headphones' },
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        item: { '@type': 'Product', name: 'Smart Watch', url: '/products/smart-watch' },
                    },
                    {
                        '@type': 'ListItem',
                        position: 3,
                        item: { '@type': 'Product', name: 'Bluetooth Speaker', url: '/products/bluetooth-speaker' },
                    },
                ],
            },
        },
    },
};
