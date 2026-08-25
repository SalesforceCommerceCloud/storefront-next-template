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
import type { ShopperProducts } from '@/scapi';
import { DynamicImage } from '@/components/dynamic-image';

interface SwatchSectionSummaryProps {
    /** Attribute label, e.g. "Size". */
    label: string;
    /** Display name of the currently selected value, e.g. 'Loveseat (64" W)'. Absent when nothing is selected. */
    selectedName?: string;
    /** The selected value's swatch image, shown as a small thumbnail. Absent ⇒ no thumbnail. */
    image?: ShopperProducts.schemas['Image'];
}

/**
 * Collapsed-summary row for a PDP swatch section wrapped in a `<CollapsibleSection>` — a small
 * selected-value thumbnail beside a two-line label (the attribute name over the selected value name).
 * Mirrors the reference furniture configurator's collapsed step header, minus the step numbering.
 * All elements are inline `<span>`s so it can render inside the native `<summary>`.
 */
export const SwatchSectionSummary = ({ label, selectedName, image }: SwatchSectionSummaryProps) => (
    <span data-slot="swatch-section-summary" className="flex min-w-0 items-center gap-3">
        {image && (
            <span className="relative size-9 shrink-0 overflow-hidden rounded-ui border border-border bg-muted">
                <DynamicImage
                    src={image.disBaseLink || image.link || ''}
                    alt={image.alt || selectedName || label}
                    widths={[36, 48, 72]}
                    className="absolute inset-0 h-full w-full"
                    imageProps={{ className: 'h-full w-full object-cover' }}
                />
            </span>
        )}
        <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-foreground">{label}</span>
            {selectedName && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selectedName}</span>
            )}
        </span>
    </span>
);

SwatchSectionSummary.displayName = 'SwatchSectionSummary';
