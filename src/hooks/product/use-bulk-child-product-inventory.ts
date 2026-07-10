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

import { useEffect, useState, useMemo, useRef } from 'react';
import type { ShopperProducts } from '@/scapi';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useScapiFetcherEffect } from '@/hooks/use-scapi-fetcher-effect';
import type { ChildProductSelection } from '@/lib/product/inventory-utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

interface UseBulkChildProductInventoryProps {
    /** Child product selections containing products and variants to fetch inventory for */
    childSelections: ChildProductSelection[];
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    /** Inventory ID of the selected store (optional - fetches both site and store inventory) */
    inventoryId: string | undefined;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
}

/**
 * Fetches complete inventory data for all child products in a set/bundle using a single bulk API call.
 *
 * This approach mirrors PWA Kit's strategy and is more efficient than fetching each child individually:
 * - Makes ONE API call to fetch all child variants instead of N calls (where N = number of children)
 * - Fetches both site inventory (product.inventory) and store inventory (product.inventories)
 * - Returns enriched child selections with complete inventory data
 *
 * This is necessary because when fetching a parent set/bundle product:
 * 1. Child products in setProducts/bundledProducts arrays don't have site inventory (product.inventory)
 * 2. Child products don't have store inventory (product.inventories array) even when parent is fetched with inventoryIds
 * 3. Variants within child products also lack complete inventory data
 *
 * @param props - Hook configuration
 * @returns Enriched child selections with inventory data and loading state
 *
 * @example
 * ```tsx
 * const enrichedChildSelections = useBulkChildProductInventory({
 *   childSelections: Object.values(childProductSelection),
 *   inventoryId: selectedStore?.inventoryId,
 * });
 * ```
 */
