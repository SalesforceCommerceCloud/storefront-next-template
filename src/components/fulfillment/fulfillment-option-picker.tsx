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

import type { ReactNode } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { FulfillmentOptionDescriptor } from './types';
import { orderFulfillmentOptions } from './use-fulfillment-options';

export interface FulfillmentOptionPickerProps<OptionId extends string> {
    instanceId?: string;
    value?: OptionId;
    options: FulfillmentOptionDescriptor<OptionId>[];
    onChange?: (value: OptionId) => void;
    renderDetails?: (option: FulfillmentOptionDescriptor<OptionId>) => ReactNode;
    onOptionClick?: (option: FulfillmentOptionDescriptor<OptionId>) => void;
    dataTestId?: string;
    getOptionId?: (option: FulfillmentOptionDescriptor<OptionId>) => string;
    ariaLabel?: string;
    className?: string;
}

export function FulfillmentOptionPicker<OptionId extends string>({
    instanceId,
    value,
    options,
    onChange,
    renderDetails,
    onOptionClick,
    dataTestId = 'fulfillment-option-select',
    getOptionId,
    ariaLabel,
    className,
}: FulfillmentOptionPickerProps<OptionId>) {
    const idPrefix = instanceId ? `fulfillment-option-${instanceId}` : 'fulfillment-option';
    const orderedOptions = orderFulfillmentOptions(options);

    if (orderedOptions.length < 2) return null;

    return (
        <div className={cn('w-full', className)}>
            <RadioGroup
                value={value ?? ''}
                onValueChange={(nextValue) => onChange?.(nextValue as OptionId)}
                className={cn('grid gap-2', 'grid-cols-2')}
                data-testid={dataTestId}
                aria-label={ariaLabel}>
                {orderedOptions.map((option) => {
                    const optionId = getOptionId?.(option) ?? `${idPrefix}-${option.id}`;
                    const selected = value === option.id;
                    const disabled = !option.availability.available;
                    const details = renderDetails?.(option);
                    const descriptionId = `${optionId}-description`;
                    const hasDescription = Boolean(option.description || option.availability.disabledReason);

                    return (
                        <div
                            key={option.id}
                            className={cn(
                                'relative flex items-start gap-2 rounded-ui p-3 border transition-colors text-left shadow-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                                selected ? 'border-primary' : 'border-muted-foreground/20 hover:border-primary/50',
                                disabled && 'bg-muted/50 cursor-not-allowed'
                            )}>
                            <RadioGroupItem
                                value={option.id}
                                id={optionId}
                                disabled={disabled}
                                aria-describedby={hasDescription ? descriptionId : undefined}
                                onClick={() => onOptionClick?.(option)}
                                className="sr-only peer"
                            />
                            <label
                                htmlFor={optionId}
                                className={cn('absolute inset-0 cursor-pointer', disabled && 'cursor-not-allowed')}>
                                <span className="sr-only">{option.label}</span>
                            </label>
                            <div className="relative z-10 mt-0.5 shrink-0 pointer-events-none" aria-hidden="true">
                                <div
                                    className={cn(
                                        'w-4 h-4 border-2 flex items-center justify-center transition-colors',
                                        selected ? 'border-primary' : 'border-muted-foreground/20'
                                    )}>
                                    {selected && <div className="w-2 h-2 bg-primary" />}
                                </div>
                            </div>
                            <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
                                <div className={cn('cursor-pointer', disabled && 'cursor-not-allowed')}>
                                    <span className="text-sm font-medium leading-none text-foreground">
                                        {option.label}
                                    </span>
                                </div>
                                {hasDescription && (
                                    <div
                                        id={descriptionId}
                                        className="text-xs font-normal leading-4 tracking-[0.12px] text-muted-foreground mt-0.5">
                                        {option.description && <p>{option.description}</p>}
                                        {option.availability.disabledReason && (
                                            <p>{option.availability.disabledReason}</p>
                                        )}
                                    </div>
                                )}
                                {details && <div className="pointer-events-auto">{details}</div>}
                            </div>
                        </div>
                    );
                })}
            </RadioGroup>
        </div>
    );
}
