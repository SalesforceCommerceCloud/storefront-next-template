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
// @sfdc-extension-line SFDC_EXT_BOPIS
import { usePickupInventory } from '@/extensions/bopis/context/pickup-inventory';

const logger = createLogger();
type InventoryVariant = ShopperProducts.schemas['Variant'] & { inventory?: ShopperProducts.schemas['Inventory'] };

function variantInventory(selection: ChildProductSelection) {
    return (selection.variant as InventoryVariant | undefined)?.inventory;
}

interface UseBulkChildProductInventoryProps {
    /** Child product selections containing products and variants to fetch inventory for */
    childSelections: ChildProductSelection[];
    /** Inventory ID of the selected store (optional - fetches both site and store inventory) */
    inventoryId?: string;
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
    // @sfdc-extension-line SFDC_EXT_BOPIS
    const streamed = usePickupInventory('');

    // Track request scope separately from response identity: returning to a SKU needs fresh inventory.
    const lastEnrichedRequestRef = useRef<string | null>(null);
    const lastResponseRef = useRef<unknown>(null);
    const request = useRef({ key: '', generation: 0 });
    const loadedGeneration = useRef<number | null>(null);
    const enrichedGeneration = useRef<number | null>(null);

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
    const enrichmentRequestKey = JSON.stringify([
        productIds,
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        inventoryId ?? null,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    ]);
    const hasSiteSeeds = childSelections.every((selection) =>
        selection.variant
            ? Boolean(
                  variantInventory(selection) ||
                      (selection.variant.productId === selection.product.id && selection.product.inventory)
              )
            : Boolean(selection.product.inventory)
    );
    // Pending pickup only covers the initial selection, never a later shopper interaction.
    const initialRequestKey = useRef(enrichmentRequestKey);
    const initialProductIds = useRef(productIds);
    const selectionChanged = useRef(false);
    const initialScope = { matches: initialRequestKey.current === enrichmentRequestKey };
    // A current root source already distinguishes its authoritative adoption from local store revisions.
    // @sfdc-extension-line SFDC_EXT_BOPIS
    if (streamed.active) initialScope.matches = streamed.status !== 'stale';
    if (initialProductIds.current !== productIds || !initialScope.matches) selectionChanged.current = true;
    const isInitialSelection = !selectionChanged.current;
    if (request.current.key !== enrichmentRequestKey) {
        request.current = { key: enrichmentRequestKey, generation: request.current.generation + 1 };
    }
    const requestScope = { hasStore: false };
    // @sfdc-extension-line SFDC_EXT_BOPIS
    requestScope.hasStore = Boolean(inventoryId);

    // Bulk fetch all child variants/products in one API call.
    //
    // NOTE: SCAPI's getProducts caps the `ids` query parameter at 24. This hook issues a single
    // request with no client-side chunking, so a set/bundle with more than 24 distinct selected
    // children exceeds that cap — SCAPI rejects the request (`'ids' violates the value constraint.
    // The expected value is between '(0..24)'`) and the affected children fall back to their
    // un-enriched inventory. Take care not to use this hook for sets/bundles that can select 25+
    // children until the IDs are batched into groups of at most 24.
    const fetcherOptions = {
        params: {
            query: {
                // Always provide ids; the load() guard below prevents firing when productIds is undefined
                ids: productIds?.split(',') ?? [],
                // @sfdc-extension-line SFDC_EXT_BOPIS
                ...(inventoryId ? { inventoryIds: [inventoryId] } : {}),
                allImages: false,
            },
        },
    };
    const fetcher = useScapiFetcher('shopperProducts', 'getProducts', fetcherOptions);

