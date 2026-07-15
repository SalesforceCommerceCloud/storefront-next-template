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
import { type ReactElement, useCallback, useState, useId } from 'react';

// Components
import QuantityPicker from '@/components/quantity-picker/quantity-picker';
import { Typography } from '@/components/typography';
import { Label } from '@/components/ui/label';

// Utils
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ProductQuantityPickerProps {
    /** Current quantity value as string */
    value: string;
    /** Callback when quantity changes */
    onChange: (quantity: number) => void;
    /** Custom className for styling */
    className?: string;
    /** Stock level for displaying stock message */
    stockLevel?: number;
    /** Whether the product is out of stock */
    isOutOfStock?: boolean;
    /** Product name for inventory messages */
    productName?: string;
    /** Whether the picker is disabled */
    disabled?: boolean;
    /** Whether this is a bundle product */
    isBundle?: boolean;
    /** Maximum quantity allowed (for bonus products, etc.) */
    maxQuantity?: number;
}

/**
 * Product-specific quantity picker wrapper
 *
 * This component wraps the base QuantityPicker with product-specific logic:
 * - No API integration (simple state management)
 * - Stock level warnings and validation
 * - Product context for error messages
 * - Optimized for product page usage
 */
export default function ProductQuantityPicker({
    value,
    onChange,
    className,
    stockLevel,
    isOutOfStock,
    productName,
    disabled = false,
    isBundle = false,
    maxQuantity,
}: ProductQuantityPickerProps): ReactElement {
    const [quantity, setQuantity] = useState<string>(value);
    const { t: tQuantity } = useTranslation('quantitySelector');
    const { t: tProduct } = useTranslation('product');
    const { t: tCommon } = useTranslation('common');
    const quantityId = `quantity-${useId()}`;

    // Handle quantity change - let QuantityPicker handle validation with min=1
    const handleQuantityChange = useCallback(
        (stringValue: string, numberValue: number) => {
            if (numberValue >= 0) {
                onChange(numberValue);
                setQuantity(stringValue);
            }
        },
        [onChange]
    );

    // Generate inventory message based on stock status
    const getInventoryMessage = () => {
        // Priority 1: Out of stock message
        if (isOutOfStock) {
            return tProduct('outOfStock', { productName: productName || tCommon('product') });
        }

        // Priority 2: Check if stockLevel < quantity
        const currentQuantity = parseInt(quantity, 10) || 0;
        if (stockLevel !== undefined && stockLevel > 0 && stockLevel < currentQuantity) {
            if (isBundle) {
                return tQuantity('onlyLeftForProduct', {
                    stockLevel: stockLevel.toString(),
                    productName: productName || tCommon('product'),
                });
            } else {
                return tQuantity('onlyLeft', { stockLevel: stockLevel.toString() });
            }
        }

        return null;
    };

    const inventoryMessage = getInventoryMessage();

    return (
        <div className={cn('space-y-2', className)}>
            <Label htmlFor={quantityId} className="text-base font-semibold leading-6 text-card-foreground">
                {tQuantity('quantity')}
            </Label>
            <QuantityPicker
                id={quantityId}
                value={quantity}
                min={1}
                max={maxQuantity}
                onChange={handleQuantityChange}
                productName={productName}
                disabled={disabled}
            />
            {/* Inventory message */}
            {inventoryMessage && (
                <Typography variant="small" className="text-destructive font-medium" role="alert" aria-live="polite">
                    {inventoryMessage}
                </Typography>
            )}
        </div>
    );
}
