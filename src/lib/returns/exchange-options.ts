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

import type { ExchangeVariant, ReturnableLine } from './types';

/**
 * Pure helpers for the exchange picker. Kept out of the component so the "which combinations exist" logic
 * is testable and the component holds no derived state.
 */

const isOrderable = (variant: ExchangeVariant): boolean => variant.orderable;

const matches = (variant: ExchangeVariant, values: Record<string, string>): boolean =>
    Object.entries(values).every(([id, value]) => variant.variationValues[id] === value);

/** The orderable variant with exactly these values, if any. */
export function findVariant(
    variants: readonly ExchangeVariant[],
    values: Record<string, string>
): ExchangeVariant | undefined {
    return variants.find((variant) => isOrderable(variant) && matches(variant, values));
}

/**
 * Applies one picker change and returns a selection that always points at a real orderable variant.
 * If the new value does not exist together with the other current choices (for example size 8 in a colour that
 * is not made in size 8), the other attributes move to the closest variant that has the new value.
 * Returns `null` when no orderable variant has that value at all; callers keep the previous selection.
 */
export function applyVariationChange(
    variants: readonly ExchangeVariant[],
    current: Record<string, string>,
    attributeId: string,
    value: string
): Record<string, string> | null {
    const next = { ...current, [attributeId]: value };
    const exact = findVariant(variants, next);
    if (exact) return { ...exact.variationValues };

    const candidates = variants.filter(
        (variant) => isOrderable(variant) && variant.variationValues[attributeId] === value
    );
    if (candidates.length === 0) return null;

    // Prefer the candidate that keeps the most of the shopper's other choices.
    const score = (variant: ExchangeVariant): number =>
        Object.entries(current).filter(([id, v]) => id !== attributeId && variant.variationValues[id] === v).length;
    const best = candidates.reduce((top, candidate) => (score(candidate) > score(top) ? candidate : top));
    return { ...best.variationValues };
}

/** Values of an attribute that exist in at least one orderable variant, in the order they were given. */
export function getAvailableValues(variants: readonly ExchangeVariant[], attributeId: string): Set<string> {
    const available = new Set<string>();
    for (const variant of variants) {
        const value = variant.variationValues[attributeId];
        if (isOrderable(variant) && value !== undefined) available.add(value);
    }
    return available;
}

/** True when the shopper can swap this line for something else, so the Exchange choice is worth offering. */
export function hasExchangeOptions(line: Pick<ReturnableLine, 'sku' | 'variants'>): boolean {
    return line.variants.some((variant) => isOrderable(variant) && variant.sku !== line.sku);
}
