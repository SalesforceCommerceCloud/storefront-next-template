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
import { useState, type ReactElement } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CartItemModal } from '../index';
import { Button } from '@/components/ui/button';
import { masterProduct, variantProduct } from '@/components/__mocks__/master-variant-product';
import type { ShopperProducts } from '@/scapi';

// ---------------------------------------------------------------------------
// Fixtures — derive product variants from the shared master/variant mocks.
// ---------------------------------------------------------------------------

// Preserve real variant `productId`s from `master-variant-product` so the modal
// exercises the production variant-fetch code path (`useEffect` in
// CartItemModalEditContainer fetches new product data when the selected variant
// id differs from `product.id`). The story router's default SCAPI mock route
// (`.storybook/decorators/mock-routes.ts` → `/resource/api/client/:resource`)
// resolves the fetch with `masterProduct`, so swatch clicks resolve cleanly.
const createMockProductForModal = (): ShopperProducts.schemas['Product'] => ({
    ...masterProduct,
    variationValues: variantProduct.variationValues,
    brand: 'Salesforce Foundations',
});

const createSizeOnlyProduct = (): ShopperProducts.schemas['Product'] => {
    const product = createMockProductForModal();
    product.variationAttributes = product.variationAttributes?.filter((attr) => attr.id === 'size');
    // Drop variants without a meaningful size, then dedupe by size so the swatch
    // panel doesn't render duplicate options. Avoids the bug where coercing an
    // undefined size to `''` then deduping by that empty string silently drops
    // every later size variant.
    const seenSizes = new Set<string>();
    product.variants = product.variants
        ?.filter((v): v is NonNullable<typeof v> & { variationValues: { size: string } } => {
            const size = v.variationValues?.size;
            if (!size) return false;
            if (seenSizes.has(size)) return false;
            seenSizes.add(size);
            return true;
        })
        .map((v) => ({
            ...v,
            variationValues: { size: v.variationValues.size },
        }));
    product.variationValues = { size: product.variationValues?.size || '040' };
    product.imageGroups = product.imageGroups?.filter(
        (group) => !group.variationAttributes?.some((attr) => attr.id === 'color')
    );
    return product;
};

const createProductWithManyImages = (): ShopperProducts.schemas['Product'] => {
    const product = createMockProductForModal();
    const largeGroup = product.imageGroups?.find((g) => g.viewType === 'large' && !g.variationAttributes);
    if (largeGroup?.images) {
        const baseImages = largeGroup.images;
        largeGroup.images = [
            ...baseImages,
            { ...baseImages[0], alt: `${baseImages[0].alt} - angle 3` },
            { ...baseImages[1], alt: `${baseImages[1].alt} - angle 4` },
            { ...baseImages[0], alt: `${baseImages[0].alt} - angle 5` },
            { ...baseImages[1], alt: `${baseImages[1].alt} - angle 6` },
        ];
    }
    return product;
};

// ---------------------------------------------------------------------------
// Pattern 11 — closed-by-default + trigger. Modal/dialog stories must mount
// closed; the play function clicks "Open modal" and asserts content via
// `within(document.body)` because the dialog portals out of `canvasElement`.
// ---------------------------------------------------------------------------

interface ModalArgs {
    product?: ShopperProducts.schemas['Product'];
    productId?: string;
    initialQuantity?: number;
    itemId?: string;
    initialVariantSelections?: Record<string, string>;
}

function ModalTriggerHarness(args: ModalArgs): ReactElement {
    const [open, setOpen] = useState(false);
    return (
        <div className="p-4">
            <Button type="button" onClick={() => setOpen(true)}>
                Open Cart Item Modal
            </Button>
            {/* Lazy-mount the modal so the closed-by-default snapshot doesn't run */}
            {/* the AddContainer/EditContainer hooks (which call useConfig + */}
            {/* useProductImages) before the user has interacted. */}
            {/* */}
            {/* Production differs by entry point: `quick-add-button.tsx` mounts the */}
            {/* modal lazily on first click but keeps it mounted afterwards (so */}
            {/* re-opening doesn't re-pay the React.lazy chunk), while */}
            {/* `cart-item-edit-button.tsx` mounts the modal closed from the start. */}
            {/* Stories prefer always-unmounted to keep the closed snapshot byte */}
            {/* identical regardless of mode — assertions that require a real */}
            {/* mounted-but-closed view should add a dedicated story rather than */}
            {/* changing this default. */}
            {open && (
                <CartItemModal
                    open={open}
                    onOpenChange={setOpen}
                    product={args.product}
                    productId={args.productId}
                    initialQuantity={args.initialQuantity}
                    itemId={args.itemId}
                    initialVariantSelections={args.initialVariantSelections}
                />
            )}
        </div>
    );
}

