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
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { RefinementProps } from '../types';

const mapColorNameToHex = (colorName: string): string | null => {
    const colorMap: Record<string, string> = {
        red: '#dc2626',
        blue: '#2563eb',
        green: '#16a34a',
        yellow: '#ca8a04',
        orange: '#ea580c',
        purple: '#9333ea',
        pink: '#db2777',
        brown: '#a16207',
        black: '#000000',
        white: '#ffffff',
        gray: '#6b7280',
        grey: '#6b7280',
        navy: '#1e3a8a',
        beige: '#f5f5dc',
        tan: '#d2b48c',
        gold: '#ffd700',
        silver: '#c0c0c0',
    };

    const normalized = colorName.toLowerCase().trim();
    return colorMap[normalized] || null;
};

const colorOptionButtonClass = cn(
    'flex w-full min-w-0 flex-col items-center gap-2 border-0 bg-transparent p-1 text-center ',
    'whitespace-normal hover:bg-muted/40',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
);

const swatchBaseClass = 'size-8 shrink-0 border rounded-ui';
const swatchSelectedClass = cn(
    swatchBaseClass,
    'border-foreground ring-2 ring-foreground/25 ring-offset-2 ring-offset-background'
);
const swatchUnselectedClass = cn(swatchBaseClass, 'border-border');

const colorLabelBaseClass = 'text-pretty text-sm break-words text-foreground';
const colorLabelSelectedClass = `${colorLabelBaseClass} font-semibold`;
const colorLabelUnselectedClass = `${colorLabelBaseClass} font-medium`;

export default function RefineColor({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
}: RefinementProps): ReactElement {
    return (
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
            {values.map((value) => {
                const color = mapColorNameToHex(value.value) || mapColorNameToHex(value.label || '');
                const isSelected = isFilterSelected(attributeId, value.value);
                const label = value.label || value.value;

                return (
                    <button
                        key={`${attributeId}:${value.value}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleFilter(attributeId, value.value)}
                        className={colorOptionButtonClass}>
                        {/* Swatch only is framed; label sits below with no outer “chip” box */}
                        <div
                            className={isSelected ? swatchSelectedClass : swatchUnselectedClass}
                            style={{ backgroundColor: color ?? 'var(--muted)' }}
                        />

                        <div className="flex w-full min-w-0 flex-col items-center gap-0.5 text-center">
                            <span className={isSelected ? colorLabelSelectedClass : colorLabelUnselectedClass}>
                                {label}
                            </span>
                            {value.hitCount !== undefined && (
                                <span className="text-muted-foreground text-xs">({value.hitCount})</span>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
