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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FulfillmentOptionDescriptor } from './types';
import { orderFulfillmentOptions } from './use-fulfillment-options';

export interface FulfillmentOptionDropdownProps<OptionId extends string> {
    value: OptionId;
    options: FulfillmentOptionDescriptor<OptionId>[];
    onChange: (value: OptionId) => void;
    renderIcon?: (option: FulfillmentOptionDescriptor<OptionId>) => ReactNode;
    className?: string;
}

export function FulfillmentOptionDropdown<OptionId extends string>({
    value,
    options,
    onChange,
    renderIcon,
    className,
}: FulfillmentOptionDropdownProps<OptionId>) {
    const selectedOption = options.find((option) => option.id === value);

    if (!selectedOption) return null;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'mb-1 w-fit px-2 border-0 bg-muted text-xs font-medium text-foreground flex items-center justify-center gap-1 hover:bg-accent transition-colors',
                        className
                    )}>
                    {renderIcon?.(selectedOption)}
                    <span>{selectedOption.label}</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-0 min-w-[200px]">
                <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as OptionId)}>
                    {orderFulfillmentOptions(options).map((option) => (
                        <DropdownMenuRadioItem
                            key={option.id}
                            value={option.id}
                            disabled={!option.availability.available}
                            className={cn(
                                'flex-row px-4 py-2',
                                value === option.id && 'text-primary font-semibold',
                                !option.availability.available && 'opacity-50'
                            )}>
                            {option.menuLabel ?? option.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
