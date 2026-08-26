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
import type { ShopperProducts } from '@/scapi';

type Category = ShopperProducts.schemas['Category'];

function category(data: Category): Category {
    const categories = data.categories?.map(category);

    return {
        c_showInMenu: true,
        ...data,
        categories,
        onlineSubCategoriesCount: categories?.length ?? data.onlineSubCategoriesCount ?? 0,
    };
}

export const mockMegaMenuRootCategory = category({
    id: 'root',
    name: 'Storefront Catalog',
    categories: [
        {
            id: 'womens',
            name: 'Women',
            c_headerMenuOrientation: 'horizontal',
            c_headerMenuBanner:
                '<img src="/images/hero-03.webp" alt="Women new arrivals" class="w-full rounded-md object-cover" />',
            categories: [
                {
                    id: 'womens-clothing',
                    name: 'Clothing',
                    categories: [
                        { id: 'womens-clothing-dresses', name: 'Dresses' },
                        { id: 'womens-clothing-tops', name: 'Tops' },
                        { id: 'womens-clothing-jackets', name: 'Jackets' },
                    ],
                },
                {
                    id: 'womens-shoes',
                    name: 'Shoes',
                    categories: [
                        { id: 'womens-shoes-sandals', name: 'Sandals' },
                        { id: 'womens-shoes-boots', name: 'Boots' },
                    ],
                },
                {
                    id: 'womens-accessories',
                    name: 'Accessories',
                    categories: [
                        { id: 'womens-accessories-handbags', name: 'Handbags' },
                        { id: 'womens-accessories-jewelry', name: 'Jewelry' },
                    ],
                },
            ],
        },
        {
            id: 'mens',
            name: 'Men',
            c_headerMenuOrientation: 'vertical',
            c_headerMenuBanner:
                '<img src="/images/hero-02.webp" alt="Men seasonal styles" class="w-full rounded-md object-cover" />',
            categories: [
                {
                    id: 'mens-clothing',
                    name: 'Clothing',
                    categories: [
                        { id: 'mens-clothing-shirts', name: 'Shirts' },
                        { id: 'mens-clothing-jackets', name: 'Jackets' },
                        { id: 'mens-clothing-suits', name: 'Suits' },
                    ],
                },
                {
                    id: 'mens-shoes',
                    name: 'Shoes',
                    categories: [
                        { id: 'mens-shoes-sneakers', name: 'Sneakers' },
                        { id: 'mens-shoes-dress', name: 'Dress Shoes' },
                    ],
                },
            ],
        },
        {
            id: 'accessories',
            name: 'Accessories',
            categories: [
                {
                    id: 'accessories-bags',
                    name: 'Bags',
                    categories: [
                        { id: 'accessories-bags-backpacks', name: 'Backpacks' },
                        { id: 'accessories-bags-totes', name: 'Totes' },
                    ],
                },
                {
                    id: 'accessories-gifts',
                    name: 'Gifts',
                    categories: [
                        { id: 'accessories-gifts-under-50', name: 'Gifts Under $50' },
                        { id: 'accessories-gifts-new-arrivals', name: 'New Arrivals' },
                    ],
                },
            ],
        },
    ],
});

// Production's `defer` promise resolves to a list of fully-hydrated depth-1 categories
// (each with their depth-2 children). The store keys those by `category.id` so
// `useSubCategory(womensId)` returns the Women node with its Clothing/Shoes/Accessories
// children populated. Mirror that shape here — flattening to depth-2 would key the
// store by the wrong ids and `MobileMenuCategory` would never see enriched data.
export const mockMegaMenuSubCategories = mockMegaMenuRootCategory.categories || [];
