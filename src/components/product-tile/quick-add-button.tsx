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
import { lazy, Suspense, useState, useCallback, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { createProductUrl } from '@/lib/product/product-utils';
import { useProductTileContext } from './context';

interface QuickAddButtonProps {
    productId: string;
    productName: string;
    /** Currently selected color value — pre-seeds the PDP URL when "Buy It Now" is clicked */
    selectedColorValue?: string | null;
    /**
     * Full variant selections (all axes) from the tile's represented variant. Pre-seeds
     * every swatch in the quick-add modal so the modal matches the variant the tile advertises.
     */
    initialVariantSelections?: Record<string, string>;
    /** Custom button label. Defaults to the `product.quickAdd` locale key */
    label?: string;
}

const CartItemModal = lazy(() =>
    import('@/components/cart-item-modal').then((module) => ({ default: module.CartItemModal }))
);

/**
 * Client component that renders the "Quick Add" hover button on a product tile and manages
 * the add-mode CartItemModal lifecycle.
 *
 * Clicking the button opens the modal; the modal fetches the full product internally.
 * "Buy It Now" closes the modal and navigates to the PDP with the selected color pre-seeded.
 */
export function QuickAddButton({
    productId,
    productName,
    selectedColorValue,
    initialVariantSelections,
    label,
}: QuickAddButtonProps) {
    const [loaded, setLoaded] = useState(false);
    const [open, setOpen] = useState(false);
    const { navigate, t } = useProductTileContext();

    const resolvedLabel = label ?? t('quickAdd');

    const handleBuyItNow = useCallback(() => {
        setOpen(false);
        void navigate(createProductUrl(productId, selectedColorValue ?? null, 'color'));
    }, [navigate, productId, selectedColorValue]);
    const handleOpenModal = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setLoaded(true);
        setOpen(true);
    }, []);

    return (
        <>
            <Button
                variant="outline"
                size="default"
                className="w-full shadow-sm cursor-pointer"
                aria-label={`${resolvedLabel} ${productName}`}
                onClick={handleOpenModal}>
                {resolvedLabel}
            </Button>

            {loaded && (
                <Suspense fallback={null}>
                    <CartItemModal
                        productId={productId}
                        open={open}
                        onOpenChange={setOpen}
                        onBuyNow={handleBuyItNow}
                        initialVariantSelections={initialVariantSelections}
                    />
                </Suspense>
            )}
        </>
    );
}
