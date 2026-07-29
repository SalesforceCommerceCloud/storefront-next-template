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
import { action } from 'storybook/actions';
import { useState, type ReactElement } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import type { ShopperProducts } from '@/scapi';

import { BonusProductModal, type BonusDiscountSlot } from '../index';
import { Button } from '@/components/ui/button';

// Mock product data - simplified tie product with two color variants
const mockTieProduct: ShopperProducts.schemas['Product'] = {
    currency: 'USD',
    id: '25752986M',
    name: 'Striped Silk Tie',
    shortDescription: 'A classic striped silk tie perfect for any formal occasion.',
    longDescription:
        'This elegant striped silk tie features a timeless design that complements any suit. Made from premium silk for a luxurious look and feel.',
    price: 19.99,
    type: {
        master: true,
    },
    imageGroups: [
        {
            images: [
                {
                    alt: 'Striped Silk Tie, , large',
                    link: 'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/images/large/tie.jpg',
                    title: 'Striped Silk Tie',
                },
            ],
            viewType: 'large',
        },
        {
            images: [
                {
                    alt: 'Striped Silk Tie, Red, swatch',
                    link: 'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/images/swatch/tie-red.jpg',
                    title: 'Striped Silk Tie, Red',
                },
            ],
            variationAttributes: [
                {
                    id: 'color',
                    values: [
                        {
                            value: 'REDSI',
                        },
                    ],
                },
            ],
            viewType: 'swatch',
        },
        {
            images: [
                {
                    alt: 'Striped Silk Tie, Turquoise, swatch',
                    link: 'https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.static/-/Sites-apparel-m-catalog/default/images/swatch/tie-turquoise.jpg',
                    title: 'Striped Silk Tie, Turquoise',
                },
            ],
            variationAttributes: [
                {
                    id: 'color',
                    values: [
                        {
                            value: 'TURQUSI',
                        },
                    ],
                },
            ],
            viewType: 'swatch',
        },
    ],
    inventory: {
        ats: 151,
        backorderable: false,
        id: 'inventory_m',
        orderable: true,
        preorderable: false,
        stockLevel: 151,
    },
    master: {
        masterId: '25752986M',
        orderable: true,
        price: 19.99,
    },
    variants: [
        {
            orderable: true,
            price: 19.99,
            productId: '793775362380M',
            variationValues: {
                color: 'REDSI',
            },
        },
        {
            orderable: true,
            price: 19.99,
            productId: '793775370033M',
            variationValues: {
                color: 'TURQUSI',
            },
        },
    ],
    variationAttributes: [
        {
            id: 'color',
            name: 'Color',
            values: [
                {
                    name: 'Red',
                    orderable: true,
                    value: 'REDSI',
                },
                {
                    name: 'Turquoise',
                    orderable: true,
                    value: 'TURQUSI',
                },
            ],
        },
    ],
};

// Mock bonus discount slots
const mockBonusDiscountSlots: BonusDiscountSlot[] = [
    {
        id: '7a5795b50cb1b228c805334cde',
        maxBonusItems: 3,
        bonusProductsSelected: 0,
    },
];

// Wrapper component to manage modal state
function BonusProductModalWrapper(): ReactElement {
    const [open, setOpen] = useState(false);
    const logOpen = action('modal-open');
    const logClose = action('modal-close');

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (isOpen) {
            logOpen();
        } else {
            logClose();
        }
    };

    return (
        <>
            <Button onClick={() => handleOpenChange(true)}>Open Bonus Product Modal</Button>
            <BonusProductModal
                open={open}
                onOpenChange={handleOpenChange}
                productId="25752986M"
                productName="Striped Silk Tie"
                promotionId="BonusPromotionTies"
                bonusDiscountLineItemId="7a5795b50cb1b228c805334cde"
                bonusDiscountSlots={mockBonusDiscountSlots}
            />
        </>
    );
}

const meta: Meta<typeof BonusProductModal> = {
    title: 'Cart/Bonus Products/Bonus Product Modal',
    component: BonusProductModal,
    parameters: {
        layout: 'centered',
        // Override the global /resource/api/client/:resource loader (see .storybook/preview.tsx)
        // so useScapiFetcher inside BonusProductModal resolves with the tie fixture that the
        // play functions below assert against.
        scapiMock: { data: mockTieProduct },
        docs: {
            description: {
                component:
                    'A modal for selecting bonus products from promotions. Displays product details, variant selection, and quantity picker.',
            },
        },
    },
    // 'skip-a11y' remains because the modal has known axe-core violations in the Dialog /
    // product-info layout that are out of scope for this fix.
    tags: ['autodocs', 'skip-a11y', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof BonusProductModal>;

export const Default: Story = {
    render: () => <BonusProductModalWrapper />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Open the modal
        const openButton = canvas.getByRole('button', { name: /open bonus product modal/i });
        await expect(openButton).toBeInTheDocument();
        await userEvent.click(openButton);

        // Modal title — target the dialog title via its selection-count suffix since the
        // product name also appears in the ProductInfo section. Derive the count text from
        // the resolved translation rather than hardcoding the canonical "0 of 3 selected"
        // wording — verticals (e.g. cosmetic) override `selectionCount` to a compact "0/3" form.
        const documentBody = within(document.body);
        const { t } = getTranslation();
        const countText = t('cart:bonusProducts.selectionCount', { selected: 0, max: 3 }).trim();
        const modalTitle = await documentBody.findByRole(
            'heading',
            { name: (name: string) => /striped silk tie/i.test(name) && name.includes(countText) },
            { timeout: 5000 }
        );
        await expect(modalTitle).toBeInTheDocument();

        // Variant swatches render with the product name in the accessible label.
        // The modal auto-selects the first orderable variant on open
        // (`computeInitialVariationValues` fallback #3), so Red is pre-checked.
        const redSwatch = await documentBody.findByRole('radio', { name: /red/i }, { timeout: 5000 });
        await expect(redSwatch).toBeInTheDocument();
        await expect(redSwatch).toBeChecked();

        const turquoiseSwatch = await documentBody.findByRole('radio', { name: /turquoise/i }, { timeout: 5000 });
        await expect(turquoiseSwatch).not.toBeChecked();

        // "Add to Cart" is enabled because a variant is already selected.
        const addToCartButton = await documentBody.findByRole('button', { name: /add to cart/i }, { timeout: 5000 });
        await expect(addToCartButton).toBeEnabled();

        // Clicking turquoise flips the selection — verifies swatch toggle behaviour.
        await userEvent.click(turquoiseSwatch);
        await expect(turquoiseSwatch).toBeChecked();
        await expect(redSwatch).not.toBeChecked();
    },
};
