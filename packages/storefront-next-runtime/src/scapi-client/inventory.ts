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
import type { Clients } from './createClients';
import type { InventoryRecord } from './inventory-stock';

export { hasInventoryStock, hasUsableInventoryStock, type InventoryRecord } from './inventory-stock';

/**
 * Read one explicit inventory list without modifying Shopper Context. API failures propagate.
 * Missing products/records stay absent; a response for another list is a configuration error.
 * Native invalid-list responses can omit inventories even though the schema requires the field.
 * Batches respect the native 24-product limit with at most four requests in flight.
 */
export async function fetchInventoryRecords(
    client: Clients['shopperAvailability'],
    productIds: string[],
    inventoryId: string
): Promise<Map<string, InventoryRecord>> {
    if (!inventoryId.trim() || inventoryId.length > 256 || /[,|\r\n]/.test(inventoryId)) {
        throw new TypeError('INVALID_INVENTORY_LIST');
    }
    const ids = [...new Set(productIds)];
    const records = new Map<string, InventoryRecord>();
    for (let start = 0; start < ids.length; start += 24 * 4) {
        const batches: string[][] = [];
        for (let offset = start; offset < Math.min(ids.length, start + 24 * 4); offset += 24) {
            batches.push(ids.slice(offset, offset + 24));
        }
        const responses = await Promise.all(
            batches.map((batch) =>
                client.getAvailability({ params: { query: { productIds: batch, inventoryIds: [inventoryId] } } })
            )
        );
        for (const { data } of responses) {
            // Native responses omit data when every requested product is offline or absent.
            // Accept only the explicit zero-result shape; malformed responses remain errors.
            if (data.data === undefined && data.total === 0 && data.limit === 0) continue;
            if (!Array.isArray(data.data)) throw new TypeError('INVALID_INVENTORY_RESPONSE');
            for (const product of data.data) {
                // The availability endpoint omits this field for an unknown list. Do not
                // coerce that response to missing stock or use the product API's site fallback.
                if (!Array.isArray(product.inventories)) throw new TypeError('INVALID_INVENTORY_LIST');
                if (product.inventories.some((inventory) => inventory.id !== inventoryId)) {
                    throw new TypeError('UNEXPECTED_INVENTORY_LIST');
                }
                const inventory = product.inventories.find((entry) => entry.id === inventoryId);
                if (inventory) records.set(product.id, inventory);
            }
        }
    }
    return records;
}

/** Invalid or unrepresentable consumption; distinct from missing stock and API failures. */
export class InventoryQuantityError extends TypeError {
    constructor() {
        super('INVALID_INVENTORY_QUANTITY');
        this.name = 'InventoryQuantityError';
    }
}

function inventoryDecimal(quantity: number): { units: bigint; scale: number } {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
        throw new InventoryQuantityError();
    }
    const [significand, exponent = '0'] = quantity.toString().split('e');
    const [whole, fraction = ''] = significand.split('.');
    return { units: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

/**
 * Multiply component consumption or rescale a native child total to a new parent quantity.
 * Keep the decimal operands exact through multiplication/division, then convert once to the
 * numeric API representation. Never clamp fractional parent quantities or apply a stock epsilon.
 */
export function scaleInventoryQuantity(quantity: number, multiplier: number, divisor = 1): number {
    const first = inventoryDecimal(quantity);
    const second = inventoryDecimal(multiplier);
    const third = inventoryDecimal(divisor);
    const scale = first.scale + second.scale - third.scale;
    const numerator = first.units * second.units * 10n ** BigInt(Math.max(0, -scale));
    const denominator = third.units * 10n ** BigInt(Math.max(0, scale));
    // Round the exact ratio to binary64's 53-bit significand (ties to even). Clamp the
    // unit exponent for subnormals, whose spacing is always 2^-1074. This avoids an
    // arbitrary decimal precision or a second rounding through Number(numerator).
    let exponent = numerator.toString(2).length - denominator.toString(2).length;
    if (exponent >= 0 ? numerator < denominator << BigInt(exponent) : numerator << BigInt(-exponent) < denominator) {
        exponent--;
    }
    const unitExponent = Math.max(exponent - 52, -1074);
    const dividend = unitExponent < 0 ? numerator << BigInt(-unitExponent) : numerator;
    const divisorUnits = unitExponent > 0 ? denominator << BigInt(unitExponent) : denominator;
    let significand = dividend / divisorUnits;
    const twiceRemainder = (dividend % divisorUnits) * 2n;
    if (twiceRemainder > divisorUnits || (twiceRemainder === divisorUnits && significand % 2n === 1n)) {
        significand++;
    }
    const result = Number(significand) * 2 ** unitExponent;
    if (!Number.isFinite(result) || result <= 0) throw new InventoryQuantityError();
    return result;
}

/**
 * Aggregate consumption of a SKU across lines/options. Callers supply total component quantities.
 * Sum decimal quantities before converting back to a number so duplicate fractional units do not
 * exceed exact stock through binary addition (for example, 0.1 + 0.2 against stock 0.3).
 */
export function aggregateInventoryQuantities(
    lines: ReadonlyArray<{ productId?: string; quantity?: number }>
): Map<string, number> {
    const quantities = new Map<string, { units: bigint; scale: number }>();
    for (const line of lines) {
        const quantity = line.quantity;
        if (!line.productId || quantity === undefined) throw new InventoryQuantityError();
        const { units: nextUnits, scale } = inventoryDecimal(quantity);
        const previous = quantities.get(line.productId) ?? { units: 0n, scale: 0 };
        const commonScale = Math.max(previous.scale, scale);
        const units =
            previous.units * 10n ** BigInt(commonScale - previous.scale) +
            nextUnits * 10n ** BigInt(commonScale - scale);
        quantities.set(line.productId, { units, scale: commonScale });
    }
    const result = new Map<string, number>();
    for (const [productId, { units, scale }] of quantities) {
        const total = Number(`${units}e${-scale}`);
        if (!Number.isFinite(total)) throw new InventoryQuantityError();
        result.set(productId, total);
    }
    return result;
}
