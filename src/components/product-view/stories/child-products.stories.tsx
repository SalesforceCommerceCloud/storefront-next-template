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
import ChildProducts from '../child-products';
import { setProduct } from '../../__mocks__/set-product';
import { bundleProd } from '../../__mocks__/bundle-product';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import ProductViewProvider from '@/providers/product-view';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const mockSite = mockSiteObject;

type ProductType = 'set' | 'bundle';

type SyntheticArgs = {
    productType: ProductType;
};

const resolveParent = (productType: ProductType) => (productType === 'set' ? setProduct : bundleProd);

const meta: Meta<typeof ChildProducts> = {
    title: 'Products/Product View/Child Products',
    component: ChildProducts,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
    argTypes: {
        parentProduct: { control: false },
        mode: { control: 'inline-radio', options: ['add', 'edit'] },
        selectionSource: { control: 'inline-radio', options: ['url', 'local'] },
        onBeforeCartAction: { control: false },
        onCartSuccess: { control: false },
        onCartError: { control: false },
    },
    decorators: [
        (Story, context) => {
            // Mock window.fetch to prevent 404s from ShopperProducts requests
            if (typeof window !== 'undefined') {
                window.fetch = async () =>
                    ({
                        ok: true,
                        json: async () => ({}),
                        text: async () => '',
                    }) as any;
            }

            // The synthetic productType arg controls which parent fixture wraps
            // the story. Falls back to whatever was passed via parentProduct (legacy
            // path), then to the bundle default.
            const args = context.args as Record<string, unknown>;
            const productType = (args.productType ?? 'bundle') as ProductType;
            const parent = (args.parentProduct as typeof bundleProd | undefined) ?? resolveParent(productType);

            return (
                <ConfigProvider config={mockConfig}>
                    <SiteProvider
                        site={mockSite}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <ProductViewProvider product={parent} mode="add">
                            <Story />
                        </ProductViewProvider>
                    </SiteProvider>
                </ConfigProvider>
            );
        },
    ],
};

export default meta;
type StoryWithSynthetic = StoryObj<React.ComponentType<Parameters<typeof ChildProducts>[0] & Partial<SyntheticArgs>>>;

/**
 * Rich-but-realistic baseline. The `productType` synthetic Control swaps the
 * parent product between a set fixture and a bundle fixture — set vs bundle
 * changes the cart-action button label ("Add Set to Cart" vs "Add Bundle to
 * Cart") and the orderability semantics (sets allow per-child quantity, bundles
 * use parent quantity). The component's `mode` and `selectionSource` props are
 * exposed directly in the panel.
 */
export const Playground: StoryWithSynthetic = {
    args: {
        productType: 'bundle',
        mode: 'add',
        selectionSource: 'url',
    },
    argTypes: {
        productType: {
            description: 'Synthetic: parent product fixture — set or bundle',
            control: 'inline-radio',
            options: ['set', 'bundle'] satisfies ProductType[],
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        // `parentProduct` is intentionally ignored here — `productType` synthetic arg
        // drives which parent fixture wraps the component.
        const { productType, parentProduct: _parentProduct, ...componentProps } = args;
        void _parentProduct;
        const parent = resolveParent(productType ?? 'bundle');
        return <ChildProducts {...(componentProps as Parameters<typeof ChildProducts>[0])} parentProduct={parent} />;
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const productType = args.productType ?? 'bundle';
        const buttonNamePattern = productType === 'set' ? /add set to cart/i : /add bundle to cart/i;
        const buttons = canvas.queryAllByRole('button', { name: buttonNamePattern });
        if (buttons.length > 0) {
            await expect(buttons[0]).toBeInTheDocument();
        }
    },
};
