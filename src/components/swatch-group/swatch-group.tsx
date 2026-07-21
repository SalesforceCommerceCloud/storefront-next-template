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
import React, { Children, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

const DIRECTIONS = {
    FORWARD: 1,
    BACKWARD: -1,
} as const;

interface SwatchChild {
    props?: {
        value?: string;
        handleSelect?: (value: string) => void;
        selected?: boolean;
        isFocusable?: boolean;
        shape?: 'color' | 'label';
        disabled?: boolean;
    };
}

/**
 * Props for the SwatchGroup component
 */
interface SwatchGroupProps {
    /** Display name shown next to the label */
    displayName?: string;
    /** Swatch components to render within the group */
    children: React.ReactNode;
    /** Label text displayed above the swatches */
    label?: string;
    /** Currently selected swatch value */
    value?: string;
    /** Callback function called when a swatch is selected. */
    handleChange?: (value: string) => void;
    /** Additional CSS classes to apply to the container */
    className?: string;
}

const noop = (..._args: unknown[]): void => {
    // Intentionally empty - default no-op function for handleChange
};

/**
 * A container component that manages a group of swatch components with keyboard navigation and selection.
 *
 * Features:
 * - Keyboard navigation with arrow keys (wraps around at start/end)
 * - Accessible radio group implementation
 * - Automatic focus management
 * - Customizable labels and styling
 *
 * @example
 * ```tsx
 * <SwatchGroup
 *   label="Color"
 *   value={selectedColor}
 *   handleChange={setSelectedColor}
 * >
 *   <Swatch value="red" mode="hover">Red</Swatch>
 *   <Swatch value="blue" mode="hover">Blue</Swatch>
 * </SwatchGroup>
 * ```
 */
export const SwatchGroup: React.FC<SwatchGroupProps> = ({
    displayName,
    children,
    label = '',
    value,
    handleChange = noop,
    className,
}) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const labelId = `swatch-group-label-${React.useId()}`;

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            const { key } = e;
            const childrenArray = Children.toArray(children);

            const move = (direction: typeof DIRECTIONS.FORWARD | typeof DIRECTIONS.BACKWARD = DIRECTIONS.FORWARD) => {
                // Find the currently focused element in the DOM to get accurate starting position
                let currentIndex = 0;
                if (typeof document !== 'undefined' && wrapperRef.current) {
                    const focusedElement = document.activeElement;
                    const elementIndex = Array.from(wrapperRef.current.children).findIndex(
                        (child) => child === focusedElement
                    );
                    if (elementIndex !== -1) {
                        currentIndex = elementIndex;
                    }
                }

                let index = currentIndex + direction;

                // Handle wrapping
                if (index >= childrenArray.length) {
                    index = 0; // Wrap to beginning
                } else if (index < 0) {
                    index = childrenArray.length - 1; // Wrap to end
                }

                const swatchEl = wrapperRef?.current?.children[index] as HTMLElement;

                // Call handleChange when navigating with keyboard
                const newChildElement = childrenArray[index] as React.ReactElement<SwatchChild['props']>;
                const newValue = newChildElement?.props?.value;
                if (newValue) {
                    handleChange(newValue);
                }

                swatchEl?.focus();
            };

            switch (key) {
                case 'ArrowUp':
                case 'ArrowLeft':
                    e.preventDefault();
                    move(DIRECTIONS.BACKWARD);
                    break;
                case 'ArrowDown':
                case 'ArrowRight':
                    e.preventDefault();
                    move(DIRECTIONS.FORWARD);
                    break;
                default:
                    break;
            }
        },
        // do not need handleChange as dep
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [children]
    );

    const containerClasses = cn('space-y-3', className);

    const labelClasses = 'flex items-center gap-2 text-base font-semibold leading-6 text-card-foreground';

    // Check if this is a square swatch group (size, material, etc.)
    const isSquareSwatchGroup =
        (React.Children.toArray(children)[0] as React.ReactElement<SwatchChild['props']>)?.props?.shape === 'label';

    const swatchesWrapperClasses = isSquareSwatchGroup
        ? 'inline-flex flex-wrap gap-2 focus:outline-none bg-swatch-group-bg p-1'
        : 'flex flex-wrap gap-[var(--swatch-pill-gap,0.5rem)] focus:outline-none';

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- radiogroup composite widget: arrow-key roving handled at group level per ARIA APG
        <div className={containerClasses} onKeyDown={onKeyDown}>
            <div
                className={isSquareSwatchGroup ? 'inline-flex flex-col gap-3' : 'flex flex-col gap-3'}
                role="radiogroup"
                aria-labelledby={label ? labelId : undefined}>
                {label && (
                    <div id={labelId} className={labelClasses}>
                        <span>{label}:</span>
                        {displayName && <span>{displayName}</span>}
                    </div>
                )}
                <div ref={wrapperRef} className={swatchesWrapperClasses} data-slot="swatch-container">
                    {Children.toArray(children).map((child, index) => {
                        const childElement = child as React.ReactElement<SwatchChild['props']>;
                        const selected = childElement.props?.value === value;

                        return React.cloneElement(childElement, {
                            key: childElement.props?.value || index,
                            handleSelect: handleChange,
                            selected,
                            isFocusable: value ? selected : index === 0,
                        });
                    })}
                </div>
            </div>
        </div>
    );
};

SwatchGroup.displayName = 'SwatchGroup';
