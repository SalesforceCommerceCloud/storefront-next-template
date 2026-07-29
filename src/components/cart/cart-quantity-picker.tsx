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

// React
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';

// Hooks
import { useItemFetcher } from '@/hooks/use-item-fetcher';
import { useCartQuantityUpdate } from '@/hooks/use-cart-quantity-update';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

// Components
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import QuantityPicker from '@/components/quantity-picker/quantity-picker';
import { Typography } from '@/components/typography';
import { Label } from '@/components/ui/label';

// Utils
import { cn } from '@/lib/utils';

interface CartQuantityPickerProps {
    /** Current quantity value as string */
    value: string;
    /** Cart item ID for API calls */
    itemId: string;
    /** Custom className for styling */
    className?: string;
    /** Debounce delay in milliseconds */
    debounceDelay?: number;
    /** Stock level for validation */
    stockLevel?: number;
    /** Maximum quantity allowed (for bonus products, etc.) */
    max?: number;
    /** Disable quantity picker (e.g., for bonus products) */
    disabled?: boolean;
}

/**
 * Cart-specific quantity picker wrapper
 *
 * This component wraps the base QuantityPicker with cart-specific logic:
 * - Automatic API integration via React Router fetcher
 * - Debounced quantity updates to prevent API spam
 * - Error handling with rollback on failure
 * - Stock level validation with warnings
 * - Optimistic updates for better UX
 */
export default function CartQuantityPicker({
    value,
    itemId,
    className,
    debounceDelay,
    stockLevel,
    max,
    disabled = false,
}: CartQuantityPickerProps): ReactElement {
    const config = useConfig();
    const { t: tQuantity } = useTranslation('quantitySelector');
    const { t: tRemove } = useTranslation('removeItem');
    const { t: tCart } = useTranslation('cart');
    // Unique id per cart line so the visible "Quantity" label associates with this line's input.
    // A hardcoded id would break linkage across multiple cart lines; useId keeps each pairing
    // unique and SSR-stable.
    const quantityId = `cart-qty-${useId()}`;
    const errorId = `${quantityId}-error`;
    const effectiveDebounceDelay = debounceDelay || config.pages.cart.quantityUpdateDebounce;

    // Create a unique fetcher for this component instance
    const fetcher = useItemFetcher({
        itemId,
        componentName: 'cart-quantity-picker',
    });
    const isLoading = fetcher.state === 'submitting';
    const {
        quantity,
        stockValidationError,
        stockMax,
        showRemoveConfirmation,
        handleQuantityChange,
        handleQuantityBlur,
        handleKeepItem,
        handleRemoveItem,
        setShowRemoveConfirmation,
    } = useCartQuantityUpdate({
        itemId,
        initialValue: parseInt(value, 10) || 0, // Convert string to number for the hook
        stockLevel,
        debounceDelay: effectiveDebounceDelay,
        fetcher,
    });

    return (
        <div className={cn('relative flex w-fit max-w-full flex-col items-start gap-2', className)}>
            <Label
                htmlFor={quantityId}
                className="block text-left font-sans text-base font-semibold leading-6 text-card-foreground">
                {tQuantity('quantity')}
            </Label>
            <QuantityPicker
                id={quantityId}
                value={quantity.toString()}
                onBlur={handleQuantityBlur}
                onChange={handleQuantityChange}
                disabled={isLoading || disabled}
                max={max ?? stockMax}
                aria-describedby={!disabled && stockValidationError ? errorId : undefined}
            />
            {!disabled && stockValidationError && (
                <Typography
                    id={errorId}
                    variant="small"
                    className="absolute top-full left-0 mt-1 w-max max-w-[min(100%,18rem)] text-destructive"
                    role="alert"
                    aria-live="polite">
                    {stockValidationError}
                </Typography>
            )}

            {/* Remove item confirmation dialog */}
            <ConfirmationDialog
                open={showRemoveConfirmation}
                onOpenChange={setShowRemoveConfirmation}
                title={tRemove('confirmTitle')}
                description={tCart('removeItemConfirmDescription')}
                cancelButtonText={tRemove('keepItemButton')}
                confirmButtonText={tRemove('confirmAction')}
                onCancel={handleKeepItem}
                onConfirm={handleRemoveItem}
                confirmButtonDisabled={isLoading}
                cancelButtonAriaLabel={tRemove('keepItemAriaLabel')}
                confirmButtonAriaLabel={tRemove('removeItemAriaLabel')}
            />
        </div>
    );
}
