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
import { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperProducts } from '@/scapi';
import { isProductSet, isProductBundle, isStandardProduct } from '@/lib/product/product-utils';
import {
    type ChildProductSelection,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    isStoreOutOfStock as storeOutOfStockFor,
    isSiteOutOfStock as siteOutOfStockFor,
} from '@/lib/product/inventory-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { usePickup } from '@/extensions/bopis/context/pickup-context';
import { useBulkChildProductInventory } from './use-bulk-child-product-inventory';

interface ChildProductOrderability {
    [productId: string]: {
        isOrderable: boolean;
        errorMessage?: string;
    };
}

interface UseProductSetsBundlesProps {
    product: ShopperProducts.schemas['Product'];
    initialBundleQuantity?: number;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    /** Selected store inventory ID (for BOPIS) */
    selectedStoreInventoryId?: string;
    /** Basket item pickup store (for edit mode - indicates pickup was previously selected) */
    basketPickupStore?: { inventoryId?: string } | null;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
}

/**
 * Manages child product selections and validation for product sets and bundles.
 *
 * @example Basic usage in ChildProducts component
 * ```tsx
 * const {
 *   comboProduct,
 *   childProductSelection,
 *   selectedBundleQuantity,
 *   areAllChildProductsSelected,
 *   hasUnorderableChildProducts,
 *   handleChildProductValidation,
 *   setChildProductSelection,
 *   setSelectedBundleQuantity,
 *   selectedChildProductCount,
 *   totalChildProducts,
 * } = useProductSetsBundles({
 *   product: parentProduct,
 *   initialBundleQuantity: 2, // Optional - defaults to 1
 * });
 * ```
 *
 * @example Validation and cart operations
 * ```tsx
 * const { handleChildProductValidation, getSelectedChildProducts } =
 *   useProductSetsBundles({ product });
 *
 * const handleAddToCart = async () => {
 *   if (!handleChildProductValidation()) return;
 *   const selectedProducts = getSelectedChildProducts();
 *   await handleProductSetAddToCart(selectedProducts);
 * };
 * ```
 *
 * @example Progress tracking
 * ```tsx
 * const { selectedChildProductCount, totalChildProducts } =
 *   useProductSetsBundles({ product });
 *
 * const progress = `${selectedChildProductCount}/${totalChildProducts} selected`;
 * ```
 *
 * @param props - Configuration object
 * @param props.product - Parent product (set or bundle) from Commerce Cloud
 * @param props.initialBundleQuantity - Initial quantity for bundle (defaults to 1)
 * @param props.selectedStoreInventoryId - Selected store inventory ID (BOPIS)
 * @returns State management, validation, and utility functions
 */
