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
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFetcher, useLocation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { useTranslation } from 'react-i18next';
import type { ShopperProducts, ShopperBasketsV2 } from '@/scapi';
import { useToast } from '@/components/toast';
import { resourceRoutes } from '@/route-paths';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { usePickup } from '@/extensions/bopis/context/pickup-context';
import { getStoreIdForBasketItem } from '@/extensions/bopis/lib/basket-utils';
import { isSelectedDeliveryOptionValid } from '@/extensions/bopis/lib/product-actions';
import { getPickupStoreFromMap } from '@/extensions/bopis/lib/store-utils';
// @sfdc-extension-block-end SFDC_EXT_BOPIS
import { useBasket, useBasketUpdater } from '@/providers/basket';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';
import { useItemFetcher } from '@/hooks/use-item-fetcher';
import { isProductSet, isProductBundle } from '@/lib/product/product-utils';
import { hasPurchasablePrice } from '@/lib/product/price-utils';
import { useAnalytics } from '../use-analytics';
import {
    getEffectiveStockLevel,
    getEffectiveInventory,
    isInStock as isProductInStock,
} from '@/lib/product/inventory-utils';
interface ProductSelectionValues {
    product: ShopperProducts.schemas['Product'];
    variant?: ShopperProducts.schemas['Variant'];
    quantity: number;
}

interface UseProductActionsProps {
    product: ShopperProducts.schemas['Product'];
    isChildProduct?: boolean;
    /** Current variant (null/undefined if no variant selected) - optional, defaults to undefined */
    currentVariant?: ShopperProducts.schemas['Variant'] | null | undefined;
    initialQuantity?: number;
    maxQuantity?: number; // Max quantity allowed (for bonus products, etc.)
    itemId?: string; // Cart item ID for update operations
    skipInventoryValidation?: boolean; // Skip inventory/orderable validation in canAddToCart (for wishlist)
    /**
     * Skip the price-availability check in `canAddToCart`. By default a product with no price for
     * the active currency cannot be added to cart (an explicit price of 0 is still allowed). Set
     * this to `true` for items that are intentionally free and priced elsewhere — e.g. promotional
     * bonus products, or bundle children that are charged at the parent bundle price.
     */
    allowMissingPrice?: boolean;
}

/**
 * Manages cart operations, inventory validation, and loading states for products.
 * Internally determines the current variant based on URL parameters and manages quantity state.
 *
 * @example Basic usage in ProductInfo
 * ```tsx
 * const {
 *   isAddingToOrUpdatingCart,
 *   canAddToCart,
 *   handleAddToCart,
 *   quantity,
 *   setQuantity,
 * } = useProductActions({
 *   product,
 * });
 *
 * // Simple call - no parameters needed!
 * await handleAddToCart();
 * ```
 *
 * @example Product sets and bundles
 * ```tsx
 * const { handleProductSetAddToCart, handleProductBundleAddToCart } =
 *   useProductActions({ product: parentProduct });
 *
 * await handleProductSetAddToCart(selectedProducts);
 * await handleProductBundleAddToCart(quantity, childSelections);
 * ```
 *
 * @param props - Configuration object
 * @param props.product - Product data from Commerce Cloud
 * @param props.isChildProduct - Whether this is a child product (for sets/bundles). Defaults to false.
 * @param props.currentVariant - Current variant (null/undefined if no variant selected) - optional, defaults to undefined
 * @returns State, validation flags, and action handlers
 */