export function useBulkChildProductInventory({
    childSelections,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    inventoryId,
}: UseBulkChildProductInventoryProps): {
    enrichedSelections: ChildProductSelection[];
    isLoading: boolean;
} {
    // Start with null to indicate no enrichment has occurred yet
    const [enrichedSelections, setEnrichedSelections] = useState<ChildProductSelection[] | null>(null);

    // Track the last enriched product IDs and inventoryId to prevent re-enriching the same data
    // We track both because changing inventoryId should trigger re-enrichment with new store inventory
    const lastEnrichedProductIdsRef = useRef<string | null>(null);
    // @sfdc-extension-line SFDC_EXT_BOPIS
    const lastEnrichedInventoryIdRef = useRef<string | undefined>(undefined);

    // Extract all selected variant/product IDs to fetch
    const productIds = useMemo(() => {
        const ids = childSelections
            .map((selection) => {
                // Prefer variant ID if available, otherwise use product ID
                return selection.variant?.productId || selection.product.id;
            })
            .filter(Boolean);

        // Return comma-separated IDs for bulk fetch, or undefined if no IDs
        return ids.length > 0 ? ids.join(',') : undefined;
    }, [childSelections]);

    // Bulk fetch all child variants/products in one API call.
    //
    // NOTE: SCAPI's getProducts caps the `ids` query parameter at 24. This hook issues a single
    // request with no client-side chunking, so a set/bundle with more than 24 distinct selected
    // children exceeds that cap — SCAPI rejects the request (`'ids' violates the value constraint.
    // The expected value is between '(0..24)'`) and the affected children fall back to their
    // un-enriched inventory. Take care not to use this hook for sets/bundles that can select 25+
    // children until the IDs are batched into groups of at most 24.
    const fetcher = useScapiFetcher('shopperProducts', 'getProducts', {
        params: {
            query: {
                // Always provide ids; the load() guard below prevents firing when productIds is undefined
                ids: productIds?.split(',') ?? [],
                // @sfdc-extension-line SFDC_EXT_BOPIS
                ...(inventoryId ? { inventoryIds: [inventoryId] } : {}),
                allImages: false,
            },
        },
    });

    // Trigger the fetch when productIds or inventoryId change
    // This is the standard pattern for triggering fetcher.load() - matches useScapiFetcher examples
    useEffect(() => {
        if (productIds) {
            void fetcher.load();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        productIds,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        inventoryId,
    ]);

    // Handle enrichment when fetch completes successfully
    // Using useScapiFetcherEffect is the recommended pattern for data transformation on success
    useScapiFetcherEffect(fetcher, {
        onSuccess: (fetchedProducts) => {
            // Only enrich if we have data and productIds
            if (!fetchedProducts || !productIds) {
                return;
            }

            // Check if we've already enriched this exact set of product IDs and inventoryId
            // We check both because changing inventoryId should trigger re-enrichment with new store inventory
            if (
                lastEnrichedProductIdsRef.current === productIds &&
                lastEnrichedInventoryIdRef.current === inventoryId
            ) {
                // Already enriched this data, skip to avoid infinite loop
                return;
            }

            // getProducts returns { limit, data: Product[], total }
            // ScapiFetcher unwraps the ApiResponse, so fetchedProducts is the response object
            // We need to access the .data property to get the products array
            const response = fetchedProducts as {
                data: ShopperProducts.schemas['Product'][];
                limit?: number;
                total?: number;
            };
            const productsArray = response?.data || [];

            const newEnrichedSelections = childSelections.map((selection) => {
                const variantId = selection.variant?.productId;
                const productId = selection.product.id;

                /**
                 * Find matching fetched product using multiple strategies:
                 *
                 * Strategy 1: Direct variant ID match
                 * - User selected red variant → we fetched "product-123-red"
                 * - Match: fetchedProduct.id === "product-123-red"
                 *
                 * Strategy 2: Product ID match
                 * - Standard product (no variants) or master product
                 * - Match: fetchedProduct.id === "product-123"
                 *
                 * Strategy 3: Master ID match
                 * - Fetched variant may report its master via product.master.masterId
                 * - Match: fetchedProduct.master.masterId === "product-123"
                 * - This handles cases where API returns variant with master relationship
                 */
                const fetchedProduct = productsArray.find((p: ShopperProducts.schemas['Product']) => {
                    if (variantId && p.id === variantId) return true;
                    if (p.id === productId) return true;
                    if (variantId && p.master?.masterId === productId) return true;
                    return false;
                });

                if (!fetchedProduct) {
                    return selection;
                }

                /**
                 * Enrichment Strategy: Update product object with inventory
                 *
                 * Why enrich product, not variant:
                 * - Centralizes inventory data at the product level for consistency
                 * - Matches Commerce Cloud API response structure
                 * - Fallback pattern in inventory-utils.ts will use: variant.inventory || product.inventory
                 * - Variants within product.variants array may have their own inventory if provided by API
                 *
                 * What we enrich:
                 * - inventory: Site-level inventory (ats, orderable)
                 * - inventories: Array of store-specific inventories (stockLevel, orderable per store)
                 * - variants: Full variants array (may contain inventory for other color/size options)
                 */
                return {
                    ...selection,
                    product: {
                        ...selection.product,
                        // Site inventory: use fetched data if available, otherwise fall back to original
                        inventory: fetchedProduct.inventory || selection.product.inventory,
                        // Store inventory: use fetched data if available, otherwise fall back to original
                        // @sfdc-extension-line SFDC_EXT_BOPIS
                        inventories: fetchedProduct.inventories || selection.product.inventories,
                        // Variants: use fetched product's variants if available (they may have inventory data)
                        variants: fetchedProduct.variants || selection.product.variants,
                    },
                    // Keep selected variant reference as-is
                    // Note: The enriched product.variants array (above) contains variants with inventory data
                    // The fallback logic in inventory-utils.ts uses: variant?.inventory || product.inventory
                    variant: selection.variant,
                };
            });

            setEnrichedSelections(newEnrichedSelections);
            lastEnrichedProductIdsRef.current = productIds;
            // @sfdc-extension-line SFDC_EXT_BOPIS
            lastEnrichedInventoryIdRef.current = inventoryId;
        },
        onError: (errors) => {
            if (errors && errors.length > 0) {
                logger.warn('Failed to fetch bulk child product inventory', { errors: errors.join(', ') });
            }
        },
    });

    /**
     * Merge enriched inventory data with current child selections
     *
     * This ensures quantity changes (and other non-inventory updates) are reflected immediately
     * while enriched inventory data (from API fetch) is preserved.
     *
     * Strategy:
     * - Use enriched inventory data (product.inventory, product.inventories, product.variants)
     * - Use current quantity from childSelections (to reflect picker changes)
     * - Use current variant from childSelections (to reflect swatch changes)
     */
    const finalSelections = useMemo(() => {
        if (!enrichedSelections || enrichedSelections.length === 0) {
            return childSelections.length > 0 ? childSelections : [];
        }

        // Merge: enriched inventory + current quantity/variant
        return childSelections.map((current) => {
            const enriched = enrichedSelections.find((e) => e.product.id === current.product.id);

            if (!enriched) {
                return current;
            }

            return {
                ...enriched,
                quantity: current.quantity, // Always use current quantity from picker
                variant: current.variant, // Always use current variant from selection
            };
        });
    }, [enrichedSelections, childSelections]);

    return {
        enrichedSelections: finalSelections,
        isLoading: fetcher.state === 'loading' || fetcher.state === 'submitting',
    };
}
