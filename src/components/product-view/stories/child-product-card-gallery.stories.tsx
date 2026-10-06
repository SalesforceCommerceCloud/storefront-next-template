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
import ChildProductCardGallery from '../child-product-card-gallery';
import { setProduct } from '@/components/__mocks__/set-product';

const childProduct = setProduct.setProducts?.[0];
const images = (childProduct?.imageGroups?.find(({ viewType }) => viewType === 'large')?.images ?? []).map((image) => ({
    src: image.disBaseLink ?? image.link ?? '',
    alt: image.alt,
    thumbSrc: image.disBaseLink ?? image.link ?? '',
}));

const meta: Meta<typeof ChildProductCardGallery> = {
    title: 'Products/Product View/Child Product Card Gallery',
    component: ChildProductCardGallery,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Deferred gallery for product-set and bundle child cards.',
            },
        },
    },
    argTypes: {
        images: { table: { disable: true } },
        productName: { table: { disable: true } },
        widths: { table: { disable: true } },
    },
    args: {
        images,
        productName: childProduct?.name,
        widths: {
            main: { base: 360, md: 420 },
            thumbnail: { base: 80, md: 96 },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ChildProductCardGallery>;

export const Default: Story = {};
