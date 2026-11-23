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
import { lazy, Suspense, useState, useCallback, useRef, useEffect, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { createProductUrlFromAttributes } from '@/lib/product/product-utils';
import { useDeferredUnmount } from '@/hooks/use-deferred-unmount';
import { useProductTileContext } from './context';

interface QuickAddButtonProps {
    variant?: 'default' | 'corner';
    /** Preload on tile intent so keyboard focus never swaps an active placeholder. */
    preload?: boolean;
    productId: string;
    productName: string;
    /** Authoritative product slug returned by SCAPI, when available. */
    productSlug?: string;
    /** Currently selected color value — pre-seeds the PDP URL when "Buy It Now" is clicked */
    selectedColorValue?: string | null;
    /**
     * Full variant selections (all axes) from the tile's represented variant. Pre-seeds
     * every swatch in the quick-add modal so the modal matches the variant the tile advertises.
     */
    initialVariantSelections?: Record<string, string>;
    /** Custom button label. Defaults to the `product.quickAdd` locale key */
    label?: string;
    disabled?: boolean;
}

const CornerQuickAdd = lazy(() => import('./corner-quick-add').then((module) => ({ default: module.CornerQuickAdd })));

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
    productSlug,
    selectedColorValue,
    initialVariantSelections,
    label,
    disabled,
    variant = 'default',
    preload = false,
}: QuickAddButtonProps) {
    const [open, setOpen] = useState(false);
    const [cornerReady, setCornerReady] = useState(variant !== 'corner');
    const placeholderRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (variant !== 'corner' || cornerReady) return;
        if (preload || typeof IntersectionObserver === 'undefined') {
            setCornerReady(true);
            return;
        }
        const element = placeholderRef.current;
        if (!element) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setCornerReady(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [variant, cornerReady, preload]);
    const triggerRef = useRef<HTMLElement | null>(null);
    // Keep the modal subtree mounted while open, then unmount shortly after close so its
    // Radix exit animation plays and its SCAPI fetchers deregister from the registry.
    const mounted = useDeferredUnmount(open);
    const { navigate, t, seoUrlContext } = useProductTileContext();

    const resolvedLabel = label ?? t('quickAdd');

    const handleBuyItNow = useCallback(() => {
        setOpen(false);
        void navigate(
            createProductUrlFromAttributes(productId, selectedColorValue ?? null, 'color', null, {
                context: seoUrlContext,
                slug: productSlug,
            })
        );
    }, [navigate, productId, productSlug, selectedColorValue, seoUrlContext]);
    const handleOpenModal = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        triggerRef.current = e.currentTarget;
        setOpen(true);
    }, []);

    const handleSelect = useCallback((trigger: HTMLElement | null) => {
        triggerRef.current = trigger;
        setOpen(true);
    }, []);

    const cornerPlaceholder = (
        <Button
            ref={placeholderRef}
            disabled
            size="icon"
            className="size-11 rounded-ui bg-background text-primary shadow-ui"
            aria-label={`${resolvedLabel} ${productName}`}
        />
    );

    return (
        <>
            {variant === 'corner' ? (
                cornerReady ? (
                    <Suspense fallback={cornerPlaceholder}>
                        <CornerQuickAdd
                            productId={productId}
                            productName={productName}
                            onSelect={handleSelect}
                            disabled={disabled}
                        />
                    </Suspense>
                ) : (
                    cornerPlaceholder
                )
            ) : (
                <Button
                    disabled={disabled}
                    variant="outline"
                    size="default"
                    className="w-full shadow-sm cursor-pointer"
                    aria-label={`${resolvedLabel} ${productName}`}
                    onClick={handleOpenModal}>
                    {resolvedLabel}
                </Button>
            )}

            {mounted && (
                <Suspense fallback={null}>
                    <CartItemModal
                        productId={productId}
                        open={open}
                        onOpenChange={setOpen}
                        onCloseAutoFocus={(event) => {
                            if (triggerRef.current?.isConnected) {
                                event.preventDefault();
                                triggerRef.current.focus();
                            }
                        }}
                        onBuyNow={handleBuyItNow}
                        initialVariantSelections={initialVariantSelections}
                    />
                </Suspense>
            )}
        </>
    );
}