export function useProductActions({
    product,
    isChildProduct: _isChildProduct = false,
    currentVariant,
    initialQuantity,
    maxQuantity,
    itemId,
    skipInventoryValidation = false,
    allowMissingPrice = false,
}: UseProductActionsProps) {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);

    const [isAddingToOrUpdatingCart, setIsAddingToOrUpdatingCart] = useState(false);
    const hasHandledWishlistResponseRef = useRef(false);
    const [quantity, setQuantity] = useState(initialQuantity ?? 1);

    // @sfdc-extension-line SFDC_EXT_BOPIS
    const pickupContext = usePickup();

    // Get basket data for update operations.
    // Auto-load is only required in edit mode (itemId present): we need the full basket to look up the existing item,
    // its pickup store, and the current bundle child items. In add mode, the server action is the authoritative source
    // for delivery-option/BOPIS validation, so we don't need to trigger a basket fetch on PDP mount.
    const basket = useBasket({ autoLoad: itemId !== undefined });
    const basketProductItems = basket?.productItems || [];

    // Toast notifications
    const { addToast } = useToast();
    const cartFetcher = useItemFetcher({ itemId, componentName: 'product-cart-actions' });
    const multipleItemsFetcher = useFetcher();
    const bundleFetcher = useItemFetcher({ itemId, componentName: 'product-bundle-actions' });
    const wishlistFetcher = useFetcher();
    const analytics = useAnalytics();

    // Get product ID for pickup store check
    const productId = currentVariant?.productId || product.id;

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    // Get pickup store for this basket item (if in edit mode with itemId)
    const basketPickupStore = useMemo(() => {
        const pickupStoreId = getStoreIdForBasketItem(basket, itemId);
        return getPickupStoreFromMap(pickupStoreId, pickupContext?.pickupStores);
    }, [basket, itemId, pickupContext?.pickupStores]);

    // Check if pickup is selected for this product
    // Priority: existing basket item pickup store (basketPickupStore) OR pending pickup selection in context
    // Pickup is stored by product.id (master) in DeliveryOptions; for variants, also check product.id
    const isPickupSelected = useMemo(() => {
        if (basketPickupStore) return true;
        const items = pickupContext?.pickupBasketItems;
        if (!items) return false;
        return items.has(productId) || items.has(product.id);
    }, [basketPickupStore, pickupContext?.pickupBasketItems, productId, product.id]);

    // Calculate store inventory ID based on delivery option
    // Priority: existing basket item pickup store (basketPickupStore) OR pending pickup selection in context
    const storeInventoryId = useMemo(() => {
        if (!isPickupSelected) return undefined;
        if (basketPickupStore?.inventoryId) return basketPickupStore.inventoryId;
        const pickupInfo =
            pickupContext?.pickupBasketItems?.get(productId) ?? pickupContext?.pickupBasketItems?.get(product.id);
        return pickupInfo?.inventoryId;
    }, [isPickupSelected, basketPickupStore, pickupContext?.pickupBasketItems, productId, product.id]);
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    // Inventory and stock calculations - considers delivery option, store/site inventory, and variant
    const actualStockLevel = useMemo(() => {
        return getEffectiveStockLevel({
            product,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            isPickup: isPickupSelected,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storeInventoryId,
            variant: currentVariant,
        });
    }, [
        product,
        currentVariant,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isPickupSelected,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        storeInventoryId,
    ]);

    // Imperative setter to write a mutation's returned basket into BasketProvider; the cart-mutation
    // effects below call it with each action response's `basket` so useBasket() consumers stay in sync.
    const updateBasket = useBasketUpdater();

    const isInStock = useMemo(() => {
        return isProductInStock({
            product,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            isPickup: isPickupSelected,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storeInventoryId,
            quantity,
            variant: currentVariant,
        });
    }, [
        product,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isPickupSelected,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        storeInventoryId,
        quantity,
        currentVariant,
    ]);

    /** Master inventory is not a reliable OOS signal until a variant is resolved (also avoids flash during URL/swatches updates). */
    const isAwaitingVariantSelection = useMemo(
        () => (product.variants?.length ?? 0) > 0 && currentVariant == null,
        [product.variants?.length, currentVariant]
    );

    const isOutOfStock = !isInStock && !isAwaitingVariantSelection;

    // Check if product is a master or variant product (has variation attributes like size, color)
    const isMasterOrVariantProduct = product?.type?.master === true || product?.type?.variant === true;

    // Helper to get product ID from either Variant (has productId) or Product (has id)
    const getProductId = (
        item: ShopperProducts.schemas['Variant'] | ShopperProducts.schemas['Product'] | null | undefined
    ): string | undefined => {
        if (!item) return undefined;
        if ('productId' in item && typeof item.productId === 'string') return item.productId;
        if ('id' in item && typeof item.id === 'string') return item.id;
        return undefined;
    };

    const unfulfillable = isProductASet
        ? // There is no quantity for product set. Shoppers choose the quantity for each _child_ products instead
          !isInStock
        : actualStockLevel > 0 && actualStockLevel < quantity;

    // Get effective inventory (store or site) for orderable/backorderable checks
    // This considers the selected delivery option (pickup vs delivery)
    const effectiveInventory = useMemo(() => {
        return getEffectiveInventory({
            product,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            isPickup: isPickupSelected,
            // @sfdc-extension-line SFDC_EXT_BOPIS
            storeInventoryId,
            variant: currentVariant,
        });
    }, [
        product,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        isPickupSelected,
        // @sfdc-extension-line SFDC_EXT_BOPIS
        storeInventoryId,
        currentVariant,
    ]);

    /**
     * Is the current selection orderable right now based purely on inventory/stock?
     *
     * Unlike `canAddToCart`, this signal is independent of variant selection, quantity
     * validity, or other full-validation concerns — it only reflects whether the effective
     * inventory (store or site, depending on delivery option) says the item can be ordered
     * (either in stock and orderable, or backorderable).
     *
     * Intended for callers that want to render a dedicated "Out of stock" state
     * (e.g., a disabled button on a wishlist row) separately from the full add-to-cart flow.
     */
    const isOrderable = useMemo(() => {
        return Boolean(effectiveInventory?.orderable || effectiveInventory?.backorderable);
    }, [effectiveInventory]);

    /**
     * Whether the selected product/variant has a usable price for the active currency.
     * A product with no price-book entry for the currency has no price (SCAPI omits the field),
     * which is distinct from a deliberate price of 0 — the former is not purchasable, the latter is.
     *
     * Bypassed when:
     * - `allowMissingPrice` is set (e.g. promotional bonus products), or
     * - `itemId` is set (edit mode for an item already in the basket): the line was already
     *   purchased and editing quantity / variant must not depend on a current catalog price,
     *   which can disappear if the shopper switches to a currency with no price book for it.
     */
    const hasPrice = useMemo(
        // `Boolean(itemId)` (not `itemId != null`): the upstream guards in cart-item-modal use
        // truthy checks, and other callers in the repo defensively pass `itemId || ''`. Without
        // this, an empty string would silently bypass the gate.
        () => allowMissingPrice || Boolean(itemId) || hasPurchasablePrice(product, currentVariant),
        [allowMissingPrice, itemId, product, currentVariant]
    );

    // Can add to cart validation - defaults to false, only true when explicitly allowed
    const canAddToCart = useMemo(() => {
        // A product with no price for the active currency cannot be purchased (an explicit 0 can).
        if (!hasPrice) return false;

        // Skip inventory/orderable validation if requested (for wishlist use case)
        // For wishlist, check quantity > 0 and variant selection (if needed), but ignore stock levels
        if (skipInventoryValidation) {
            if (quantity <= 0) return false;

            // Master/variant products still need a variant selected
            if (isMasterOrVariantProduct && !currentVariant) return false;

            return true;
        }

        // Quantity must be valid
        // For bonus products with maxQuantity, use that instead of actualStockLevel
        const maxAllowed = maxQuantity !== undefined ? maxQuantity : actualStockLevel;
        // actualStockLevel is always a number (defaults to 0 if no inventory)
        const hasValidQuantity = quantity > 0 && maxAllowed >= 0 && quantity <= maxAllowed;

        if (!hasValidQuantity) return false;

        // item must be in stock for order
        // remove if your merchandise does not have inventory
        if (!isInStock) return false;

        // For master/variant products (e.g., t-shirt with color/size)
        // Must have a variant selected and it must be orderable from effective inventory (store or site)
        // effectiveInventory considers the selected delivery option (pickup vs delivery)
        if (isMasterOrVariantProduct) {
            // Master products cannot be added to cart without a variant selection
            if (!currentVariant) return false;

            // Variant must be orderable from effective inventory (store or site)
            return effectiveInventory?.orderable === true;
        }

        // For standard products (non-variant, non-set, non-bundle)
        // Must be orderable/back-order from effective inventory (store or site) and in stock
        if (
            !isProductASet &&
            !isProductABundle &&
            (effectiveInventory?.orderable || effectiveInventory?.backorderable)
        ) {
            return true;
        }

        // For sets/bundles - must be orderable from effective inventory
        // isInStock takes child product inventory data into account
        if (
            (isProductASet || isProductABundle) &&
            (effectiveInventory?.orderable || effectiveInventory?.backorderable)
        ) {
            return true;
        }
        // Default: not allowed
        return false;
    }, [
        hasPrice,
        quantity,
        maxQuantity,
        actualStockLevel,
        currentVariant,
        isInStock,
        effectiveInventory,
        isMasterOrVariantProduct,
        isProductASet,
        isProductABundle,
        skipInventoryValidation,
    ]);

    // Handle successful cart updates
    useEffect(() => {
        if (!isAddingToOrUpdatingCart) {
            // Prevent toast fatigue
            return;
        }
        if (cartFetcher.data?.success && cartFetcher.data.basket) {
            const basketData = cartFetcher.data?.basket as unknown as ShopperBasketsV2.schemas['Basket'];
            // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
            // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
            // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
            updateBasket(basketData);

            setIsAddingToOrUpdatingCart(false);
            // Only open mini cart for add to cart action, not edit cart
            if (!itemId) {
                setMiniCartOpen(true);
            }
        } else if (cartFetcher.data?.success === false) {
            // Show error toast for both add and edit mode
            const errorMessage = itemId
                ? t('product:failedToUpdateCart', { error: cartFetcher.data.error?.message })
                : t('product:failedToAddToCart', { error: cartFetcher.data.error?.message });
            addToast(errorMessage, 'error');
            setIsAddingToOrUpdatingCart(false);
        }
        //As addToast, setIsAddingToOrUpdatingCart are unlikely to change, we don't need to include them in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddingToOrUpdatingCart, cartFetcher.data, product.name, itemId]);

    useEffect(() => {
        if (!isAddingToOrUpdatingCart) {
            // Prevent toast fatigue
            return;
        }
        if (multipleItemsFetcher.data?.success && multipleItemsFetcher.data.basket) {
            const basketData = multipleItemsFetcher.data?.basket as unknown as ShopperBasketsV2.schemas['Basket'];
            // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
            // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
            // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
            updateBasket(basketData);
            setIsAddingToOrUpdatingCart(false);
            setMiniCartOpen(true);
        } else if (multipleItemsFetcher.data?.success === false) {
            addToast(t('product:failedToAddItemsToCart', { error: multipleItemsFetcher.data.error?.message }), 'error');
            setIsAddingToOrUpdatingCart(false);
        }
        //As addToast, setIsAddingToOrUpdatingCart are unlikely to change, we don't need to include them in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddingToOrUpdatingCart, multipleItemsFetcher.data]);

    useEffect(() => {
        if (!isAddingToOrUpdatingCart) {
            // Prevent toast fatigue
            return;
        }
        if (bundleFetcher.data?.success && bundleFetcher.data.basket) {
            const basketData = bundleFetcher.data?.basket as unknown as ShopperBasketsV2.schemas['Basket'];
            // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
            // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
            // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
            updateBasket(basketData);
            setIsAddingToOrUpdatingCart(false);
            setMiniCartOpen(true);
        } else if (bundleFetcher.data?.success === false) {
            addToast(t('product:failedToAddBundleToCart', { error: bundleFetcher.data.error?.message }), 'error');
            setIsAddingToOrUpdatingCart(false);
        }
        //As addToast, setIsAddingToOrUpdatingCart are unlikely to change, we don't need to include them in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddingToOrUpdatingCart, bundleFetcher.data]);

    // Handle wishlist fetcher response (for both direct clicks and component-executed pending actions)
    useEffect(() => {
        // Check if this is a pending action (from URL params)
        const urlParams = new URLSearchParams(location.search);
        const urlAction = urlParams.get('action');
        const isPendingAction = urlAction === 'addToWishlist';

        // Only handle responses when fetcher is idle and we have data
        if (wishlistFetcher.state !== 'idle' || !wishlistFetcher.data) {
            // Reset flag when fetcher starts a new request
            if (wishlistFetcher.state === 'submitting') {
                hasHandledWishlistResponseRef.current = false;
            }
            return;
        }

        // Prevent handling the same response multiple times
        if (hasHandledWishlistResponseRef.current) {
            return;
        }

        const result = wishlistFetcher.data as
            | {
                  success: boolean;
                  error?: { code: string; message: string };
                  alreadyInWishlist?: boolean;
              }
            | undefined;

        if (result?.success) {
            hasHandledWishlistResponseRef.current = true;

            // If this was a pending action, clear URL params after successful execution
            if (isPendingAction) {
                void navigate(location.pathname, { replace: true });
            }

            if (result.alreadyInWishlist) {
                addToast(
                    t('product:alreadyInWishlist', { productName: product.name || t('common:product') }) ||
                        t('product:itemAlreadyInWishlist'),
                    'info'
                );
            } else {
                addToast(
                    t('product:addedToWishlist', { productName: product.name || t('common:product') }) ||
                        t('product:addedToWishlistGeneric'),
                    'success'
                );
            }
        } else if (result?.success === false || result?.error) {
            hasHandledWishlistResponseRef.current = true;

            // If this was a pending action, clear URL params even on error
            if (isPendingAction) {
                void navigate(location.pathname, { replace: true });
            }

            addToast(t('product:failedToAddProductToWishlist'), 'error');
        }
        //As addToast, navigate are unlikely to change, we don't need to include them in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [wishlistFetcher.data, wishlistFetcher.state, product.name, location.pathname, location.search]);

    // Handle adding to cart
    const handleAddToCart = useCallback(async () => {
        if (isAddingToOrUpdatingCart || !canAddToCart) {
            return;
        }

        // Remember: not all products have variation attributes, so `product` in this case could be a standard product
        const productToAdd = isMasterOrVariantProduct ? currentVariant : product;
        const itemProductId = getProductId(productToAdd);
        const price = productToAdd?.price;

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        // Pickup is stored by product.id (master) in DeliveryOptions; for variants, lookup by variant id may miss.
        const pickupInfo =
            pickupContext?.pickupBasketItems?.get(itemProductId ?? '') ??
            (product.id !== itemProductId ? pickupContext?.pickupBasketItems?.get(product.id) : undefined);
        const storeId = pickupInfo?.storeId ?? null;

        // Opportunistic client-side validation: when the basket is already hydrated (e.g., the shopper opened the
        // mini-cart earlier), short-circuit a network round-trip and surface the localized conflict toast right away.
        // The cart-item-add server action remains authoritative — it re-validates against the server-side basket and
        // returns CONFLICT if the basket was undefined here.
        if (!isSelectedDeliveryOptionValid(basket, storeId, addToast)) return;
        // @sfdc-extension-block-end SFDC_EXT_BOPIS

        // Validate inputs
        if (!itemProductId || quantity <= 0) {
            addToast(t('product:failedToAddProductToCart'), 'error');
            return;
        }

        setIsAddingToOrUpdatingCart(true);

        try {
            // @sfdc-extension-line SFDC_EXT_BOPIS
            const inventoryId = pickupInfo?.inventoryId ?? null;

            const productItem = {
                productId: itemProductId,
                quantity,
                price,
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                inventoryId,
                storeId,
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            };

            // Use server action to add item to cart
            await cartFetcher.submit(
                { productItem: JSON.stringify(productItem) },
                {
                    method: 'POST',
                    action: resourceRoutes.cartItemAdd,
                }
            );

            // Track cart item add
            void analytics.trackCartItemAdd({
                cartItems: [productItem as ShopperBasketsV2.schemas['ProductItem']],
            });
        } catch {
            setIsAddingToOrUpdatingCart(false);
            addToast(t('product:failedToAddProductToCart'), 'error');
        }
    }, [
        product,
        quantity,
        isMasterOrVariantProduct,
        currentVariant,
        isAddingToOrUpdatingCart,
        canAddToCart,
        cartFetcher,
        addToast,
        analytics,
        t,
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        basket,
        pickupContext,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    ]);

    /**
     * Generic helper to create product action handlers
     * Abstracts common pattern: validate product, set loading state, submit to action route
     */
    const createProductActionHandler = useCallback(
        <TParams extends Record<string, unknown> = Record<string, unknown>>(config: {
            actionRoute: string;
            isLoading?: boolean;
            setLoading?: (loading: boolean) => void;
            fetcher: ReturnType<typeof useFetcher>;
            errorMessage: string;
            buildFormData: (params: TParams) => FormData | Record<string, string>;
            actionName?: string; // For debug logging
        }) => {
            return async (
                selectedVariant?: ShopperProducts.schemas['Variant'],
                additionalParams?: Partial<TParams>
            ) => {
                const { actionRoute, isLoading, setLoading, fetcher, errorMessage, buildFormData } = config;

                if (isLoading) {
                    return;
                }

                // Prefer variant if available, otherwise fall back to master product ID
                // Let the API decide if master products are allowed
                const productToAdd = isMasterOrVariantProduct ? selectedVariant || currentVariant : product;
                const itemProductId = getProductId(productToAdd) || product.id;

                if (!itemProductId) {
                    addToast(errorMessage, 'error');
                    return;
                }

                setLoading?.(true);

                try {
                    const params = { productId: itemProductId, ...additionalParams } as unknown as TParams;
                    const formData = buildFormData(params);
                    await fetcher.submit(formData, {
                        method: 'POST',
                        action: actionRoute,
                    });
                    // Note: fetcher.data may not be immediately available after submit()
                    // Response handling should be done in a useEffect that watches fetcher.state
                } catch {
                    setLoading?.(false);
                    addToast(errorMessage, 'error');
                }
            };
        },
        [product, isMasterOrVariantProduct, currentVariant, addToast]
    );

    // Handle adding to wishlist. Guests are allowed: SCAPI accepts the gcid token
    // for product-list mutations, and the action route already rejects sessions
    // without a customerId as NOT_AUTHENTICATED.
    const handleAddToWishlist = useMemo(
        () =>
            createProductActionHandler<{ productId: string }>({
                actionRoute: resourceRoutes.wishlistAdd,
                fetcher: wishlistFetcher,
                errorMessage: t('product:failedToAddProductToWishlist'),
                buildFormData: (params) => ({ productId: String(params.productId) }),
                actionName: 'handleAddToWishlist',
            }),
        [createProductActionHandler, wishlistFetcher, t]
    );

    // Handle product set add to cart (multiple products)
    const handleProductSetAddToCart = useCallback(
        async (productSelections: ProductSelectionValues[]) => {
            if (isAddingToOrUpdatingCart) return;

            // Validate inputs
            if (!productSelections || productSelections.length === 0) {
                addToast(t('product:failedToAddItemsToCartError'), 'error');
                return;
            }

            const productItems = productSelections.map((selection) => {
                const selectionProductId = selection.variant?.productId || selection.product.id;
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                // Pickup can be stored by: (1) variant id, (2) master product id (per-child DeliveryOptions),
                // or (3) parent set product id (set-level DeliveryOptions). Try all.
                const pickupInfo =
                    pickupContext?.pickupBasketItems?.get(selectionProductId) ??
                    (selection.product.id !== selectionProductId
                        ? pickupContext?.pickupBasketItems?.get(selection.product.id)
                        : undefined) ??
                    pickupContext?.pickupBasketItems?.get(product.id);
                const inventoryId = pickupInfo?.inventoryId ?? null;
                const storeId = pickupInfo?.storeId ?? null;
                // @sfdc-extension-block-end SFDC_EXT_BOPIS

                return {
                    productId: selectionProductId,
                    quantity: selection.quantity,
                    price: selection.variant?.price || selection.product.price,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    inventoryId,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    storeId,
                };
            });

            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            // Opportunistic client-side validation: see handleAddToCart for rationale.
            // A set's pickup items must share a single store, so the first non-null storeId is sufficient.
            const setStoreId = productItems.find((item) => item.storeId)?.storeId ?? null;
            if (!isSelectedDeliveryOptionValid(basket, setStoreId, addToast)) return;
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            setIsAddingToOrUpdatingCart(true);

            try {
                // Use server action to add multiple items to cart
                await multipleItemsFetcher.submit(
                    { productItems: JSON.stringify(productItems) },
                    {
                        method: 'POST',
                        action: resourceRoutes.cartSetAdd,
                    }
                );

                // Track cart item add
                void analytics.trackCartItemAdd({
                    cartItems: productItems as ShopperBasketsV2.schemas['ProductItem'][],
                });
            } catch {
                setIsAddingToOrUpdatingCart(false);
                addToast(t('product:failedToAddItemsToCartError'), 'error');
            }
        },
        [
            product.id,
            isAddingToOrUpdatingCart,
            multipleItemsFetcher,
            addToast,
            analytics,
            t,
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            basket,
            pickupContext,
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        ]
    );

    // Handle product bundle add to cart
    const handleProductBundleAddToCart = useCallback(
        async (qty: number, childProductSelections: ProductSelectionValues[]) => {
            if (isAddingToOrUpdatingCart) return;

            // Validate inputs
            if (!product.id || qty <= 0 || !childProductSelections || childProductSelections.length === 0) {
                addToast(t('product:failedToAddBundleToCartError'), 'error');
                return;
            }

            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            const pickupInfo = pickupContext?.pickupBasketItems?.get(product.id);
            const bundleInventoryId = pickupInfo?.inventoryId ?? null;
            const bundleStoreId = pickupInfo?.storeId ?? null;

            // Opportunistic client-side validation: see handleAddToCart for rationale.
            if (!isSelectedDeliveryOptionValid(basket, bundleStoreId, addToast)) return;
            // @sfdc-extension-block-end SFDC_EXT_BOPIS

            setIsAddingToOrUpdatingCart(true);

            try {
                const bundleItem = {
                    productId: product.id,
                    quantity: qty,
                    price: product.price,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    inventoryId: bundleInventoryId,
                    // @sfdc-extension-line SFDC_EXT_BOPIS
                    storeId: bundleStoreId,
                };

                // Pass the full ProductSelectionValues[] structure instead of extracting just productId and quantity
                // This makes it clearer what type of entity we're dealing with (product, variant, standard, etc.)
                // Use server action to add bundle to cart
                await bundleFetcher.submit(
                    {
                        bundleItem: JSON.stringify(bundleItem),
                        childSelections: JSON.stringify(childProductSelections),
                    },
                    {
                        method: 'POST',
                        action: resourceRoutes.cartBundleAdd,
                    }
                );

                // Track cart item add
                void analytics.trackCartItemAdd({
                    cartItems: [
                        bundleItem as ShopperBasketsV2.schemas['ProductItem'],
                        ...childProductSelections.map(
                            (sel) =>
                                ({
                                    product: sel.product as ShopperBasketsV2.schemas['ProductItem']['product'],
                                    quantity: sel.quantity,
                                }) as ShopperBasketsV2.schemas['ProductItem']
                        ),
                    ],
                });
            } catch {
                setIsAddingToOrUpdatingCart(false);
                addToast(t('product:failedToAddBundleToCartError'), 'error');
            }
        },
        [
            product,
            isAddingToOrUpdatingCart,
            bundleFetcher,
            addToast,
            analytics,
            t,
            // @sfdc-extension-block-start SFDC_EXT_BOPIS
            basket,
            pickupContext,
            // @sfdc-extension-block-end SFDC_EXT_BOPIS
        ]
    );

    // Handle product bundle update (quantity and/or child variants)
    const handleUpdateBundle = useCallback(
        async (bundleQuantity: number, childProductSelections: ProductSelectionValues[]) => {
            if (isAddingToOrUpdatingCart || !canAddToCart || !itemId) return;

            // Validate inputs
            if (!product.id || bundleQuantity <= 0 || !childProductSelections || childProductSelections.length === 0) {
                addToast(t('product:failedToUpdateBundleToCartError'), 'error');
                return;
            }

            setIsAddingToOrUpdatingCart(true);

            try {
                // Find the current bundle item in the basket
                const currentBundleItem = basketProductItems.find((item) => item.itemId === itemId) || {};

                if (!currentBundleItem?.bundledProductItems) {
                    setIsAddingToOrUpdatingCart(false);
                    return;
                }

                const itemsToBeUpdated: Array<{ itemId: string; productId: string; quantity: number }> = [];

                // Check each bundled child product to see if it needs updating
                currentBundleItem.bundledProductItems.forEach((bundleChild) => {
                    const childSelection = childProductSelections.find(
                        (childProduct) =>
                            childProduct.product?.id === bundleChild.productId ||
                            childProduct.product?.id === bundleChild.productId
                    );

                    const selectedProductId = childSelection?.variant?.productId || childSelection?.product?.id;

                    // Only update the item if the selected product is different from what's in the current bundle
                    if (childSelection && selectedProductId && selectedProductId !== bundleChild.productId) {
                        itemsToBeUpdated.push({
                            itemId: bundleChild.itemId || '',
                            productId: selectedProductId,
                            quantity: childSelection.quantity ?? bundleChild.quantity ?? 1,
                        });
                    }
                });

                // Update the parent bundle when the quantity changes
                // Since top level bundles don't have variants
                if (currentBundleItem.quantity !== bundleQuantity) {
                    itemsToBeUpdated.unshift({
                        itemId,
                        productId: currentBundleItem.productId || product.id || '',
                        quantity: bundleQuantity,
                    });
                }

                // Only make API call if there are items to update
                if (itemsToBeUpdated.length > 0) {
                    await bundleFetcher.submit(
                        { items: JSON.stringify(itemsToBeUpdated) },
                        {
                            method: 'PATCH',
                            action: resourceRoutes.cartBundleUpdate,
                        }
                    );
                } else {
                    // No changes detected, just close the modal
                    setIsAddingToOrUpdatingCart(false);
                }
            } catch {
                setIsAddingToOrUpdatingCart(false);
                addToast(t('product:failedToUpdateBundleToCartError'), 'error');
            }
        },
        // eslint complains about bundleFetcher and addToast missing from deps, these instances are not likely to change
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [product, isAddingToOrUpdatingCart, itemId, basketProductItems]
    );

    // Handle updating cart item (variant and/or quantity)
    const handleUpdateCart = useCallback(async () => {
        if (isAddingToOrUpdatingCart || !canAddToCart || !itemId) return;

        const productToUpdate = isMasterOrVariantProduct ? currentVariant : product;
        const selectedProductId = getProductId(productToUpdate);
        // Validate inputs
        if (!selectedProductId || quantity <= 0) {
            addToast(t('product:failedToUpdateItemToCart'), 'error');
            return;
        }

        setIsAddingToOrUpdatingCart(true);

        try {
            // Check if the selected variant already exists in the basket
            const existingItemWithSameVariant = basketProductItems.find(
                (item) => item.productId === selectedProductId && item.itemId !== itemId
            );

            const currentItem = basketProductItems.find((item) => item.itemId === itemId);
            const existingProductId = currentItem?.productId;

            // Case 1: User is only changing quantity (same variant)
            // Only send itemId and quantity (productId not needed for quantity-only updates)
            if (selectedProductId === existingProductId) {
                const updateFormData = new FormData();
                updateFormData.append('itemId', itemId);
                updateFormData.append('quantity', quantity.toString());
                await cartFetcher.submit(updateFormData, {
                    method: 'PATCH',
                    action: resourceRoutes.cartItemUpdate,
                });
            }
            // Case 2: User is selecting a different variant that already exists in basket
            // Remove current item and update the existing variant's quantity
            else if (existingItemWithSameVariant?.itemId) {
                // First remove the current item
                const removeFormData = new FormData();
                removeFormData.append('itemId', itemId);
                await cartFetcher.submit(removeFormData, {
                    method: 'POST',
                    action: resourceRoutes.cartItemRemove,
                });
                // Check if remove succeeded
                if (cartFetcher.data?.success === false) {
                    throw new Error(t('product:failedToRemoveItem'));
                }

                // Then update the existing variant's quantity
                const newQuantity = (existingItemWithSameVariant.quantity || 0) + quantity;
                const updateFormData = new FormData();
                updateFormData.append('itemId', existingItemWithSameVariant.itemId);
                updateFormData.append('productId', selectedProductId);
                updateFormData.append('quantity', newQuantity.toString());
                await cartFetcher.submit(updateFormData, {
                    method: 'PATCH',
                    action: resourceRoutes.cartItemUpdate,
                });

                // Check if update succeeded, if not, restore the removed item
                if (cartFetcher.data?.success === false) {
                    // Restore the removed item
                    const restoreFormData = new FormData();
                    restoreFormData.append(
                        'productItem',
                        JSON.stringify({
                            productId: currentItem?.productId,
                            quantity: currentItem?.quantity,
                            price: currentItem?.price,
                        })
                    );
                    await cartFetcher.submit(restoreFormData, {
                        method: 'POST',
                        action: resourceRoutes.cartItemAdd,
                    });
                    throw new Error(t('product:failedToUpdateItemQuantity'));
                }
            }
            // Case 3: User is selecting a different variant that doesn't exist in basket
            // Update current item with new variant
            else {
                const updateFormData = new FormData();
                updateFormData.append('itemId', itemId);
                updateFormData.append('productId', selectedProductId);
                updateFormData.append('quantity', quantity.toString());
                await cartFetcher.submit(updateFormData, {
                    method: 'PATCH',
                    action: resourceRoutes.cartItemUpdate,
                });
            }
        } catch (error) {
            setIsAddingToOrUpdatingCart(false);
            const errorMessage = error instanceof Error ? error.message : t('product:failedToUpdateItemToCart');
            addToast(errorMessage, 'error');
        }
        // eslint complains about cartFetcher and addToast missing from deps, these instances are not likely to change
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [
        product,
        quantity,
        isMasterOrVariantProduct,
        currentVariant,
        isAddingToOrUpdatingCart,
        canAddToCart,
        itemId,
        // oxlint-disable-next-line react/exhaustive-deps -- oxlint dependency analysis is stricter than eslint-plugin-react-hooks here
        basketProductItems,
    ]);

    return {
        // State
        /** Indicates if any add-to-cart operation is currently in progress */
        isAddingToOrUpdatingCart:
            isAddingToOrUpdatingCart ||
            cartFetcher.state === 'submitting' ||
            multipleItemsFetcher.state === 'submitting' ||
            bundleFetcher.state === 'submitting',
        /** Current quantity selected for the product */
        quantity,
        /** Maximum quantity allowed (for bonus products, etc.) */
        maxQuantity,

        // Validation and inventory
        /**
         * The resolved variant this hook validated against (the controlled variant
         * passed to ProductViewProvider, or the URL-derived one). Exposed so
         * consumers gate "select all options" messaging on the SAME variant that
         * drives `canAddToCart` — otherwise a separately-derived variant can
         * disagree with the button's enabled state (e.g. in the Quick Add modal).
         */
        currentVariant,
        /** Determines if the product can be added to cart based on validation criteria */
        canAddToCart,
        /** Indicates if the product is currently in stock */
        isInStock,
        /** Convenience boolean - opposite of isInStock */
        isOutOfStock,
        /**
         * Indicates if the current selection is orderable based purely on inventory
         * (orderable or backorderable), independent of variant selection, quantity, etc.
         * Use this to render an "Out of stock" state separately from `canAddToCart`.
         */
        isOrderable,
        /** Indicates if the current quantity selection cannot be fulfilled due to insufficient stock */
        unfulfillable,
        /** Indicates if the product is a master or variant product (has variation attributes like size, color, etc.) */
        isMasterOrVariantProduct,
        /** Actual available stock level for the product */
        stockLevel: actualStockLevel,

        // Actions
        /** Adds the current product/variant to cart using the selected quantity. No parameters needed - the hook manages all state internally. */
        handleAddToCart,
        /** Updates an existing cart item with new variant and/or quantity */
        handleUpdateCart,
        /** Adds a product to the wishlist (placeholder implementation) */
        handleAddToWishlist,
        /** Adds multiple products from a product set to the cart simultaneously */
        handleProductSetAddToCart,
        /** Adds a product bundle (parent + child products) to the cart */
        handleProductBundleAddToCart,
        /** Updates an existing bundle item with new quantity and/or child variants */
        handleUpdateBundle,
        /** Updates the selected quantity for the product */
        setQuantity,

        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        // BOPIS: Pickup actions
        /** Pickup store for this basket item if it's set for pickup, undefined otherwise */
        basketPickupStore,
        /** Map of productId to {inventoryId, storeId} for items marked for store pickup */
        pickupBasketItems: pickupContext?.pickupBasketItems,
        /** Marks a product for store pickup by adding it to the pickup map */
        addItem: pickupContext?.addItem,
        /** Removes a product from store pickup by removing it from the pickup map */
        removeItem: pickupContext?.removeItem,
        /** Clears all pickup items from the pickup map */
        clearItems: pickupContext?.clearItems,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    };
}
