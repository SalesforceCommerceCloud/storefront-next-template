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
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import {
    mockMasterProductHitWithMultipleVariants,
    mockProductSearchItem,
    mockStandardProductHit,
} from '@/components/__mocks__/product-search-hit-data';
import { ProductMerchandisingGrid } from '../index';
import type { ShopperSearch } from '@/scapi';

type ProductSearchHit = ShopperSearch.schemas['ProductSearchHit'];

const products: ProductSearchHit[] = Array.from({ length: 24 }, (_, index) => {
    const base = [mockStandardProductHit, mockMasterProductHitWithMultipleVariants, mockProductSearchItem][index % 3];

    return {
        ...base,
        productId: `merchandising-grid-${index + 1}`,
        productName: `Featured product ${index + 1}`,
    } as ProductSearchHit;
});

const meta: Meta<typeof ProductMerchandisingGrid> = {
    title: 'Products/Product Merchandising Grid',
    component: ProductMerchandisingGrid,
    tags: ['autodocs'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'A bounded, category-backed assortment for landing pages and Page Designer. It deliberately omits PLP refinements and pagination.',
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
                    <Story />
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
    argTypes: {
        products: { table: { disable: true } },
        className: { table: { disable: true } },
        title: {
            control: 'text',
            description: 'Optional section heading. Empty hides it.',
        },
        shopAllText: {
            control: 'text',
            description: 'Optional call-to-action label. Empty hides the link.',
        },
        shopAllUrl: {
            control: 'text',
            description: 'Category destination used by the optional call-to-action.',
        },
        columns: {
            control: 'inline-radio',
            options: [2, 3, 4],
            description: 'Number of product columns at desktop widths.',
        },
        rows: {
            control: { type: 'range', min: 1, max: 6, step: 1 },
            description: 'Number of bounded merchandising rows to display.',
        },
    },
};

export default meta;
type Story = StoryObj<typeof ProductMerchandisingGrid>;

export const Playground: Story = {
    args: {
        products,
        columns: 4,
        rows: 2,
        title: 'Featured pieces',
        shopAllText: 'Shop all furniture',
        shopAllUrl: '/category/root',
    },
};