const meta: Meta<typeof ModalTriggerHarness> = {
    title: 'CART/Cart Item Modal',
    component: ModalTriggerHarness,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            story: { inline: false, height: '600px' },
            description: {
                component: `
A modal dialog for editing cart items — change variant, adjust quantity, update the cart line. Internally delegates to \`CartItemModalAddContainer\` (when \`productId\` is supplied) or \`CartItemModalEditContainer\` (when \`product\` + \`itemId\` are supplied). Those subcomponents have no external importers, so their separate story files were folded into this one (Pattern 13).

Stories follow the **closed-by-default + trigger pattern (Pattern 11)** — every story mounts a "Open Cart Item Modal" button, and the play function clicks it before asserting on the dialog. This avoids the docs-iframe clipping that \`defaultOpen: true\` overlays produce.

## Stories

| Story | Description |
|-------|-------------|
| **EditWithVariants** | Edit mode: full master product with size/color/width swatches and 6+ image thumbnails (scroll arrows visible) |
| **EditSizeOnly** | Edit mode: simplified product with a single \`size\` attribute and high quantity |

Add mode (passing only \`productId\`) is intentionally not a separate story — it renders the same \`CartItemModalView\` once SCAPI resolves, and the only visible delta is the bottom CTA wording ("Add to Cart" + "Buy It Now" vs "Update"). The mode-routing logic itself is fully covered by \`mode-router.test.tsx\` and \`index.test.tsx\`. Use the \`productId\` control on **EditWithVariants** to exercise the add-mode CTA wording when needed.

Every story's play function implicitly validates the closed-by-default state — the trigger button renders before the click, and no dialog is mounted in the DOM until the play function acts.
                `,
            },
        },
    },
    argTypes: {
        product: { control: 'object' },
        productId: { control: 'text' },
        initialQuantity: { control: 'number' },
        itemId: { control: 'text' },
    },
    args: {
        product: createMockProductForModal(),
        initialQuantity: 1,
        itemId: 'item-123',
    },
};

export default meta;
type Story = StoryObj<typeof ModalTriggerHarness>;

export const EditWithVariants: Story = {
    args: {
        product: createProductWithManyImages(),
        initialVariantSelections: variantProduct.variationValues,
        initialQuantity: 1,
        itemId: 'item-123',
    },
    parameters: {
        docs: {
            description: {
                story: 'Edit mode with size/color/width swatches and a 6+ image thumbnail strip — covers the variant-selection + scrollable-thumbnail path.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const trigger = await canvas.findByRole('button', { name: /open cart item modal/i });

        // Closed-by-default: dialog must not exist before the user clicks.
        await expect(document.body.querySelector('[role="dialog"]')).not.toBeInTheDocument();

        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', { hidden: false });
        await expect(dialog).toBeInTheDocument();
    },
};

export const EditSizeOnly: Story = {
    args: {
        product: createSizeOnlyProduct(),
        initialQuantity: 5,
        itemId: 'item-123',
    },
    parameters: {
        docs: {
            description: {
                story: 'Edit mode for a product with a single `size` attribute and a high initial quantity. Demonstrates the simplified swatch panel.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const trigger = await canvas.findByRole('button', { name: /open cart item modal/i });

        // Closed-by-default: dialog must not exist before the user clicks.
        await expect(document.body.querySelector('[role="dialog"]')).not.toBeInTheDocument();

        await userEvent.click(trigger);

        const documentBody = within(document.body);
        const dialog = await documentBody.findByRole('dialog', { hidden: false });
        await expect(dialog).toBeInTheDocument();
    },
};
