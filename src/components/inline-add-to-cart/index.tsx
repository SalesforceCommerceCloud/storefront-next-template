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
import { type ReactElement, type RefObject, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import { cn } from '@/lib/utils';

export interface InlineAddToCartProps {
    /** Quantity of this SKU already in the basket. `0` renders the Add-to-Cart CTA. */
    quantityInCart: number;
    /** Adds the first unit to the basket. */
    onAdd: () => void;
    /** Increases the in-cart quantity by one. */
    onIncrement: () => void;
    /** Decreases quantity by one, or removes the line at quantity one. */
    onDecrement: () => void;
    /** Disables the control when the selected product cannot be purchased. */
    disabled?: boolean;
    /** Disables increment at the configured or available-stock limit. */
    incrementDisabled?: boolean;
    /** Disables mutations while a basket action is in flight. */
    loading?: boolean;
    /**
     * The in-cart quantity is still being fetched. The first-add CTA is disabled while true so a
     * shopper who already has this SKU in the basket can't trigger a duplicate add before the
     * stepper appears.
     */
    resolvingQuantity?: boolean;
    /** Product name used in accessible controls. */
    productName?: string;
    /** Optional stock-limit message shown and announced after the control. */
    stockMessage?: string | null;
    className?: string;
}

type PendingFocusTarget = 'decrement' | 'increment';

interface InlineCartStepperProps {
    quantityInCart: number;
    onIncrement: () => void;
    onDecrement: () => void;
    disabled: boolean;
    incrementDisabled: boolean;
    loading: boolean;
    productName?: string;
    stockMessage?: string | null;
    decrementButtonRef: RefObject<HTMLButtonElement | null>;
    incrementButtonRef: RefObject<HTMLButtonElement | null>;
    onAction: (action: PendingFocusTarget, callback: () => void) => void;
}

function InlineCartStepper({
    quantityInCart,
    onIncrement,
    onDecrement,
    disabled,
    incrementDisabled,
    loading,
    productName,
    stockMessage,
    decrementButtonRef,
    incrementButtonRef,
    onAction,
}: InlineCartStepperProps): ReactElement {
    const { t: tProduct } = useTranslation('product');
    const { t: tQuantity } = useTranslation('quantitySelector');
    const { t: tCommon } = useTranslation('common');
    const statusId = useId();
    const name = productName || tCommon('product');
    const atOne = quantityInCart === 1;
    const statusMessage =
        stockMessage ?? (loading ? tProduct('updatingCart') : tQuantity('quantityInCart', { count: quantityInCart }));

    return (
        <>
            <div
                role="group"
                aria-label={tQuantity('quantityForProduct', { productName: name })}
                data-slot="add-to-cart-button"
                data-testid="inline-add-to-cart"
                className="bg-primary text-primary-foreground rounded-ui flex h-10 w-full items-center">
                <button
                    ref={decrementButtonRef}
                    type="button"
                    data-testid="inline-add-to-cart-decrement"
                    onClick={() => onAction('decrement', onDecrement)}
                    disabled={loading}
                    aria-label={
                        atOne
                            ? tQuantity('removeFromCartForProduct', { productName: name })
                            : tQuantity('decreaseQuantityForProduct', { productName: name })
                    }
                    className="text-primary-foreground hover:bg-primary-foreground/10 focus-visible:ring-ring min-w-11 inline-flex h-full items-center justify-center px-4 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                    <Minus className="size-4" aria-hidden="true" />
                </button>
                <span
                    data-testid="inline-add-to-cart-quantity"
                    title={tQuantity('quantityInCart', { count: quantityInCart })}
                    className="min-w-0 flex-1 truncate px-1 text-center text-base font-semibold leading-6">
                    {tQuantity('quantityInCart', { count: quantityInCart })}
                </span>
                <button
                    ref={incrementButtonRef}
                    type="button"
                    data-testid="inline-add-to-cart-increment"
                    onClick={() => onAction('increment', onIncrement)}
                    disabled={disabled || loading || incrementDisabled}
                    aria-describedby={stockMessage ? statusId : undefined}
                    aria-label={tQuantity('increaseQuantityForProduct', { productName: name })}
                    className="text-primary-foreground hover:bg-primary-foreground/10 focus-visible:ring-ring min-w-11 inline-flex h-full items-center justify-center px-4 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                    <Plus className="size-4" aria-hidden="true" />
                </button>
            </div>
            <div id={statusId} role="status" aria-live="polite" aria-atomic="true">
                <Typography variant="small" className={cn(stockMessage ? 'text-destructive font-medium' : 'sr-only')}>
                    {statusMessage}
                </Typography>
            </div>
        </>
    );
}

/**
 * PDP cart control that changes from Add to Cart to an in-cart quantity stepper.
 * Mutation and basket state remain with the caller so this component stays purely
 * presentational and can preserve focus while its controls are replaced.
 */
export default function InlineAddToCart({
    quantityInCart,
    onAdd,
    onIncrement,
    onDecrement,
    disabled = false,
    incrementDisabled = false,
    loading = false,
    resolvingQuantity = false,
    productName,
    stockMessage,
    className,
}: InlineAddToCartProps): ReactElement {
    const { t: tProduct } = useTranslation('product');
    const inCart = quantityInCart > 0;
    const containerRef = useRef<HTMLDivElement>(null);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const decrementButtonRef = useRef<HTMLButtonElement>(null);
    const incrementButtonRef = useRef<HTMLButtonElement>(null);
    const pendingFocusTargetRef = useRef<PendingFocusTarget | null>(null);
    const movedFocusForLoadingRef = useRef(false);

    useEffect(() => {
        if (loading) {
            if (pendingFocusTargetRef.current && !movedFocusForLoadingRef.current) {
                movedFocusForLoadingRef.current = true;
                containerRef.current?.focus({ preventScroll: true });
            }
            return;
        }

        if (!pendingFocusTargetRef.current) {
            return;
        }

        const focusTarget: PendingFocusTarget = pendingFocusTargetRef.current;
        pendingFocusTargetRef.current = null;
        movedFocusForLoadingRef.current = false;
        const animationFrame = requestAnimationFrame(() => {
            if (!inCart) {
                addButtonRef.current?.focus({ preventScroll: true });
            } else if (focusTarget === 'increment' && !incrementDisabled && !disabled) {
                // Increment is also disabled by the general `disabled` prop; focusing it then would
                // drop focus to <body>. Fall through to decrement, which stays focusable.
                incrementButtonRef.current?.focus({ preventScroll: true });
            } else {
                decrementButtonRef.current?.focus({ preventScroll: true });
            }
        });

        return () => cancelAnimationFrame(animationFrame);
    }, [disabled, inCart, incrementDisabled, loading]);

    const handleAction = (action: PendingFocusTarget, callback: () => void) => {
        pendingFocusTargetRef.current = action;
        callback();
    };

    return (
        <div
            ref={containerRef}
            tabIndex={loading ? -1 : undefined}
            aria-busy={loading || resolvingQuantity || undefined}
            className={cn('flex flex-col gap-2', className)}
            data-slot="inline-add-to-cart">
            {inCart ? (
                <InlineCartStepper
                    quantityInCart={quantityInCart}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                    disabled={disabled}
                    incrementDisabled={incrementDisabled}
                    loading={loading}
                    productName={productName}
                    stockMessage={stockMessage}
                    decrementButtonRef={decrementButtonRef}
                    incrementButtonRef={incrementButtonRef}
                    onAction={handleAction}
                />
            ) : (
                <>
                    <Button
                        ref={addButtonRef}
                        data-testid="add-to-cart"
                        data-slot="add-to-cart-button"
                        onClick={() => handleAction('decrement', onAdd)}
                        disabled={disabled || loading || resolvingQuantity}
                        className="w-full text-base font-semibold leading-6"
                        size="lg">
                        {loading ? tProduct('addingToCart') : tProduct('addToCart')}
                    </Button>
                    <div role="status" aria-live="polite" aria-atomic="true">
                        {loading && (
                            <Typography variant="small" className="sr-only">
                                {tProduct('updatingCart')}
                            </Typography>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