export function useProductSetsBundles({
    product,
    initialBundleQuantity = 1,
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    selectedStoreInventoryId,
    basketPickupStore,
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
}: UseProductSetsBundlesProps) {
    const { t } = useTranslation();
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // Get pickup context to check if pickup is selected for this product
    const pickupContext = usePickup();

    // Check if pickup is selected for this product (bundle/set)
    // This determines which stock level to show in the quantity picker
    // Priority: existing basket item pickup store (basketPickupStore) OR pending pickup selection in context
    const isPickupSelected = useMemo(() => {
        // If basket item already has a pickup store, pickup is selected
        if (basketPickupStore) return true;
        // Otherwise check if there's a pending pickup selection in context
        return pickupContext?.pickupBasketItems?.has(product.id) ?? false;
    }, [basketPickupStore, pickupContext?.pickupBasketItems, product.id]);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Initialize childProductSelection with ALL child products (for sets) or standard products only (for bundles)
    // For sets: we need to track ALL children (even without variant selection) to calculate inventory based on quantities
    // For bundles: only auto-select standard products (products without variants)
    const [childProductSelection, setChildProductSelection] = useState<Record<string, ChildProductSelection>>(() => {
        // Compute normalized product data inside the initializer to ensure it's available
        const normalized =
            isProductASet || isProductABundle ? normalizeSetBundleProduct(product) : { childProducts: [] };
        const childProducts = normalized.childProducts || [];
        const initialSelections: Record<string, ChildProductSelection> = {};

        childProducts.forEach((childProduct) => {
            const isStandard = isStandardProduct(childProduct);

            // For sets: initialize ALL children to track their quantities
            // For bundles: only initialize standard products (auto-select them)
            // Standard products are always initialized since they don't require variant selection
            if (isProductASet || isStandard) {
                initialSelections[childProduct.id] = {
                    product: childProduct,
                    quantity: (childProduct.quantity as number) || 1,
                };
            }
        });

        return initialSelections;
    });

    // Get normalized product data for sets/bundles
    interface NormalizedComboProduct {
        childProducts?: ShopperProducts.schemas['Product'][];
    }

    const [childProductOrderability, setChildProductOrderability] = useState<ChildProductOrderability>({});
    const [selectedBundleQuantity, setSelectedBundleQuantity] = useState(initialBundleQuantity);
    const childProductRefs = useRef<Record<string, globalThis.HTMLElement>>({});

    // Handle child product selection
    const handleChildProductSelection = useCallback((productId: string, selection: ChildProductSelection) => {
        setChildProductSelection((prev) => ({
            ...prev,
            [productId]: selection,
        }));
    }, []);

    // Handle child product orderability
    const handleChildProductOrderability = useCallback(
        (productId: string, orderability: { isOrderable: boolean; errorMessage?: string }) => {
            setChildProductOrderability((prev) => ({
                ...prev,
                [productId]: orderability,
            }));
        },
        []
    );

    // Bulk fetch child product inventory (handles enrichment internally)
    const { enrichedSelections } = useBulkChildProductInventory({
        childSelections: Object.values(childProductSelection),
        // @sfdc-extension-line SFDC_EXT_BOPIS
        inventoryId: selectedStoreInventoryId,
    });

    // Normalized product data with enriched child products (inventory/inventories for pickup orderability)
    const comboProduct: NormalizedComboProduct = useMemo(() => {
        const normalized =
            isProductASet || isProductABundle ? normalizeSetBundleProduct(product) : { childProducts: [] };
        const childProducts = normalized.childProducts || [];
        const enrichedChildProducts = childProducts.map((childProduct) => {
            const enriched = enrichedSelections.find((e) => e.product.id === childProduct.id);
            if (enriched) {
                return {
                    ...childProduct,
                    inventory: enriched.product.inventory || childProduct.inventory,
                    inventories: enriched.product.inventories || childProduct.inventories,
                };
            }
            return childProduct;
        });
        return { childProducts: enrichedChildProducts };
    }, [product, isProductASet, isProductABundle, enrichedSelections]);

    // Validate all child products are selected and orderable
    const validateChildProducts = useCallback(() => {
        const childProducts = comboProduct.childProducts || [];

        for (const childProduct of childProducts) {
            const productId = childProduct.id;
            const selection = childProductSelection[productId];
            const orderability = childProductOrderability[productId];
            const isStandard = isStandardProduct(childProduct);

            // Skip validation for standard products because there are no variants to be selected
            if (isStandard) {
                continue;
            }

            // Check if product is selected
            if (!selection) {
                return {
                    isValid: false,
                    errorMessage: t('product:pleaseSelectOptionsFor', {
                        productName: childProduct.name || 'product',
                    }),
                    firstUnselectedProduct: childProduct,
                };
            }

            // Check if product is orderable
            if (orderability && !orderability.isOrderable) {
                return {
                    isValid: false,
                    errorMessage:
                        orderability.errorMessage ||
                        t('product:productNotOrderable', { productName: childProduct.name || 'product' }),
                    firstUnselectedProduct: childProduct,
                };
            }
        }

        return { isValid: true };
    }, [comboProduct.childProducts, childProductSelection, childProductOrderability, t]);

    // Handle child product validation with scrolling
    const handleChildProductValidation = useCallback(() => {
        const validation = validateChildProducts();

        if (!validation.isValid && validation.firstUnselectedProduct) {
            // Scroll to first unselected product
            const productRef = childProductRefs.current[validation.firstUnselectedProduct.id];
            if (productRef?.scrollIntoView) {
                productRef.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }

            return false;
        }

        return true;
    }, [validateChildProducts]);

    // Get all selected child products for add to cart
    const getSelectedChildProducts = useCallback(() => {
        return Object.values(childProductSelection);
    }, [childProductSelection]);

    // Check if all child products are selected
    const areAllChildProductsSelected = useMemo(() => {
        const childProducts = comboProduct.childProducts || [];
        return childProducts.every((childProduct) => {
            // Simple products are auto-selected, so consider them as selected
            if (isStandardProduct(childProduct)) {
                return true;
            }
            return childProductSelection[childProduct.id];
        });
    }, [comboProduct.childProducts, childProductSelection]);

    // Check if any child product is out of stock or not orderable
    const hasUnorderableChildProducts = useMemo(() => {
        return Object.values(childProductOrderability).some((orderability) => !orderability.isOrderable);
    }, [childProductOrderability]);

    // Calculate inventory for sets/bundles by determining how many complete sets can be made
    // For sets: inventory = minimum of (childStockLevel / childQuantity) across all children
    // For bundles: uses bundle's own inventory (no calculation needed)
    const productWithCalculatedInventory = useMemo(() => {
        if (!isProductASet && !isProductABundle) {
            return product;
        }

        const childProducts = comboProduct.childProducts || [];
        if (childProducts.length === 0) {
            return product;
        }

        // Child products already have enriched inventory from comboProduct
        // For sets, calculate how many complete sets can be made from available child inventory
        // Formula: availableSets = Math.floor(childStockLevel / childQuantity)
        // The set is limited by whichever child runs out first (minimum across all children)
        if (isProductASet) {
            let lowestInventory: ShopperProducts.schemas['Inventory'] | undefined;
            // @sfdc-extension-line SFDC_EXT_BOPIS
            let lowestStoreInventory: ShopperProducts.schemas['Inventory'] | undefined;
            let lowestSiteRatio = Infinity;
            // @sfdc-extension-line SFDC_EXT_BOPIS
            let lowestStoreRatio = Infinity;
            let missingInventory = false;
            // @sfdc-extension-line SFDC_EXT_BOPIS
            let missingStoreInventory = false;

            childProducts.forEach((childProduct) => {
                // Get user-selected quantity from childProductSelection, fall back to product definition quantity
                const selectedChild = childProductSelection[childProduct.id];
                const productQuantity = (childProduct as { quantity?: number }).quantity ?? 1;
                const childQuantity = selectedChild?.quantity ?? productQuantity;

                // Site inventory (ship to home): calculate how many complete sets can be made
                if (!childProduct.inventory) {
                    missingInventory = true;
                } else {
                    const availableSets = calculateAvailableSets(childProduct.inventory, childQuantity);

                    if (availableSets < lowestSiteRatio) {
                        lowestSiteRatio = availableSets;
                        // Create calculated inventory object where stockLevel and ats represent
                        // the number of complete sets available (not individual items)
                        // This allows reuse of standard inventory checking functions with quantity=1
                        lowestInventory = {
                            ...childProduct.inventory,
                            stockLevel: availableSets,
                            ats: availableSets,
                        };
                    }
                }

                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                // Store inventory (BOPIS pickup): calculate how many complete sets can be made
                if (selectedStoreInventoryId) {
                    const childStoreInventory = childProduct.inventories?.find(
                        (inv: ShopperProducts.schemas['Inventory']) => inv.id === selectedStoreInventoryId
                    );
                    if (!childStoreInventory) {
                        missingStoreInventory = true;
                    } else {
                        const availableSets = calculateAvailableSets(childStoreInventory, childQuantity);

                        if (availableSets < lowestStoreRatio) {
                            lowestStoreRatio = availableSets;
                            // Create calculated inventory object where stockLevel represents
                            // the number of complete sets available (not individual items)
                            // This allows reuse of standard inventory checking functions with quantity=1
                            lowestStoreInventory = {
                                ...childStoreInventory,
                                stockLevel: availableSets,
                            };
                        }
                    }
                }
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            });

            // Return product with calculated inventory representing number of complete sets available
            // This calculated product is used by inventory checking functions (isStoreOutOfStock, isSiteOutOfStock)
            return {
                ...product,
                inventory: !missingInventory && lowestInventory ? lowestInventory : product.inventory,
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                inventories:
                    !missingStoreInventory && lowestStoreInventory ? [lowestStoreInventory] : product.inventories,
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            };
        }

        // For bundles, return as-is (bundles use their own inventory)
        return product;
    }, [
        product,
        isProductASet,
        isProductABundle,
        comboProduct.childProducts,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        selectedStoreInventoryId,
        childProductSelection,
    ]);

    // Effective quantity for inventory checks
    //
    // Why sets use quantity=1:
    // - For sets, productWithCalculatedInventory.inventory.stockLevel already represents
    //   "number of complete sets available" (calculated via Math.floor(childStock / childQty))
    // - Example: If we can make 3 complete sets from children, stockLevel = 3
    // - Checking with quantity=1 asks: "can we make at least 1 complete set?"
    // - The UI doesn't allow users to select quantity for sets (each child has its own quantity picker)
    //
    // Why bundles use selectedBundleQuantity:
    // - Bundles have a parent quantity picker (user can select 1, 2, 3, etc bundles)
    // - Bundle inventory comes from the bundle's own inventory field (not calculated from children)
    // - We check if bundle's stockLevel >= selectedBundleQuantity
    const effectiveQuantity = useMemo(() => {
        if (isProductABundle) {
            return selectedBundleQuantity;
        }

        if (isProductASet) {
            // For sets, inventory already represents "number of complete sets available"
            // Always check with quantity=1 to ask: "do we have at least 1 complete set?"
            return 1;
        }

        return 1;
    }, [isProductASet, isProductABundle, selectedBundleQuantity]);

    // Check inventory using the product with calculated inventory
    const {
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isStoreOutOfStock,
        isSiteOutOfStock,
    } = useMemo(() => {
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        const storeOOS = storeOutOfStockFor(
            productWithCalculatedInventory,
            selectedStoreInventoryId,
            effectiveQuantity
        );
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        const siteOOS = siteOutOfStockFor(productWithCalculatedInventory, effectiveQuantity);

        return {
            // @sfdc-extension-line SFDC_EXT_BOPIS
            isStoreOutOfStock: storeOOS,
            isSiteOutOfStock: siteOOS,
        };
    }, [
        productWithCalculatedInventory,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        selectedStoreInventoryId,
        effectiveQuantity,
    ]);

    // Bundle/set is out of stock if BOTH delivery methods are unavailable
    const inventoryAvailability = { isCompletelyOutOfStock: isSiteOutOfStock };
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    inventoryAvailability.isCompletelyOutOfStock = isSiteOutOfStock && isStoreOutOfStock;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const { isCompletelyOutOfStock } = inventoryAvailability;

    // Get the effective stock level and out-of-stock status for the bundle quantity picker
    // These should match the selected delivery method (store vs site)
    // For sets: both return undefined since sets don't have a parent quantity picker
    const bundleStockLevel = useMemo(() => {
        if (!isProductABundle) return undefined;

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        // Use isPickupSelected to determine which inventory to show (consistent with standard products)
        // If pickup is selected AND store inventory exists, use store inventory
        // Otherwise, use site inventory
        if (isPickupSelected && selectedStoreInventoryId) {
            const storeInventory = productWithCalculatedInventory.inventories?.find(
                (inv: ShopperProducts.schemas['Inventory']) => inv.id === selectedStoreInventoryId
            );
            return storeInventory?.stockLevel;
        }
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        // Otherwise use site inventory (ship to home)
        return productWithCalculatedInventory.inventory?.stockLevel;
    }, [
        isProductABundle,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isPickupSelected,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        selectedStoreInventoryId,
        productWithCalculatedInventory,
    ]);

    // Check if bundle is completely out of stock (stockLevel = 0) for the quantity picker
    // This is different from isStoreOutOfStock/isSiteOutOfStock which check stockLevel < quantity
    // For bundles: if store selected, check store inventory; otherwise check site inventory
    // For sets: returns undefined since sets don't have a parent quantity picker
    const bundleOutOfStock = useMemo(() => {
        if (!isProductABundle) return undefined;

        // Get the appropriate stock level based on delivery method
        const stockLevel = bundleStockLevel ?? 0;

        // Only mark as out of stock if there's NO inventory at all
        // The ProductQuantityPicker will show "Only X left" when stockLevel < quantity
        return stockLevel === 0;
    }, [isProductABundle, bundleStockLevel]);

    return {
        // State
        /** Record of selected child products with their variants and quantities */
        childProductSelection,
        /** Record of child product orderability status and error messages */
        childProductOrderability,
        /** Selected quantity for the entire bundle (bundles only) */
        selectedBundleQuantity,
        /** Refs to child product DOM elements for scrolling to validation errors */
        childProductRefs,
        /** Normalized product data containing child products with enriched inventory (for ChildProductCard - ensures pickup orderability) */
        comboProduct,

        // Actions
        /** Updates the selection for a specific child product (used by ChildProductCard) */
        setChildProductSelection: handleChildProductSelection,
        /** Updates the orderability status for a specific child product */
        setChildProductOrderability: handleChildProductOrderability,
        /** Updates the selected quantity for the bundle (bundles only) */
        setSelectedBundleQuantity,
        /** Validates all child products and scrolls to first error if any */
        handleChildProductValidation,

        // Utils
        /** Validates that all child products are selected and orderable */
        validateChildProducts,
        /** Returns array of all selected child products for cart operations */
        getSelectedChildProducts,
        /** Indicates if all required child products have been selected */
        areAllChildProductsSelected,
        /** Indicates if any child product is out of stock or not orderable */
        hasUnorderableChildProducts,

        // Computed values
        /** Number of child products currently selected (used for progress indicator) */
        selectedChildProductCount: Object.values(childProductSelection).filter((selection) => {
            // Count as selected if:
            // 1. It's a standard product (no variants needed), OR
            // 2. A variant has been selected (variant property exists)
            return isStandardProduct(selection.product) || selection.variant;
        }).length,
        /** Total number of child products in the set/bundle (used for progress indicator) */
        totalChildProducts: comboProduct.childProducts?.length || 0,

        /** Indicates if product is completely out of stock (both store and site) */
        isCompletelyOutOfStock,
        /** Product with calculated inventory (for sets/bundles) - use this for delivery options */
        productWithCalculatedInventory,
        /** Effective quantity to check against inventory (max child quantity for sets, bundle quantity for bundles) */
        effectiveQuantity,
        /** Stock level for bundle quantity picker based on selected delivery method (bundles only, undefined for sets) */
        bundleStockLevel,
        /** Out of stock status for bundle quantity picker based on selected delivery method (bundles only, undefined for sets) */
        bundleOutOfStock,
    };
}

