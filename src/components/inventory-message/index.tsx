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

import { type ReactElement } from 'react';
import type { ShopperProducts } from '@/scapi';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

export const InventoryStatus = {
    IN_STOCK: 'in-stock',
    LOW_STOCK: 'low-stock',
    PRE_ORDER: 'pre-order',
    BACK_ORDER: 'back-order',
    OUT_OF_STOCK: 'out-of-stock',
    UNKNOWN: 'unknown',
} as const;

export type InventoryStatusType = (typeof InventoryStatus)[keyof typeof InventoryStatus];

interface InventoryMessageProps {
    product: ShopperProducts.schemas['Product'];
    currentVariant?: VariantWithInventory | null;
    className?: string;
    /**
     * Stock level at or below which the item is considered "low stock".
     * When stockLevel > 0 && stockLevel <= lowStockThreshold, shows a warning-colored "Few items left"
     * message ("1 item left" when stockLevel === 1).
     */
    lowStockThreshold?: number;
    /**
     * Whether to show unknown inventory status messages. Defaults to false.
     * When false, unknown status messages are visually hidden.
     */
    showUnknownStatus?: boolean;
    /**
     * Custom function to determine inventory status. If not provided, uses the default logic.
     * This allows customers to implement their own inventory status determination logic.
     * Should return UNKNOWN instead of null when inventory data is unavailable.
     */
    getInventoryStatus?: (
        product: ShopperProducts.schemas['Product'],
        currentVariant?: ShopperProducts.schemas['Variant'] | null
    ) => InventoryStatusType;
}

/**
 * Gets the inventory status based on product/variant data
 */
type VariantWithInventory = ShopperProducts.schemas['Variant'] & {
    inventory?: ShopperProducts.schemas['Inventory'];
};

function getInventoryStatus(
    product: ShopperProducts.schemas['Product'],
    currentVariant?: VariantWithInventory | null,
    lowStockThreshold = 0
): InventoryStatusType {
    // Use variant inventory if available, otherwise use product inventory
    const inventory = currentVariant?.inventory || product.inventory;

    if (!inventory) return InventoryStatus.UNKNOWN;

    const isOrderable = inventory.orderable;
    const stockLevel = inventory.ats || 0;

    if (!isOrderable) {
        return InventoryStatus.OUT_OF_STOCK;
    }

    if (inventory.preorderable) {
        return InventoryStatus.PRE_ORDER;
    }

    if (inventory.backorderable) {
        return InventoryStatus.BACK_ORDER;
    }

    if (stockLevel > 0 && stockLevel <= lowStockThreshold) {
        return InventoryStatus.LOW_STOCK;
    }

    if (stockLevel > 0) {
        return InventoryStatus.IN_STOCK;
    }

    return InventoryStatus.OUT_OF_STOCK;
}

type InventoryStatusInfo = { message: string; className: string };

/**
 * Gets the appropriate message and styling for inventory status.
 *
 * Uses semantic status tokens for consistent theming. Stock levels are bucketed,
 * not surfaced as exact counts — perpetual-inventory items render the same
 * "In stock" message as any other plentiful variant.
 */
function getInventoryMessage(
    status: InventoryStatusType,
    t: TFunction<'product'>,
    stockLevel?: number
): InventoryStatusInfo {
    switch (status) {
        case InventoryStatus.IN_STOCK:
            return {
                message: t('inStock'),
                className: 'text-status-positive',
            };
        case InventoryStatus.LOW_STOCK:
            return {
                message: stockLevel === 1 ? t('oneItemLeft') : t('fewItemsLeft'),
                className: 'text-status-warning',
            };
        case InventoryStatus.PRE_ORDER:
            return {
                message: t('preOrder'),
                className: 'text-status-info',
            };
        case InventoryStatus.BACK_ORDER:
            return {
                message: t('backOrder'),
                className: 'text-status-warning',
            };
        case InventoryStatus.OUT_OF_STOCK:
            return {
                message: t('outOfStockLabel'),
                className: 'text-status-critical',
            };
        case InventoryStatus.UNKNOWN:
        default:
            return {
                message: t('inventory.unavailable'),
                className: 'text-muted-foreground',
            };
    }
}

/**
 * Inventory Message Component
 *
 * Displays inventory status messages for products on the PDP:
 * - In stock: Green message
 * - Few items left / 1 item left: Warning message at low-stock threshold
 * - Pre-order: Blue message
 * - Back order: Orange message
 * - Out of stock: Red message
 */
export default function InventoryMessage({
    product,
    currentVariant,
    className,
    lowStockThreshold = 0,
    showUnknownStatus = false,
    getInventoryStatus: customGetInventoryStatus,
}: InventoryMessageProps): ReactElement {
    const { t } = useTranslation('product');
    const inventory = currentVariant?.inventory || product.inventory;
    const stockLevel = inventory?.ats;

    let status = customGetInventoryStatus
        ? customGetInventoryStatus(product, currentVariant)
        : getInventoryStatus(product, currentVariant, lowStockThreshold);

    const hasVariants = (product.variants?.length ?? 0) > 0;

    if (!customGetInventoryStatus && hasVariants) {
        const awaitingVariant = currentVariant == null;
        const variantResolvedWithoutInventory = currentVariant != null && currentVariant.inventory == null;

        // Hide misleading master "out of stock" until a variant is chosen
        if (awaitingVariant && status === InventoryStatus.OUT_OF_STOCK) {
            status = InventoryStatus.UNKNOWN;
        }

        if (variantResolvedWithoutInventory) {
            if (currentVariant.orderable === false) {
                status = InventoryStatus.OUT_OF_STOCK;
            } else if (currentVariant.orderable === true && status === InventoryStatus.OUT_OF_STOCK) {
                // Master rollup can say OOS while the selected variant is orderable and inventory is not on the variant yet
                status = InventoryStatus.IN_STOCK;
            }
        }
    }

    const statusInfo = getInventoryMessage(status, t, stockLevel);
    const isUnknown = status === InventoryStatus.UNKNOWN;
    const hideContent = isUnknown && !showUnknownStatus;

    // The wrapper is a persistent live region: role="status" (aria-live="polite") stays in the
    // accessibility tree at all times, so the FIRST stock message after variant selection is
    // announced. When the status is unknown and unshown (e.g. a master product before a variant
    // is picked) we render the region empty rather than hiding it, so it is never removed from
    // the a11y tree. aria-atomic makes the whole message read out on each change, not just the diff.
    return (
        <div
            data-slot="inventory-message"
            role="status"
            aria-atomic="true"
            className={cn('flex items-center gap-2', className)}>
            {!hideContent && (
                <>
                    <span
                        aria-hidden="true"
                        className={cn('h-2 w-2 shrink-0 rounded-full bg-current', statusInfo.className)}
                    />
                    <p className={cn('text-sm font-medium', statusInfo.className)}>
                        <span className="sr-only">
                            {status === InventoryStatus.IN_STOCK && t('inventory.srPrefix.inStock')}
                            {status === InventoryStatus.LOW_STOCK && t('inventory.srPrefix.lowStock')}
                            {status === InventoryStatus.OUT_OF_STOCK && t('inventory.srPrefix.outOfStock')}
                            {status === InventoryStatus.PRE_ORDER && t('inventory.srPrefix.preOrder')}
                            {status === InventoryStatus.BACK_ORDER && t('inventory.srPrefix.backOrder')}
                        </span>
                        {statusInfo.message}
                    </p>
                </>
            )}
        </div>
    );
}
