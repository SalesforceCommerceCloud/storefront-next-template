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
import ChildProductCard from '../child-product-card';
import { bundleProd } from '../../__mocks__/bundle-product';
import { setProduct } from '../../__mocks__/set-product';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import ProductViewProvider from '@/providers/product-view';
import { action } from 'storybook/actions';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const mockSite = mockSiteObject;

type ParentType = 'bundle' | 'set';

type SyntheticArgs = {
    parentType: ParentType;
};

type ParentResolution = {
    parent: typeof bundleProd;
    child: NonNullable<typeof bundleProd>;
};

const resolveParent = (parentType: ParentType): ParentResolution => {
    if (parentType === 'set') {
        const setChild = setProduct.setProducts?.[0];
        return { parent: setProduct, child: setChild as ParentResolution['child'] };
    }
    const bundleChild = bundleProd.bundledProducts?.[0]?.product;
    return { parent: bundleProd, child: bundleChild as ParentResolution['child'] };
};

const meta: Meta<typeof ChildProductCard> = {
    title: 'Products/Product View/Child Product Card',
    component: ChildProductCard,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
    argTypes: {
        childProduct: { table: { disable: true } },
        parentProduct: { table: { disable: true } },
        onSelectionChange: { table: { disable: true } },
        onOrderabilityChange: { table: { disable: true } },
        selectionSource: { table: { disable: true } },
    },
    decorators: [
        (Story, context) => {
            const parentType = ((context.args as Record<string, unknown>).parentType ?? 'bundle') as ParentType;
            const { parent } = resolveParent(parentType);
            return (
                <ConfigProvider config={mockConfig}>
                    <SiteProvider
                        site={mockSite}
                        locale={mockLocale}
                        language={mockSiteObject.defaultLocale}
                        currency={mockSiteObject.defaultCurrency}>
                        <ProductViewProvider product={parent} mode="add">
                            <div className="w-80">
                                <Story />
                            </div>
                        </ProductViewProvider>
                    </SiteProvider>
                </ConfigProvider>
            );
        },
    ],
};

export default meta;
type StoryWithSynthetic = StoryObj<
    React.ComponentType<Parameters<typeof ChildProductCard>[0] & Partial<SyntheticArgs>>
>;

/**
 * Single bookmarkable story for the child-product card. The synthetic
 * `parentType` toggle swaps the surrounding parent product between bundle
 * and set, which switches the notice copy, the per-child quantity picker
 * (set-only), and the "Add to Cart" button (set-only).
 */
export const Playground: StoryWithSynthetic = {
    args: {
        parentType: 'bundle',
        onSelectionChange: action('onSelectionChange'),
        onOrderabilityChange: action('onOrderabilityChange'),
    },
    argTypes: {
        parentType: {
            description: 'Synthetic: swap the parent ProductViewProvider between a bundle and a set fixture',
            control: 'inline-radio',
            options: ['bundle', 'set'] satisfies ParentType[],
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const { parentType, ...componentProps } = args;
        const { parent, child } = resolveParent(parentType ?? 'bundle');
        return (
            <ChildProductCard
                {...(componentProps as Parameters<typeof ChildProductCard>[0])}
                childProduct={child}
                parentProduct={parent}
            />
        );
    },
};
