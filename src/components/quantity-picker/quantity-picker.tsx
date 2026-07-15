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
import { type ReactElement } from 'react';

// Hooks
import { useQuantityPicker } from '@/hooks/use-quantity-picker';

// Utils
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

// Constants

interface QuantityPickerProps {
    /** Current quantity value as string */
    value: string;
    /** Callback when quantity changes */
    onChange: (stringValue: string, numberValue: number) => void;
    /** Callback when input loses focus */
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    /** Minimum quantity allowed */
    min?: number;
    /** Maximum quantity allowed (for bonus products, etc.) */
    max?: number;
    /** Product name for accessibility */
    productName?: string;
    /** Whether the picker is disabled */
    disabled?: boolean;
    /** Additional class names for the container */
    className?: string;
    /** ID for the input element to enable label linkage */
    id?: string;
}

/**
 * QuantityPicker - A shadcn/ui implementation based on Chakra UI's NumberInput
 *
 * This component provides a mobile-first quantity selector with:
 * - Increment/decrement buttons
 * - Direct input field
 * - Keyboard navigation support
 * - Accessibility features
 * - Focus management
 * - Auto-correction of invalid values on blur (when no custom onBlur handler is provided)
 */
export default function QuantityPicker({
    value,
    onChange,
    onBlur,
    min = 0,
    max,
    productName,
    disabled = false,
    className,
    id,
}: QuantityPickerProps): ReactElement {
    const { t: tQuantity } = useTranslation('quantitySelector');
    const { t: tCommon } = useTranslation('common');

    const {
        inputValue,
        inputRef,
        isDecrementDisabled,
        isIncrementDisabled,
        handleIncrement,
        handleDecrement,
        handleInputChange,
        handleInputFocus,
        handleInputBlur,
        handleKeyDown,
    } = useQuantityPicker({
        value,
        onChange,
        onBlur,
        min,
        max,
    });

    return (
        <div className={cn('inline-flex items-center border border-input rounded-ui overflow-hidden', className)}>
            {/* Decrement Button */}
            <button
                onClick={handleDecrement}
                disabled={disabled || isDecrementDisabled}
                className="px-2.5 py-1.5 text-base font-semibold leading-normal text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={tQuantity('decreaseQuantityForProduct', { productName: productName || tCommon('product') })}
                data-testid="quantity-decrement">
                −
            </button>

            {/* Input Field */}
            <input
                ref={inputRef}
                id={id}
                type="number"
                min={min}
                max={max}
                step={1}
                value={inputValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={cn(
                    'w-9 text-center text-sm font-semibold leading-normal text-foreground border-0 bg-transparent focus:outline-none focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed',
                    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                )}
                aria-label={id ? undefined : tQuantity('quantity')}
            />

            {/* Increment Button */}
            <button
                onClick={handleIncrement}
                disabled={disabled || isIncrementDisabled}
                className="px-2.5 py-1.5 text-base font-semibold leading-normal text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={tQuantity('increaseQuantityForProduct', { productName: productName || tCommon('product') })}
                data-testid="quantity-increment">
                +
            </button>
        </div>
    );
}
