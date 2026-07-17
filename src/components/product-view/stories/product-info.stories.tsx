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
import { type ReactElement, useState } from 'react';

import { expect, within, userEvent, fn, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import type { ShopperProducts } from '@/scapi';
import ProductViewProvider from '@/providers/product-view';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { ProductInfo } from '../index';

type InventoryStatus = 'in-stock' | 'pre-order' | 'back-order' | 'out-of-stock';

type SyntheticArgs = {
    inventoryStatus: InventoryStatus;
    hasVariations: boolean;
    productName: string;
    shortDescription: string;
    brand: string;
};

const inventoryFixtures: Record<InventoryStatus, ShopperProducts.schemas['Inventory']> = {
    'in-stock': {
        id: 'inv-in-stock',
        ats: 50,
        orderable: true,
        backorderable: false,
        preorderable: false,
    },
    'pre-order': {
        id: 'inv-preorder',
        ats: 0,
        orderable: true,
        backorderable: false,
        preorderable: true,
    },
    'back-order': {
        id: 'inv-backorder',
        ats: 0,
        orderable: true,
        backorderable: true,
        preorderable: false,
    },
    'out-of-stock': {
        id: 'inv-out',
        ats: 0,
        orderable: false,
        backorderable: false,
        preorderable: false,
    },
};

const defaultVariationAttributes: ShopperProducts.schemas['Product']['variationAttributes'] = [
    {
        id: 'color',
        name: 'Color',
        values: [
            { value: 'red', name: 'Red', orderable: true },
            { value: 'blue', name: 'Blue', orderable: true },
            { value: 'green', name: 'Green', orderable: true },
        ],
    },
    {
        id: 'size',
        name: 'Size',
        values: [
            { value: 'S', name: 'Small', orderable: true },
            { value: 'M', name: 'Medium', orderable: true },
            { value: 'L', name: 'Large', orderable: true },
            { value: 'XL', name: 'Extra Large', orderable: true },
        ],
    },
];

const defaultImageGroups: ShopperProducts.schemas['Product']['imageGroups'] = [
    {
        viewType: 'swatch',
        variationAttributes: [{ id: 'color', values: [{ value: 'red', name: 'Red' }] }],
        images: [
            {
                link: 'https://placehold.co/50x50/ff0000/ffffff?text=R',
                disBaseLink: 'https://placehold.co/50x50/ff0000/ffffff?text=R',
                alt: 'Red swatch',
            },
        ],
    },
    {
        viewType: 'swatch',
        variationAttributes: [{ id: 'color', values: [{ value: 'blue', name: 'Blue' }] }],
        images: [
            {
                link: 'https://placehold.co/50x50/0000ff/ffffff?text=B',
                disBaseLink: 'https://placehold.co/50x50/0000ff/ffffff?text=B',
                alt: 'Blue swatch',
            },
        ],
    },
    {
        viewType: 'swatch',
        variationAttributes: [{ id: 'color', values: [{ value: 'green', name: 'Green' }] }],
        images: [
            {
                link: 'https://placehold.co/50x50/00ff00/ffffff?text=G',
                disBaseLink: 'https://placehold.co/50x50/00ff00/ffffff?text=G',
                alt: 'Green swatch',
            },
        ],
    },
];

// Helper function to create mock product. Accepts synthetic args (inventoryStatus,
// hasVariations, etc.) so the Playground story can drive fixture shape from
// the Controls panel. Keeps the legacy `overrides` escape hatch for dedicated
// stories that need bespoke shapes (e.g. WithDisabledVariants).
const createMockProduct = (
    synthetic: Partial<SyntheticArgs> = {},
    overrides?: Partial<ShopperProducts.schemas['Product']>
): ShopperProducts.schemas['Product'] => {
    const {
        inventoryStatus = 'in-stock',
        hasVariations = true,
        productName = 'Premium Cotton T-Shirt',
        shortDescription = 'Soft, breathable cotton t-shirt perfect for everyday wear',
        brand = '',
    } = synthetic;

    return {
        id: 'test-product-123',
        name: productName,
        shortDescription,
        brand: brand || undefined,
        price: 29.99,
        priceMax: 29.99,
        inventory: inventoryFixtures[inventoryStatus],
        variationAttributes: hasVariations ? defaultVariationAttributes : [],
        imageGroups: hasVariations ? defaultImageGroups : [],
        ...overrides,
    };
};

/**
 * The ProductInfo component displays comprehensive product details on the Product Detail Page (PDP).
 * It handles product variations, inventory status, pricing, and cart/wishlist actions.
 */
const meta: Meta<typeof ProductInfo> = {
    title: 'Products/Product View/Product Info',
    component: ProductInfo,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The Product Info component is the main information panel on the Product Detail Page (PDP).

**Features:**
- **Product Details**: Name, description, and pricing
- **Variation Selection**: Color swatches and size selectors
- **Inventory Status**: Real-time stock information with visual badges
- **Quantity Picker**: Adjustable quantity with stock validation
- **Action Buttons**: Add to cart and wishlist functionality
- **Product Types**: Supports standard products, variants, sets, and bundles

**Variation Handling:**
- URL-aware swatch selection
- Automatic variant detection
- Disabled state for out-of-stock variants

**Inventory States:**
- In Stock (green badge)
- Pre-Order (blue badge)
- Back Order (orange badge)
- Out of Stock (red badge)
                `,
            },
        },
        a11y: {
            config: {
                rules: [
                    // In isolated Storybook context, heading hierarchy is incomplete (h1 -> h3)
                    // Real PDP page provides proper h1/h2 context from page layout
                    { id: 'heading-order', enabled: false },
                ],
            },
        },
    },
    decorators: [
        (Story: React.ComponentType, context) => {
            const Wrapper = (): ReactElement => {
                const inRouter = useInRouterContext();
                const productArg = context.args.product ?? createMockProduct();
                const content = (
                    <ProductViewProvider product={productArg}>
                        <Story {...(context.args as Record<string, unknown>)} />
                    </ProductViewProvider>
                );
                // The global preview decorator (`withRouter(StoryShell)`)
                // already provides Config, Site, i18n, *and* a memory router —
                // so we shouldn't bring our own. Only fall back to a local
                // MemoryRouter for the snapshot harness, which doesn't apply
                // preview decorators uniformly. Wrap with Config + Site
                // alongside it so deep `<Link>` / `useConfig()` calls resolve.
                if (inRouter) {
                    return content;
                }

                const router = createMemoryRouter(
                    [
                        {
                            path: '/product/:productId',
                            element: (
                                <ConfigProvider config={mockConfig}>
                                    <SiteProvider
                                        site={mockSiteObject}
                                        locale={mockLocale}
                                        language={mockSiteObject.defaultLocale}
                                        currency={mockSiteObject.defaultCurrency}>
                                        {content}
                                    </SiteProvider>
                                </ConfigProvider>
                            ),
                        },
                    ],
                    { initialEntries: ['/product/test-product'] }
                );

                return <RouterProvider router={router} />;
            };

            return <Wrapper />;
        },
    ],
    argTypes: {
        product: {
            description: 'Product data including inventory, variations, and pricing',
            control: false,
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof ProductInfo>;
// Story type loose enough to accept synthetic Controls args alongside ProductInfo props.
type StoryWithSynthetic = StoryObj<React.ComponentType<Parameters<typeof ProductInfo>[0] & Partial<SyntheticArgs>>>;

/**
 * Rich-but-realistic baseline. Every additive prop and data-shape variation is
 * exposed in the Controls panel so a QA tester can flip individual options
 * without bookmarking dozens of stories. View-changing data states (out-of-stock
 * graying, controlled swatch mode, disabled variants) live as dedicated stories
 * below.
 */
export const Playground: StoryWithSynthetic = {
    args: {
        inventoryStatus: 'in-stock',
        hasVariations: true,
        productName: 'Premium Cotton T-Shirt',
        shortDescription: 'Soft, breathable cotton t-shirt perfect for everyday wear',
        brand: 'Salesforce Apparel',
        hideVariantSelection: false,
        variantStyle: 'full',
        showQuantityInEditMode: false,
        isVariantInventoryLoading: false,
        hideActionIcons: false,
        disableRatingInteraction: false,
    },
    argTypes: {
        inventoryStatus: {
            description: 'Synthetic: drives `product.inventory` shape',
            control: 'select',
            options: ['in-stock', 'pre-order', 'back-order', 'out-of-stock'] satisfies InventoryStatus[],
            table: { category: 'Synthetic (data shape)' },
        },
        hasVariations: {
            description: 'Synthetic: include color/size variation attributes',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
        productName: {
            description: 'Synthetic: product display name',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        shortDescription: {
            description: 'Synthetic: short description shown under the title',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        brand: {
            description: 'Synthetic: brand label (empty hides the row)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        hideVariantSelection: { control: 'boolean' },
        variantStyle: { control: 'inline-radio', options: ['full', 'compact'] },
        showQuantityInEditMode: { control: 'boolean' },
        isVariantInventoryLoading: { control: 'boolean' },
        hideActionIcons: { control: 'boolean' },
        disableRatingInteraction: { control: 'boolean' },
    },
    render: (args) => {
        const { inventoryStatus, hasVariations, productName, shortDescription, brand, ...componentProps } = args;
        const product = createMockProduct({
            inventoryStatus,
            hasVariations,
            productName,
            shortDescription,
            brand,
        });
        return <ProductInfo {...(componentProps as Parameters<typeof ProductInfo>[0])} product={product} />;
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Synthetic args drive the visible product name + brand — assert both render.
        const { productName, brand } = args as Partial<SyntheticArgs>;
        if (productName) {
            await expect(canvas.getByRole('heading', { name: productName })).toBeInTheDocument();
        }
        if (brand) {
            await expect(canvas.getByText(brand)).toBeInTheDocument();
        }

        // Action-icons row is visible by default; both buttons render.
        await expect(canvas.getByRole('button', { name: /add to wishlist|remove from wishlist/i })).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /share/i })).toBeInTheDocument();
    },
};

/**
 * Out-of-stock state — the component renders fundamentally differently:
 * inventory badge flips to "Out of Stock", quantity picker disables, and the
 * delivery options block is suppressed entirely. Worth a dedicated bookmarkable
 * URL for QA review.
 */
export const OutOfStockStatus: Story = {
    args: {
        product: createMockProduct({ inventoryStatus: 'out-of-stock' }),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Multiple elements may have "out of stock" text, use getAllByText
        const badges = canvas.getAllByText(/out of stock/i);
        await expect(badges.length).toBeGreaterThan(0);
    },
};

/**
 * One swatch value flagged `orderable: false` — exercises the disabled-swatch
 * rendering path. The variation data shape isn't a single boolean toggle, so
 * this stays as a dedicated fixture rather than a Controls toggle.
 */
export const WithDisabledVariants: Story = {
    args: {
        product: createMockProduct(
            {},
            {
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Color',
                        values: [
                            { value: 'red', name: 'Red', orderable: true },
                            { value: 'blue', name: 'Blue', orderable: true },
                            { value: 'green', name: 'Green', orderable: false },
                        ],
                    },
                    {
                        id: 'size',
                        name: 'Size',
                        values: [
                            { value: 'S', name: 'Small', orderable: true },
                            { value: 'M', name: 'Medium', orderable: true },
                        ],
                    },
                ],
                // The component recomputes orderable from product.variants (see
                // isVariantValueOrderable in use-variation-attributes.ts), not from the
                // value-level orderable flag. Variants must be present for the green
                // swatch to actually render its disabled treatment.
                variants: [
                    { productId: 'v-red-s', orderable: true, variationValues: { color: 'red', size: 'S' } },
                    { productId: 'v-red-m', orderable: true, variationValues: { color: 'red', size: 'M' } },
                    { productId: 'v-blue-s', orderable: true, variationValues: { color: 'blue', size: 'S' } },
                    { productId: 'v-blue-m', orderable: true, variationValues: { color: 'blue', size: 'M' } },
                    { productId: 'v-green-s', orderable: false, variationValues: { color: 'green', size: 'S' } },
                    { productId: 'v-green-m', orderable: false, variationValues: { color: 'green', size: 'M' } },
                ],
            }
        ),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // The component renders non-orderable swatches as <a> (NavLink) rather than
        // <button>, so toBeDisabled() doesn't apply. Assert the disabled visual treatment
        // via the strikethrough class (cursor-not-allowed) the cva variant adds.
        const greenSwatch = canvas.getByRole('radio', { name: /green/i });
        await expect(greenSwatch).toHaveClass('cursor-not-allowed');
        await expect(canvas.getByRole('radio', { name: /red/i })).toHaveClass('cursor-pointer');
    },
};

// Controlled-mode prop shape, derived from the component so it tracks any future
// change to ProductInfo's controlled API instead of being re-declared here.
type ControlledProps = Extract<Parameters<typeof ProductInfo>[0], { swatchMode: 'controlled' }>;

/**
 * Stateful host for the controlled swatch story. ProductInfo is a controlled
 * component in this mode: `aria-checked` is derived from the `variationValues`
 * prop, so it only moves if a parent owns that state and updates it on change.
 * We seed state from the story args, forward every change to the `onAttributeChange`
 * spy (so the play function can assert the callback contract), then advance the
 * selection so the UI reflects it.
 */
const ControlledSwatchHost = ({
    product,
    variationValues: initialValues,
    onAttributeChange,
}: Pick<ControlledProps, 'product' | 'variationValues' | 'onAttributeChange'>): ReactElement => {
    const [variationValues, setVariationValues] = useState(initialValues);
    return (
        <ProductInfo
            product={product}
            swatchMode="controlled"
            variationValues={variationValues}
            onAttributeChange={(attributeId, value) => {
                onAttributeChange(attributeId, value);
                setVariationValues((prev) => ({ ...prev, [attributeId]: value }));
            }}
        />
    );
};

/**
 * Controlled swatch mode — distinct prop API where the parent owns variation
 * state via `variationValues` and `onAttributeChange`. Different enough from
 * the default uncontrolled URL flow that it warrants a dedicated story rather
 * than a Controls boolean.
 *
 * Interaction: clicking a color swatch must (1) fire `onAttributeChange` with the
 * attribute id + value and (2) move `aria-checked` to the new swatch. Controlled
 * mode renders swatches as `role="radio"` buttons (no `href`), so the click is a
 * safe in-place selection — no URL navigation like uncontrolled mode.
 */
export const ControlledSwatchMode: Story = {
    args: {
        product: createMockProduct(),
        swatchMode: 'controlled',
        variationValues: {
            color: 'blue',
            size: 'M',
        },
        onAttributeChange: fn(),
    },
    render: (args) => (
        <ControlledSwatchHost
            product={args.product}
            variationValues={(args as ControlledProps).variationValues}
            onAttributeChange={(args as ControlledProps).onAttributeChange}
        />
    ),
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const onAttributeChange = (args as ControlledProps).onAttributeChange;

        // Seeded selection: Blue is checked, Red is not.
        const blueSwatch = canvas.getByRole('radio', { name: /blue/i });
        const redSwatch = canvas.getByRole('radio', { name: /red/i });
        await expect(blueSwatch).toHaveAttribute('aria-checked', 'true');
        await expect(redSwatch).toHaveAttribute('aria-checked', 'false');

        // Select Red → callback fires with (attributeId, value).
        await userEvent.click(redSwatch);
        await expect(onAttributeChange).toHaveBeenCalledWith('color', 'red');

        // Selection moves: Red becomes checked, Blue clears.
        await waitFor(async () => {
            await expect(canvas.getByRole('radio', { name: /red/i })).toHaveAttribute('aria-checked', 'true');
            await expect(canvas.getByRole('radio', { name: /blue/i })).toHaveAttribute('aria-checked', 'false');
        });
    },
};
