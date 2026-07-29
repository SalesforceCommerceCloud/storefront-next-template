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
import { allModes } from '../../../../.storybook/modes';
import ProductAccordion from '../product-accordion';
import { mockStandardProductOrderable } from '../../__mocks__/standard-product';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

type SyntheticArgs = {
    longDescription: string;
    shortDescription: string;
    brand: string;
    manufacturerName: string;
    manufacturerSku: string;
    showCareInstructions: boolean;
};

const meta: Meta<typeof ProductAccordion> = {
    title: 'Products/Product View/Product Accordion',
    component: ProductAccordion,
    tags: ['autodocs', 'interaction'],
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'padded',
    },
    argTypes: {
        product: { control: false },
    },
};

export default meta;
type StoryWithSynthetic = StoryObj<
    React.ComponentType<Parameters<typeof ProductAccordion>[0] & Partial<SyntheticArgs>>
>;

/**
 * Rich-but-realistic baseline. Each product field that the accordion reads
 * (long description, short description, brand, manufacturer name, manufacturer
 * SKU) is exposed as a text Control. The `showCareInstructions` toggle controls
 * whether `product.type.item` is set — without it, the component hides the
 * Care Instructions section entirely.
 */
export const Playground: StoryWithSynthetic = {
    args: {
        longDescription:
            'Premium grain deerskin leather lined with cashmere. Hand-stitched by master craftsmen in Italy with attention to every detail.',
        shortDescription: mockStandardProductOrderable.product.shortDescription ?? '',
        brand: 'Salesforce Apparel',
        manufacturerName: 'Salesforce Apparel Co.',
        manufacturerSku: 'SF-DEER-001',
        showCareInstructions: true,
    },
    argTypes: {
        longDescription: {
            description: 'Synthetic: shown in Product Details when present (overrides shortDescription fallback)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        shortDescription: {
            description: 'Synthetic: shown in Product Details when longDescription is empty',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        brand: {
            description: 'Synthetic: brand row in Product Details (empty hides the row)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        manufacturerName: {
            description: 'Synthetic: manufacturer row (empty hides the row)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        manufacturerSku: {
            description: 'Synthetic: SKU row (empty hides the row)',
            control: 'text',
            table: { category: 'Synthetic (data shape)' },
        },
        showCareInstructions: {
            description: 'Synthetic: when true sets `product.type.item`, which renders the Care Instructions section',
            control: 'boolean',
            table: { category: 'Synthetic (data shape)' },
        },
    },
    render: (args) => {
        const {
            longDescription,
            shortDescription,
            brand,
            manufacturerName,
            manufacturerSku,
            showCareInstructions,
            ...componentProps
        } = args;
        const product = {
            ...mockStandardProductOrderable.product,
            longDescription: longDescription || undefined,
            shortDescription: shortDescription || undefined,
            brand: brand || undefined,
            manufacturerName: manufacturerName || undefined,
            manufacturerSku: manufacturerSku || undefined,
            type: showCareInstructions
                ? { ...(mockStandardProductOrderable.product.type ?? {}), item: true }
                : { ...(mockStandardProductOrderable.product.type ?? {}), item: false },
        };
        return <ProductAccordion {...(componentProps as Parameters<typeof ProductAccordion>[0])} product={product} />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check for accordion triggers
        const detailsTrigger = canvas.getByRole('button', { name: /product details/i });
        await expect(detailsTrigger).toBeInTheDocument();

        const shippingTrigger = canvas.getByRole('button', { name: /shipping & returns/i });
        await expect(shippingTrigger).toBeInTheDocument();

        // Open Details
        await userEvent.click(detailsTrigger);
        await expect(canvas.getByText(/grain deerskin leather/i)).toBeVisible();
    },
};
