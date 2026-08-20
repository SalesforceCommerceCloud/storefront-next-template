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
import ProductCarousel, { ProductCarouselWithSuspense } from '../carousel';
import { mockStandardProductHit } from '../../__mocks__/product-search-hit-data';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { expect, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import DynamicImageProvider from '@/providers/dynamic-image';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { PageDesignerProvider } from '@salesforce/storefront-next-runtime/design/react/core';

const mockSite = mockSiteObject;

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logAction = action('interaction');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;

            const interactiveElement = target.closest('button, a, [role="button"]');
            if (interactiveElement) {
                event.preventDefault();
                event.stopPropagation();
                const label = interactiveElement.textContent?.trim().substring(0, 50) || 'unlabeled';
                const tag = interactiveElement.tagName.toLowerCase();

                if (label.match(/add to cart/i)) {
                    action('add-to-cart')({ label });
                } else if (label.match(/wishlist/i)) {
                    action('wishlist')({ label });
                } else {
                    logAction({ type: 'click', tag, label });
                }
            }
        };

        root.addEventListener('click', handleClick, true);
        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof ProductCarousel> = {
    title: 'Products/Product Carousel/Carousel',
    component: ProductCarousel,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <ActionLogger>
                        <DynamicImageProvider value={{ widths: ['50vw', '50vw', '15vw'] }}>
                            <div className="p-8">
                                <Story />
                            </div>
                        </DynamicImageProvider>
                    </ActionLogger>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductCarousel>;

const products = Array(8)
    .fill(mockStandardProductHit)
    .map((p, i) => ({
        ...p,
        productId: `${p.productId}-${i}`,
        productName: `${p.productName} ${i + 1}`,
    }));

export const Default: Story = {
    args: {
        products,
        title: 'Featured Products',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Featured Products')).toBeInTheDocument();
        // Use getAllByRole('link') to find product tiles
        const items = canvas.getAllByRole('link');
        await expect(items.length).toBeGreaterThan(0);
    },
};

export const NoTitle: Story = {
    args: {
        products,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByText('Featured Products')).not.toBeInTheDocument();
    },
};

export const Empty: Story = {
    args: {
        products: [],
        title: 'Empty Carousel',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // On the live storefront (non-design mode) an unconfigured carousel renders nothing.
        await expect(canvas.queryByRole('heading', { name: 'Product' })).not.toBeInTheDocument();
    },
};

/**
 * W-23729825: a freshly-dropped, unconfigured Product Carousel as a merchant sees it in Page Designer
 * design mode (`mode="EDIT"`). Feeds empty `ProductTile` children through the real CarouselSection
 * render path, so each renders its own placeholder tile (image + default "Product" title). On the
 * live storefront an unconfigured carousel renders nothing (see the Empty story).
 */
export const UnconfiguredDesignMode: Story = {
    args: {
        products: [],
    },
    parameters: {
        // Design mode renders inside PageDesignerProvider's lazy Suspense provider, which resolves in
        // a live browser but suspends to a fallback in a synchronous snapshot render — so this story is
        // interaction-only and opts out of snapshotting.
        snapshot: false,
        docs: {
            description: {
                story: 'W-23729825: a freshly-dropped, unconfigured Product Carousel as a merchant sees it in Page Designer design mode. Feeds empty Product Tile children through the real carousel render path so each renders its own placeholder. On the live storefront an unconfigured carousel renders nothing.',
            },
        },
    },
    decorators: [
        (Story) => (
            <PageDesignerProvider clientId="storybook-product-carousel" targetOrigin="*" mode="EDIT">
                <Story />
            </PageDesignerProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The lazy DesignProvider resolves asynchronously — wait for the placeholder tiles to appear.
        await waitFor(async () => {
            await expect(canvas.getAllByRole('heading', { name: 'Product' }).length).toBeGreaterThan(0);
        });
        const placeholders = canvas.getAllByRole('heading', { name: 'Product' });
        await expect(placeholders.length).toBe(8);
    },
};

export const WithSuspenseWrapper: Story = {
    render: () => <ProductCarouselWithSuspense products={products} title="Suspense Wrapper" />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Suspense Wrapper')).toBeInTheDocument();
    },
};

export const PageDesignerMode: Story = {
    args: {
        products,
        title: 'Page Designer Carousel',
        component: {
            id: 'pd-carousel-1',
            typeId: 'Layout.productCarousel',
            regions: [],
        } as any,
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Page Designer Carousel')).toBeInTheDocument();
    },
};

export const WithSubtitle: Story = {
    args: {
        products,
        title: 'Trending Now',
        subtitle: 'Our most popular picks this week',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Trending Now')).toBeInTheDocument();
        await expect(canvas.getByText('Our most popular picks this week')).toBeInTheDocument();
    },
};

export const SingleProduct: Story = {
    args: {
        products: [products[0]],
        title: 'Just For You',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Just For You')).toBeInTheDocument();
    },
};

export const WithShopAllLink: Story = {
    args: {
        products,
        title: 'New Arrivals',
        shopAllText: 'Shop All',
        shopAllUrl: '/category/new-arrivals',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByText('New Arrivals')).toBeInTheDocument();
        await expect(canvas.getByText('Shop All')).toBeInTheDocument();
    },
};
