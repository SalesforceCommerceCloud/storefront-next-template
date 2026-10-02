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

import type { FilterValue } from './types';

/** Buttons the filter bar always shows (Brand, Size, Price, Color); each opens its row in the filters drawer. */
export const FILTER_BAR_FACETS: Array<{ label: string; attributeId: string }> = [
    { label: 'Brand', attributeId: 'brand' },
    { label: 'Size', attributeId: 'c_size' },
    { label: 'Price', attributeId: 'price' },
    { label: 'Color', attributeId: 'c_refinementColor' },
];

export interface StaticFacet {
    attributeId: string;
    label: string;
    values: FilterValue[];
}

// No hit counts: the placeholders are not backed by real search data, so no badge is shown.
const values = (...labels: string[]): FilterValue[] =>
    labels.map((label) => ({ label, value: label }) as unknown as FilterValue);

/**
 * Placeholder facets for the filters drawer, used only while the search result carries no refinements of its
 * own (the category has no Search Refinement Definitions in Business Manager yet). They are display-only: the
 * selection is kept in the drawer and does not filter products. Real refinements replace them automatically.
 */
export const STATIC_FACETS: StaticFacet[] = [
    { attributeId: 'gender', label: 'Gender', values: values('Women', 'Men', 'Girls', 'Boys', 'Unisex') },
    {
        attributeId: 'product_type',
        label: 'Product Type',
        values: values('T-Shirts', 'Shirts', 'Sweaters', 'Jackets', 'Jeans', 'Dresses', 'Shoes', 'Accessories'),
    },
    { attributeId: 'c_size', label: 'Size', values: values('XS', 'S', 'M', 'L', 'XL', 'XXL') },
    {
        attributeId: 'c_refinementColor',
        label: 'Color',
        values: values('Black', 'White', 'Blue', 'Red', 'Green', 'Beige', 'Gray', 'Brown', 'Pink', 'Navy'),
    },
    { attributeId: 'brand', label: 'Brand', values: values('Mavi', 'Adidas', 'Nike', 'Puma', 'Zara', 'Levi’s') },
    { attributeId: 'sale', label: 'Sale', values: values('On sale', 'Clearance', 'New markdown') },
    {
        attributeId: 'price',
        label: 'Price',
        values: values('Under $25', '$25 – $50', '$50 – $100', '$100 – $200', 'Over $200'),
    },
    { attributeId: 'occasion', label: 'Occasion', values: values('Casual', 'Work', 'Party', 'Sport', 'Beach') },
    { attributeId: 'length', label: 'Length', values: values('Short', 'Regular', 'Long') },
    {
        attributeId: 'sleeve_length',
        label: 'Sleeve Length',
        values: values('Sleeveless', 'Short sleeve', '3/4 sleeve', 'Long sleeve'),
    },
    { attributeId: 'material', label: 'Material', values: values('Cotton', 'Polyester', 'Wool', 'Denim', 'Linen') },
    { attributeId: 'style', label: 'Style', values: values('Classic', 'Modern', 'Streetwear', 'Vintage') },
    { attributeId: 'discount', label: 'Discount', values: values('10% off or more', '25% off or more', '50% off or more') },
    { attributeId: 'neck_style', label: 'Neck Style', values: values('Crew neck', 'V-neck', 'Polo', 'Turtleneck', 'Hooded') },
    { attributeId: 'rise', label: 'Rise', values: values('Low', 'Mid', 'High') },
    { attributeId: 'fabric_care', label: 'Fabric Care', values: values('Machine washable', 'Hand wash', 'Dry clean') },
    { attributeId: 'fit', label: 'Fit', values: values('Slim', 'Regular', 'Relaxed', 'Oversized') },
    { attributeId: 'feature', label: 'Feature', values: values('Pockets', 'Stretch', 'Breathable', 'Water resistant') },
    { attributeId: 'activity', label: 'Activity', values: values('Running', 'Training', 'Yoga', 'Hiking', 'Lifestyle') },
    { attributeId: 'closure', label: 'Closure', values: values('Zipper', 'Button', 'Pullover', 'Drawstring') },
    { attributeId: 'support_level', label: 'Support Level', values: values('Light', 'Medium', 'High') },
];