/**
 * Helper function to calculate the number of complete sets that can be made from child inventory.
 *
 * @param inventory - The inventory object (site or store) containing stockLevel
 * @param childQuantity - The quantity of this child required for one complete set
 * @returns Number of complete sets that can be made (Math.floor(stockLevel / childQuantity))
 */
function calculateAvailableSets(inventory: ShopperProducts.schemas['Inventory'], childQuantity: number): number {
    const stockLevel = inventory.stockLevel ?? 0;
    return Math.floor(stockLevel / childQuantity);
}

// Helper function to normalize set/bundle product data
function normalizeSetBundleProduct(product: ShopperProducts.schemas['Product']): {
    childProducts: ShopperProducts.schemas['Product'][];
} {
    if (!product.type?.set && !product.type?.bundle) {
        return { childProducts: [] };
    }

    let childProducts: ShopperProducts.schemas['Product'][] = [];

    if (product.type.set && product.setProducts) {
        childProducts = product.setProducts.map((setProduct: ShopperProducts.schemas['Product']) => ({
            ...setProduct,
            quantity: 1,
        }));
    } else if (product.type.bundle && product.bundledProducts) {
        childProducts = product.bundledProducts.map((bundleProduct: ShopperProducts.schemas['BundledProduct']) => ({
            ...bundleProduct.product,
            quantity: bundleProduct.quantity ?? 1,
        }));
    }

    return { childProducts };
}
