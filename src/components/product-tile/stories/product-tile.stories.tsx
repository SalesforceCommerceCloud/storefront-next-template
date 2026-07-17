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
import type { ShopperSearch } from '@/scapi';
import type { Meta, StoryObj } from '@storybook/react-vite';
import ProductTile from '../index';
import {
    mockProductSearchItem,
    mockMasterProductHitWithMultipleVariants,
    mockProductSetHit,
} from '../../__mocks__/product-search-hit-data';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import DynamicImageProvider from '@/providers/dynamic-image';
import { ProductTileProvider } from '../context';

const mockSite = mockSiteObject;

type SyntheticArgs = {
    productKind: 'standard' | 'master';
    productName: string;
    withSaleBadge: boolean;
    withNewBadge: boolean;
    withOverflow: boolean;
    withImages: boolean;
    withPromotion1: boolean;
    withPromotion2: boolean;
    withSaleListPrice: boolean;
};

const meta: Meta<typeof ProductTile> = {
    title: 'Products/Product Tile/Product Tile',
    component: ProductTile,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Product tile rendered in PLP grids and recommendation carousels. Shows ' +
                    'image, name, price, swatches, and optional pickup / quick-add / top-category ' +
                    'callouts. Use Playground to drive every common visual state via Controls; ' +
                    'the dedicated stories below cover fixture-shape variants Controls cannot ' +
                    'reach (sets, no product, out-of-stock).',
            },
        },
    },
    argTypes: {
        product: { table: { disable: true } },
        productId: { table: { disable: true } },
        handleProductClick: { table: { disable: true } },
        selectedVariantColorValue: { table: { disable: true } },
        imgAspectRatio: { table: { disable: true } },
        showNavigationArrows: { table: { disable: true } },
        regionId: { table: { disable: true } },
        component: { table: { disable: true } },
        componentData: { table: { disable: true } },
        designMetadata: { table: { disable: true } },
        data: { table: { disable: true } },
        className: { table: { disable: true } },
        ref: { table: { disable: true } },
        showPickupAvailable: {
            control: 'boolean',
            description: 'Show the pickup-available indicator below the price.',
        },
        quickAddLabel: {
            control: 'text',
            description: 'Text shown on the Quick Add button overlay. Empty hides the button.',
        },
        topCategoryName: {
            control: 'text',
            description: 'Top-category callout rendered above the product name (e.g. "Men").',
        },
        maxSwatches: {
            control: { type: 'number', min: 1, max: 10 },
            description: 'Maximum colour swatches before the "+N more" overflow indicator appears.',
        },
        objectFit: {
            control: 'inline-radio',
            options: ['contain', 'cover', 'fill', 'none', 'scale-down'],
            description: 'Page Designer styling: image object-fit.',
        },
        borderRadius: {
            control: 'select',
            options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'],
            description: 'Page Designer styling: tile corner rounding.',
        },
        boxShadow: {
            control: 'inline-radio',
            options: ['none', 'sm', 'md', 'lg', 'xl', '2xl'],
            description: 'Page Designer styling: tile drop shadow.',
        },
        padding: {
            control: 'inline-radio',
            options: ['0', '2', '4', '6', '8'],
            description: 'Page Designer styling: tile inner padding (Tailwind spacing scale).',
        },
        margin: {
            control: 'inline-radio',
            options: ['0', '2', '4', '6', '8'],
            description: 'Page Designer styling: tile outer margin.',
        },
        fontWeight: {
            control: 'inline-radio',
            options: ['normal', 'medium', 'semibold', 'bold'],
            description: 'Page Designer styling: text weight applied to the tile label.',
        },
        letterSpacing: {
            control: 'inline-radio',
            options: ['tighter', 'tight', 'normal', 'wide', 'wider'],
            description: 'Page Designer styling: letter-spacing applied to the tile label.',
        },
        hoverEffect: {
            control: 'inline-radio',
            options: ['default', 'scale', 'shadow', 'lift'],
            description: 'Page Designer styling: hover transition.',
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSite}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <DynamicImageProvider value={{ widths: ['50vw', '50vw', '15vw'] }}>
                        <ProductTileProvider>
                            <div className="w-64">
                                <Story />
                            </div>
                        </ProductTileProvider>
                    </DynamicImageProvider>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ProductTile>;
type StoryWithSynthetic = StoryObj<React.ComponentType<Parameters<typeof ProductTile>[0] & Partial<SyntheticArgs>>>;

/**
 * Default at-rest tile. No badges, no pickup, no quick add — the baseline a
 * tester sees with a plain orderable product.
 */
export const Default: Story = {
    args: {
        product: mockProductSearchItem,
    },
};

/**
 * Rich-but-realistic tile. The Controls panel exposes every common visual
 * toggle (pickup, quick-add, top-category, badges, swatches, overflow,
 * images, promotions, sale-vs-list price, long name) on a variation-master
 * fixture so a single bookmarkable URL reaches every additive on/off state.
 * Fixture-shape variants Controls cannot reach (sets, no product) remain
 * dedicated stories below.
 */
export const Playground: StoryWithSynthetic = {
    args: {
        showPickupAvailable: true,
        quickAddLabel: 'Quick Add',
        topCategoryName: 'Men',
        maxSwatches: 5,
        productKind: 'master',
        productName: mockMasterProductHitWithMultipleVariants.productName ?? '',
        withSaleBadge: false,
        withNewBadge: true,
        withOverflow: false,
        withImages: true,
        withPromotion1: false,
        withPromotion2: false,
        withSaleListPrice: false,
    },
    argTypes: {
        productKind: {
            control: 'inline-radio',
            options: ['standard', 'master'],
            description:
                'Synthetic: switches between a single-SKU standard product (no swatch row) ' +
                'and a variation master with colour swatches.',
            table: { category: 'Synthetic (data shape)' },
        },
        productName: {
            control: 'text',
            description:
                'Synthetic: product display name. Use a long string to verify the title wraps ' +
                'without overflowing the tile.',
            table: { category: 'Synthetic (data shape)' },
        },
        withSaleBadge: {
            control: 'boolean',
            description: 'Synthetic: applies the c_isSale flag and a "Get 20% off" promotion.',
            table: { category: 'Synthetic (data shape)' },
        },
        withNewBadge: {
            control: 'boolean',
            description: 'Synthetic: applies the c_isNew flag.',
            table: { category: 'Synthetic (data shape)' },
        },
        withOverflow: {
            control: 'boolean',
            description:
                'Synthetic: forces the swatch overflow indicator by inflating the colour ' +
                'list to 4 values and clamping maxSwatches to 3. Only takes effect when ' +
                'productKind is "master".',
            table: { category: 'Synthetic (data shape)' },
        },
        withImages: {
            control: 'boolean',
            description:
                'Synthetic: when off, strips image and imageGroups so the tile falls back to ' +
                'the placeholder treatment.',
            table: { category: 'Synthetic (data shape)' },
        },
        withPromotion1: {
            control: 'boolean',
            description:
                'Synthetic: adds a long promotional callout to the first variant. ' +
                'Combine with withPromotion2 to verify multi-line promo wrapping.',
            table: { category: 'Synthetic (data shape)' },
        },
        withPromotion2: {
            control: 'boolean',
            description:
                'Synthetic: adds a second promotional callout to the first variant. ' +
                'Combine with withPromotion1 to verify multi-line promo wrapping.',
            table: { category: 'Synthetic (data shape)' },
        },
        withSaleListPrice: {
            control: 'boolean',
            description:
                'Synthetic: adds list + sale tiered prices to the first variant so the tile ' +
                'renders the strikethrough list price + sale price treatment.',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const {
            productKind,
            productName,
            withSaleBadge,
            withNewBadge,
            withOverflow,
            withImages,
            withPromotion1,
            withPromotion2,
            withSaleListPrice,
            maxSwatches,
            ...componentProps
        } = args;
        const base = productKind === 'standard' ? mockProductSearchItem : mockMasterProductHitWithMultipleVariants;

        let product: ShopperSearch.schemas['ProductSearchHit'] = {
            ...base,
            productName: productName ?? base.productName,
            representedProduct: {
                ...base.representedProduct,
                c_isSale: withSaleBadge,
                c_isNew: withNewBadge,
            } as ShopperSearch.schemas['ProductRef'],
            ...(withSaleBadge
                ? {
                      promotions: [
                          {
                              promotionId: 'promo-sale',
                              calloutMsg: 'Get 20% off.',
                          },
                      ],
                  }
                : {}),
        };

        // Strip images so the tile falls back to its placeholder treatment.
        if (!withImages) {
            product = { ...product, image: undefined, imageGroups: [] };
        }

        // Inflate the colour list to 4 values so the rendered swatches exceed
        // the (clamped) maxSwatches and the "+N more" indicator appears.
        if (productKind === 'master' && withOverflow) {
            const colorAttr = product.variationAttributes?.find((attr) => attr.id === 'color');
            if (colorAttr?.values) {
                const inflated = [
                    ...colorAttr.values,
                    { name: 'Synthetic Blue', orderable: true, value: 'SYN_BLUE' },
                    { name: 'Synthetic Red', orderable: true, value: 'SYN_RED' },
                ];
                product = {
                    ...product,
                    variationAttributes: product.variationAttributes!.map((attr) =>
                        attr.id === 'color' ? { ...attr, values: inflated } : attr
                    ),
                };
            }
        }

        // Build the per-variant overrides driven by the promo / sale-price toggles.
        const productPromotions = [
            ...(withPromotion1
                ? [
                      {
                          calloutMsg: 'Buy 2 get 1 free on selected items — limited time offer, online only',
                          promotionalPrice: 127.99,
                          promotionId: 'promo-multi-1',
                      },
                  ]
                : []),
            ...(withPromotion2
                ? [
                      {
                          calloutMsg: 'Free shipping on orders over £50',
                          promotionalPrice: 191.99,
                          promotionId: 'promo-multi-2',
                      },
                  ]
                : []),
        ];

        const tieredPrices = withSaleListPrice
            ? [
                  { price: 320, pricebook: 'gbp-m-list-prices', quantity: 1 },
                  { price: 191.99, pricebook: 'gbp-m-sale-prices', quantity: 1 },
              ]
            : undefined;

        if ((productPromotions.length > 0 || tieredPrices) && product.variants?.[0]) {
            product = {
                ...product,
                ...(withSaleListPrice ? { price: 191.99 } : {}),
                variants: [
                    {
                        ...product.variants[0],
                        ...(productPromotions.length > 0 ? { productPromotions } : {}),
                        ...(tieredPrices ? { tieredPrices } : {}),
                    },
                    ...product.variants.slice(1),
                ],
            };
        }

        const effectiveMaxSwatches = productKind === 'master' && withOverflow ? 3 : maxSwatches;

        return (
            <ProductTile
                {...(componentProps as Parameters<typeof ProductTile>[0])}
                product={product}
                maxSwatches={effectiveMaxSwatches}
            />
        );
    },
};

/**
 * Empty state — the "Select a product" placeholder fallback rendered when no
 * product fixture is supplied (e.g. an unconfigured Page Designer slot).
 */
export const NoProduct: Story = {
    args: {
        product: undefined,
    },
};

/**
 * Set-typed product — renders a price *range* instead of a single price.
 * Different fixture shape, can't be reached from Controls.
 */
export const ProductSetWithPriceRange: Story = {
    args: {
        product: mockProductSetHit,
    },
};

/**
 * Out-of-stock product — current contract is that the tile renders
 * identically to an orderable one (no badge, no greyed-out price). The
 * dedicated snapshot acts as the regression check: if a future change
 * adds an out-of-stock badge or visual treatment, this snapshot will
 * diverge from `Default` and surface in review.
 */
export const OutOfStock: Story = {
    args: {
        product: {
            ...mockProductSearchItem,
            orderable: false,
            variants: mockProductSearchItem.variants?.map((v) => ({ ...v, orderable: false })),
        },
    },
};
