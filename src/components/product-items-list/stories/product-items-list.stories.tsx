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
import ProductItemsList from '../index';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import type { EnrichedProductItem } from '@/lib/product/product-utils';

// ---------------------------------------------------------------------------
// ProductItemsList renders a stack of basket line items with optional
// primary/secondary action render-props per item, two display variants, and
// a few BOPIS / cart-presentation flags. Visible state is fully a function
// of `productItems` length, `variant`, the action render-props, and the
// `separateCards` / `isPickup` toggles. All variation between the prior 4
// stories collapses into Controls; the empty-list boundary is kept as a
// dedicated story.
// ---------------------------------------------------------------------------

type BasketItem = ShopperBasketsV2.schemas['ProductItem'];
type Product = ShopperProducts.schemas['Product'];

const ALL_BASKET_ITEMS: BasketItem[] = Array.from({ length: 10 }).map((_, idx) => ({
    itemId: `item-${idx + 1}`,
    productId: mockStandardProductOrderable.product.id,
    quantity: (idx % 3) + 1,
    price: 99.99,
    productName: `${mockStandardProductOrderable.product.name ?? 'Product'} ${idx + 1}`,
    priceAfterItemDiscount: 99.99,
    image: {
        alt: `Product ${idx + 1} Image`,
        url: 'https://via.placeholder.com/150',
    },
})) as unknown as BasketItem[];
const MAX_ITEMS = ALL_BASKET_ITEMS.length;

const ALL_PRODUCTS_BY_ITEM_ID: Record<string, Product> = ALL_BASKET_ITEMS.reduce(
    (acc, item) => {
        if (item.itemId) {
            acc[item.itemId] = mockStandardProductOrderable.product as unknown as Product;
        }
        return acc;
    },
    {} as Record<string, Product>
);

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logAction = action('interaction');
        const logAddToCart = action('add-to-cart');
        const logWishlist = action('wishlist');

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;

            const interactiveElement = target.closest('button, a, [role="button"]');
            if (interactiveElement && root.contains(interactiveElement)) {
                event.preventDefault();
                event.stopPropagation();
                const label = interactiveElement.textContent?.trim().substring(0, 50) || 'unlabeled';
                const tag = interactiveElement.tagName.toLowerCase();

                if (label.match(/add to cart/i)) {
                    logAddToCart({ label });
                } else if (label.match(/wishlist/i)) {
                    logWishlist({ label });
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

const meta: Meta<typeof ProductItemsList> = {
    title: 'Products/Product Items List',
    component: ProductItemsList,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Vertical list of basket line items used by cart and order-summary surfaces. Each item is rendered through `ProductItem` with optional primary/secondary action render-props. Supports a compact `summary` variant, a "separate cards" tile layout, and a BOPIS pickup flag.',
            },
        },
    },
    decorators: [
        (Story: ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <ActionLogger>
                        <div className="max-w-2xl mx-auto">
                            <Story />
                        </div>
                    </ActionLogger>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;

type SyntheticArgs = {
    itemCount: number;
    variant: 'default' | 'summary';
    showPrimaryAction: boolean;
    showSecondaryActions: boolean;
    separateCards: boolean;
    isPickup: boolean;
};

const renderPrimaryAction = (item: EnrichedProductItem) => (
    <button type="button" className="text-destructive" data-testid={`remove-${item.itemId}`}>
        Remove {item.itemId}
    </button>
);

const renderSecondaryActions = (_item: EnrichedProductItem) => (
    <button type="button" className="text-primary" data-testid="edit-item">
        Edit
    </button>
);

/**
 * Rich-but-realistic baseline — 2 basket items in default variant with no
 * action render-props. Use Controls to slice the canonical 10-item list,
 * switch to the compact `summary` layout, toggle primary/secondary action
 * buttons on/off, wrap each item in its own Card, or flip the BOPIS pickup
 * flag.
 */
export const FullyFeatured: StoryObj<ComponentType<Partial<SyntheticArgs>>> = {
    args: {
        itemCount: 2,
        variant: 'default',
        showPrimaryAction: false,
        showSecondaryActions: false,
        separateCards: false,
        isPickup: false,
    },
    argTypes: {
        itemCount: {
            description: `Synthetic: number of basket line items rendered (0–${MAX_ITEMS}). Setting to 0 collapses the list to an empty wrapper.`,
            control: { type: 'number', min: 0, max: MAX_ITEMS, step: 1 },
            table: { category: 'Synthetic (data shape)' },
        },
        variant: {
            description:
                'Direct prop: `default` shows full product cards with images and quantity controls; `summary` shows a compact list (used in order summary / mini-cart contexts).',
            control: { type: 'inline-radio' },
            options: ['default', 'summary'],
        },
        showPrimaryAction: {
            description:
                'Synthetic: when on, attaches a `primaryAction` render-prop that renders a "Remove <itemId>" button per line.',
            control: 'boolean',
            table: { category: 'Synthetic (render-prop toggle)' },
        },
        showSecondaryActions: {
            description:
                'Synthetic: when on, attaches a `secondaryActions` render-prop that renders an "Edit" button per line.',
            control: 'boolean',
            table: { category: 'Synthetic (render-prop toggle)' },
        },
        separateCards: {
            description:
                'Direct prop: when true, each item is wrapped in its own Card instead of being separated by hairline dividers within a single stack.',
            control: 'boolean',
        },
        isPickup: {
            description:
                'Direct prop (BOPIS extension): marks every line as a pickup item, which affects per-line stock-level calculations.',
            control: 'boolean',
        },
    },
    render: (args) => {
        const synthetic: SyntheticArgs = {
            itemCount: args.itemCount ?? 0,
            variant: args.variant ?? 'default',
            showPrimaryAction: args.showPrimaryAction ?? false,
            showSecondaryActions: args.showSecondaryActions ?? false,
            separateCards: args.separateCards ?? false,
            isPickup: args.isPickup ?? false,
        };
        const clamped = Math.max(0, Math.min(synthetic.itemCount, MAX_ITEMS));
        const productItems = ALL_BASKET_ITEMS.slice(0, clamped);
        const productsByItemId = Object.fromEntries(
            productItems
                .filter((item) => item.itemId)
                .map((item) => [item.itemId!, ALL_PRODUCTS_BY_ITEM_ID[item.itemId!]])
        );
        return (
            <ProductItemsList
                productItems={productItems}
                productsByItemId={productsByItemId}
                variant={synthetic.variant}
                primaryAction={synthetic.showPrimaryAction ? renderPrimaryAction : undefined}
                secondaryActions={synthetic.showSecondaryActions ? renderSecondaryActions : undefined}
                separateCards={synthetic.separateCards}
                isPickup={synthetic.isPickup}
            />
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const items = canvas.queryAllByTestId(/sf-product-item-/);
        await expect(items.length).toBeGreaterThan(0);
    },
};

/**
 * Empty `productItems` array. The component renders an empty wrapper div
 * with no list items. Worth a bookmarkable URL because the resulting visual
 * (no items, no dividers, just an empty container) is fundamentally
 * different from any populated state, and validates that the wrapper still
 * mounts (so a parent layout doesn't collapse).
 */
export const Empty: StoryObj<typeof ProductItemsList> = {
    args: {
        productItems: [],
        productsByItemId: {},
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const items = canvas.queryAllByTestId(/sf-product-item-/);
        await expect(items).toHaveLength(0);
    },
};
