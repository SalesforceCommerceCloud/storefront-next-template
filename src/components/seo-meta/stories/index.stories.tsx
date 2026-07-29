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
import { SeoMeta } from '../index';

const meta: Meta<typeof SeoMeta> = {
    title: 'Core/SEO/SEO Meta',
    component: SeoMeta,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Renders SEO `<title>`, `<meta>`, Open Graph, and X (Twitter) Card tags using React 19 document metadata hoisting. Tags are automatically hoisted to `<head>` and deduplicated, and work with streaming/Suspense. Non-visual: nothing renders in the canvas — inspect the document `<head>` (or read the autodocs) to see the emitted tags. Behavior is exhaustively covered by `index.test.tsx` (28 unit tests).',
            },
        },
    },
    argTypes: {
        title: { control: 'text', description: 'Page title. Gets ` | {siteName}` appended unless `rawTitle` is set.' },
        rawTitle: { control: 'boolean', description: 'Render `title` verbatim, without the site-name suffix.' },
        description: { control: 'text', description: 'Meta description.' },
        noIndex: { control: 'boolean', description: 'Emit `<meta name="robots" content="noindex">`.' },
        siteName: {
            control: 'text',
            description: 'Override the title-suffix site name (defaults to the localized site name).',
        },
        twitter: {
            control: 'object',
            description:
                'X (Twitter) Card metadata `{ cardType, image }`. Omit to skip Card tags (unless `openGraph` is set, which auto-derives them).',
        },
        openGraph: {
            control: 'object',
            description:
                'Open Graph metadata `{ type, url, image }` for social sharing. When set without `twitter`, X Card tags are auto-derived from these values.',
        },
    },
    decorators: [
        (Story) => (
            <div className="p-4 border rounded-none">
                <p className="text-sm text-muted-foreground mb-2">
                    Meta tags are rendered in the document head (not visible here)
                </p>
                <Story />
                <p className="text-sm text-muted-foreground mt-2">
                    Check the browser dev tools to inspect the meta tags
                </p>
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof SeoMeta>;

export const Default: Story = {
    args: {
        title: 'Classic Leather Jacket',
        description: 'Premium leather jacket with a tailored fit.',
    },
};

export const RawTitle: Story = {
    args: {
        rawTitle: true,
        title: 'NextGen PWA Kit Store',
        description: 'Your one-stop shop for premium products.',
    },
};

export const NoIndex: Story = {
    args: {
        title: 'Order History',
        description: 'View your past orders and order status.',
        noIndex: true,
    },
};

export const WithTwitterCard: Story = {
    args: {
        title: 'New Arrivals',
        description: 'Check out our latest collection.',
        twitter: {
            cardType: 'summary_large_image',
            image: 'https://via.placeholder.com/1200x630',
        },
    },
};

/**
 * Open Graph metadata for a product page. With `openGraph` set and no explicit `twitter` prop,
 * the X (Twitter) Card tags are auto-derived (`summary_large_image` because an image is present).
 * Documents the social-sharing path — inspect the document head for `og:*` and `twitter:*` tags.
 */
export const WithOpenGraph: Story = {
    args: {
        title: 'Classic Leather Jacket',
        description: 'Premium leather jacket with a tailored fit.',
        openGraph: {
            type: 'product',
            url: 'https://store.example.com/product/classic-leather-jacket',
            image: 'https://via.placeholder.com/1200x630',
        },
    },
};

export const CustomSiteName: Story = {
    args: {
        title: 'About Us',
        description: 'Learn more about our company.',
        siteName: 'Custom Store Name',
    },
};

export const TitleOnly: Story = {
    args: {
        title: 'Contact Us',
    },
};

export const SiteNameOnly: Story = {
    args: {},
};
