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
import { type FC, type MouseEvent, type ReactNode, type TouchEvent, useCallback } from 'react';
import { NavLink } from '@/components/link';
import { cn } from '@/lib/utils';
import { swatchVariants } from './swatch-variants';
import type { VariantProps } from 'class-variance-authority';

/**
 * Props for the Swatch component
 */
interface SwatchProps extends VariantProps<typeof swatchVariants> {
    /** Content to render inside the swatch */
    children?: ReactNode;
    /** Whether the swatch is disabled and non-interactive */
    disabled?: boolean;
    /** URL to navigate to when swatch is clicked */
    href?: string;
    /** Accessible label for the swatch */
    label?: string;
    /** Name attribute for the swatch */
    name?: string;
    /** Whether the swatch is currently selected */
    selected?: boolean;
    /** Whether the swatch can receive keyboard focus */
    isFocusable?: boolean;
    /** Value associated with this swatch */
    value?: string;
    /** Callback function called when swatch is selected. Can't be used when href is defined. */
    handleSelect?: (value: string) => void;
    /** Click event handler */
    onClick?: (e: MouseEvent | TouchEvent) => void;
    /** Interaction mode: 'click' for click interaction, 'hover' for hover interaction. Only applies when handleSelect is provided. */
    mode?: 'hover' | 'click';
    /** Translated out-of-stock suffix for disabled swatches */
    outOfStockSuffix?: string;
}

/**
 * An interactive swatch component for selecting options like colors, sizes, or variants.
 *
 * Behavior:
 * - When href is provided: Renders as a NavLink for navigation on click
 * - When handleSelect is provided: Uses mode prop to determine interaction (hover or click)
 *
 * @example
 * ```tsx
 * // Click mode swatch
 * <Swatch value="red" handleSelect={onSelectColor} mode="click">
 *   Red
 * </Swatch>
 *
 * // Hover mode swatch
 * <Swatch value="blue" handleSelect={onSelectColor} mode="hover">
 *   Blue
 * </Swatch>
 *
 * // Navigation swatch
 * <Swatch href="/product/blue">
 *   Blue Variant
 * </Swatch>
 * ```
 */
export const Swatch: FC<SwatchProps> = ({
    children,
    disabled = false,
    href,
    label,
    name,
    selected = false,
    isFocusable = false,
    value = '',
    handleSelect,
    size = 'lg',
    shape = 'color',
    labeled = false,
    mode = 'click',
    outOfStockSuffix = '(out of stock)',
}) => {
    const onSelect = useCallback(
        (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            if (disabled) {
                return;
            }
            if (handleSelect && value) {
                handleSelect(value);
            }
        },
        [handleSelect, value, disabled]
    );

    // Build event handlers based on mode
    const selectHandlers = handleSelect ? (mode === 'click' ? { onClick: onSelect } : { onMouseEnter: onSelect }) : {};

    const baseClasses = cn(
        swatchVariants({
            size,
            shape,
            selected,
            disabled,
            labeled,
        })
    );

    const innerClasses = 'flex items-center justify-center w-full h-full text-sm font-medium leading-5';

    // Build accessible name that includes out-of-stock status
    const accessibleName = disabled ? `${name || label || value} ${outOfStockSuffix}` : name || label || value;

    const commonProps = {
        'aria-label': accessibleName,
        'aria-checked': selected,
        'aria-disabled': disabled ? true : undefined,
        'data-labeled': labeled || undefined,
        'data-swatch-type': shape,
        position: 'relative',
        role: 'radio',
        tabIndex: disabled ? -1 : isFocusable ? 0 : -1,
        className: baseClasses,
        // if href exists, we do not want to attach selectHandlers since they are not compatible with each other
        ...(href ? {} : selectHandlers),
    };

    if (href) {
        const handleNavLinkClick = (e: MouseEvent | TouchEvent) => {
            if (disabled) {
                e.preventDefault();
            }
        };

        return (
            <NavLink to={href} preventScrollReset={true} {...commonProps} onClick={handleNavLinkClick}>
                <div className={innerClasses} data-slot="swatch-content">
                    {children}
                    {label && (
                        <span className="ml-1" data-slot="swatch-label">
                            {label}
                        </span>
                    )}
                </div>
            </NavLink>
        );
    }

    return (
        <button type="button" {...commonProps}>
            <div className={innerClasses} data-slot="swatch-content">
                {children}
                {label && (
                    <span className="ml-1" data-slot="swatch-label">
                        {label}
                    </span>
                )}
            </div>
        </button>
    );
};