    // Trigger the fetch when productIds or inventoryId change
    // This is the standard pattern for triggering fetcher.load() - matches useScapiFetcher examples
    useEffect(() => {
        if (productIds) {
            if (hasSiteSeeds && !requestScope.hasStore && isInitialSelection) return;
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            if (
                streamed.active &&
                isInitialSelection &&
                hasSiteSeeds &&
                (streamed.status === 'pending' ||
                    (streamed.snapshot &&
                        productIds
                            .split(',')
                            .every((id) => streamed.snapshot?.products.some((product) => product.id === id))))
            )
                return;
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
            if (loadedGeneration.current === request.current.generation) return;
            loadedGeneration.current = request.current.generation;
            void fetcher.load();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [
        productIds,
        hasSiteSeeds,
        enrichmentRequestKey,
        isInitialSelection,
        requestScope.hasStore,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        inventoryId,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        streamed.active,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        streamed.status,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        streamed.snapshot,
    ]);

    // Handle enrichment when fetch completes successfully
    // Using useScapiFetcherEffect is the recommended pattern for data transformation on success
    useScapiFetcherEffect(fetcher, {
        onSuccess: (fetchedProducts) => {
            // Only enrich if we have data and productIds
            if (!fetchedProducts || !productIds) {
                return;
            }

            // Check if we've already enriched this exact set of products for this inventory.
            if (lastResponseRef.current === fetchedProducts) {
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
            // useScapiFetcher keys responses by the complete request, including inventoryIds.
            // Missing availability is valid for that request; explicit other-store data is not.
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            if (
                inventoryId &&
                productsArray.some(
                    (product) =>
                        product.inventories?.length && !product.inventories.some((inv) => inv.id === inventoryId)
                )
            )
                return;
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            const newEnrichedSelections = childSelections.map((selection) => {
                const variantId = selection.variant?.productId;
                // Only exact requested SKUs are usable; a sibling sharing the master can be a stale response.
                const fetchedProduct = productsArray.find((p) => p.id === (variantId ?? selection.product.id));

                if (!fetchedProduct) {
                    return selection;
                }
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                const storeInventories = inventoryId
                    ? (fetchedProduct.inventories?.filter((inventory) => inventory.id === inventoryId) ?? [])
                    : fetchedProduct.inventories;
                const inventories =
                    inventoryId && !storeInventories?.length
                        ? [{ id: inventoryId, orderable: false, ats: 0, stockLevel: 0 }]
                        : storeInventories;
                // @sfdc-extension-block-end SFDC_EXT_BOPIS

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
                        inventories,
                        // Variants: use fetched product's variants if available (they may have inventory data)
                        variants: fetchedProduct.variants || selection.product.variants,
                    },
                    // Refresh the exact selected variant too, so a server seed cannot mask interaction data.
                    variant: selection.variant
                        ? {
                              ...selection.variant,
                              inventory: fetchedProduct.inventory,
                              // @sfdc-extension-line SFDC_EXT_BOPIS
                              inventories,
                          }
                        : undefined,
                };
            });

            setEnrichedSelections(newEnrichedSelections);
            lastEnrichedRequestRef.current = enrichmentRequestKey;
            lastResponseRef.current = fetchedProducts;
            enrichedGeneration.current = request.current.generation;
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
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        if (
            streamed.active &&
            isInitialSelection &&
            streamed.snapshot &&
            productIds?.split(',').every((id) => streamed.snapshot?.products.some((product) => product.id === id))
        ) {
            return childSelections.map((selection) => {
                const id = selection.variant?.productId ?? selection.product.id;
                const inventory = streamed.snapshot?.products.find((product) => product.id === id);
                return inventory
                    ? {
                          ...selection,
                          product: {
                              ...selection.product,
                              inventory:
                                  variantInventory(selection) ?? inventory.inventory ?? selection.product.inventory,
                              inventories: inventory.inventories,
                          },
                          variant: selection.variant
                              ? {
                                    ...selection.variant,
                                    inventory: variantInventory(selection) ?? inventory.inventory,
                                    inventories: inventory.inventories,
                                }
                              : undefined,
                      }
                    : selection;
            });
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
        if (!enrichedSelections || enrichedSelections.length === 0) {
            return childSelections.map((selection) =>
                variantInventory(selection)
                    ? {
                          ...selection,
                          product: { ...selection.product, inventory: variantInventory(selection) },
                      }
                    : selection
            );
        }

        // Merge: enriched inventory + current quantity/variant
        return childSelections.map((current) => {
            const enriched =
                lastEnrichedRequestRef.current === enrichmentRequestKey &&
                enrichedGeneration.current === request.current.generation
                    ? enrichedSelections.find(
                          (e) =>
                              e.product.id === current.product.id && e.variant?.productId === current.variant?.productId
                      )
                    : undefined;

            if (!enriched) {
                return current;
            }

            return {
                ...enriched,
                quantity: current.quantity, // Always use current quantity from picker
                variant: current.variant
                    ? {
                          ...current.variant,
                          inventory: variantInventory(enriched),
                          // @sfdc-extension-block-start SFDC_EXT_BOPIS
                          inventories: (
                              enriched.variant as InventoryVariant & {
                                  inventories?: ShopperProducts.schemas['Inventory'][];
                              }
                          )?.inventories,
                          // @sfdc-extension-block-end SFDC_EXT_BOPIS
                      }
                    : undefined,
            };
        });
    }, [
        enrichedSelections,
        childSelections,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        productIds,
        enrichmentRequestKey,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isInitialSelection,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        streamed.active,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        streamed.snapshot,
    ]);

    return {
        enrichedSelections: finalSelections,
        isLoading: fetcher.state === 'loading' || fetcher.state === 'submitting',
    };
}
