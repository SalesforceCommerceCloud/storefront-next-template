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
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useProductImages } from '@/hooks/product/use-product-images';
import { isProductBundle, isProductSet } from '@/lib/product/product-utils';
import { computeInitialVariationValues } from '@/lib/product/initial-variation-values';
import { CartItemModalView } from './view';
import type { CartItemModalProps } from './types';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

interface CartItemModalAddContainerProps extends CartItemModalProps {
    productId: string;
}

type Product = ShopperProducts.schemas['Product'];

export function CartItemModalAddContainer({
    productId,
    onOpenChange,
    initialQuantity = 1,
    initialVariantSelections,
    onBuyNow,
    open = false,
}: CartItemModalAddContainerProps): ReactElement {
    const { t } = useTranslation('editItem');
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const selectedStoreInventoryId = useStoreLocator((state) => state.selectedStoreInfo?.inventoryId);
    const inventoryIds = selectedStoreInventoryId ? [selectedStoreInventoryId] : undefined;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const [variationValues, setVariationValues] = useState<Record<string, string>>({});
    const [variantInventoryCache, setVariantInventoryCache] = useState<Record<string, Product>>({});
    const loadedVariantCacheKeysRef = useRef(new Set<string>());

    const initialProductFetcher = useScapiFetcher('shopperProducts', 'getProduct', {
        params: {
            path: { id: productId },
            query: {
                allImages: true,
                expand: [
                    'variations',
                    'availability',
                    'images',
                    'prices',
                    'promotions',
                    'set_products',
                    'bundled_products',
                ],
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                ...(inventoryIds ? { inventoryIds } : {}),
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            },
        },
    });

    // Auto-load when the modal opens and we don't yet have data. Gated on `!errors` so a
    // sticky failure doesn't loop SCAPI calls — at the cost that a transient failure won't
    // auto-retry on reopen (user must click the Retry button). Per-open-session retry is
    // tracked as a follow-up.
    useEffect(() => {
        if (
            open &&
            initialProductFetcher.state === 'idle' &&
            !initialProductFetcher.success &&
            !initialProductFetcher.errors
        ) {
            void initialProductFetcher.load();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialProductFetcher.state, initialProductFetcher.success, initialProductFetcher.errors]);

    const baseProduct: Product | null = (initialProductFetcher.success && initialProductFetcher.data) || null;

    // Seed variation values when the product first loads or when the modal reopens.
    // On first open: baseProduct arrives async (after fetch) → seeds then.
    // On reopen: baseProduct is already cached by the fetcher → seeds immediately.
    useEffect(() => {
        if (open && baseProduct) {
            setVariationValues({
                ...computeInitialVariationValues(baseProduct),
                ...(initialVariantSelections ?? {}),
            });
            setVariantInventoryCache({});
            loadedVariantCacheKeysRef.current.clear();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open, baseProduct]);

    const matchingVariant = useMemo(() => {
        if (!baseProduct) return undefined;
        const potentialVariants =
            baseProduct.variants?.filter((variant) =>
                Object.keys(variationValues).every((key) => variant.variationValues?.[key] === variationValues[key])
            ) ?? [];
        return potentialVariants.length === 1 ? potentialVariants[0] : undefined;
    }, [baseProduct, variationValues]);

    const selectedVariantId = matchingVariant?.productId;
    let variantCacheKey = selectedVariantId;
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (selectedVariantId && selectedStoreInventoryId) {
        variantCacheKey = `${selectedVariantId}:${selectedStoreInventoryId}`;
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const cachedVariantProduct = variantCacheKey ? variantInventoryCache[variantCacheKey] : undefined;

    const variantFetcher = useScapiFetcher('shopperProducts', 'getProduct', {
        params: {
            path: { id: selectedVariantId || '' },
            query: {
                allImages: true,
                expand: [
                    'variations',
                    'availability',
                    'images',
                    'prices',
                    'promotions',
                    'set_products',
                    'bundled_products',
                ],
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                ...(inventoryIds ? { inventoryIds } : {}),
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            },
        },
    });

    const shouldFetchVariantInventory = open && !!selectedVariantId && !cachedVariantProduct;

    // Load variant inventory when needed. Gated on `!variantFetcher.errors` to avoid hammering
    // SCAPI on a sticky failure — at the cost that a transient failure leaves the variant in a
    // stuck loading state until the user picks a different variant or reopens. Per-session
    // retry is tracked as a follow-up.
    useEffect(() => {
        if (
            shouldFetchVariantInventory &&
            variantFetcher.state === 'idle' &&
            !variantFetcher.errors &&
            variantCacheKey &&
            !loadedVariantCacheKeysRef.current.has(variantCacheKey)
        ) {
            loadedVariantCacheKeysRef.current.add(variantCacheKey);
            void variantFetcher.load();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldFetchVariantInventory, variantFetcher.state, variantFetcher.errors, variantCacheKey]);

    // Cache variant inventory data when it arrives.
    useEffect(() => {
        if (
            variantFetcher.success &&
            variantFetcher.data &&
            variantFetcher.state === 'idle' &&
            variantFetcher.data.id === selectedVariantId
        ) {
            const fetchedProduct = variantFetcher.data;
            const cacheKey = variantCacheKey ?? fetchedProduct.id;
            setVariantInventoryCache((prev) => {
                const cached = prev[cacheKey];
                if (
                    cached?.inventory?.ats === fetchedProduct.inventory?.ats &&
                    cached?.inventory?.orderable === fetchedProduct.inventory?.orderable &&
                    cached?.inventory?.backorderable === fetchedProduct.inventory?.backorderable &&
                    cached?.inventory?.preorderable === fetchedProduct.inventory?.preorderable &&
                    cached?.inventories === fetchedProduct.inventories
                ) {
                    return prev;
                }
                return { ...prev, [cacheKey]: fetchedProduct };
            });
        }
    }, [variantFetcher.success, variantFetcher.data, variantFetcher.state, selectedVariantId, variantCacheKey]);

    const effectiveMatchingVariant = useMemo(() => {
        if (!matchingVariant) return undefined;
        if (!cachedVariantProduct || cachedVariantProduct.id !== matchingVariant.productId) {
            return matchingVariant;
        }

        return {
            ...matchingVariant,
            price: cachedVariantProduct.price,
            priceMax: cachedVariantProduct.priceMax,
            priceMin: cachedVariantProduct.priceMin,
            tieredPrices: cachedVariantProduct.tieredPrices,
            productPromotions: cachedVariantProduct.productPromotions,
            inventory: cachedVariantProduct.inventory,
            inventories: cachedVariantProduct.inventories,
            orderable: cachedVariantProduct.inventory?.orderable ?? matchingVariant.orderable,
        };
    }, [matchingVariant, cachedVariantProduct]);

    const isVariantInventoryLoading = shouldFetchVariantInventory;

    const handleAttributeChange = useCallback((attributeId: string, value: string) => {
        setVariationValues((prev) => {
            if (prev[attributeId] === value) return prev;
            return { ...prev, [attributeId]: value };
        });
    }, []);

    const currentProduct = baseProduct;
    const safeProduct = currentProduct ?? ({} as Product);
    const { galleryImages } = useProductImages({ product: safeProduct, selectedAttributes: variationValues });

    const isProductASet = currentProduct ? isProductSet(currentProduct) : false;
    const isProductABundle = currentProduct ? isProductBundle(currentProduct) : false;

    const isLoading = !currentProduct && initialProductFetcher.state !== 'idle';
    const hasError =
        !currentProduct &&
        initialProductFetcher.state === 'idle' &&
        !initialProductFetcher.success &&
        initialProductFetcher.errors != null;

    const handleCloseModal = useCallback(() => {
        onOpenChange?.(false);
    }, [onOpenChange]);
    const handleRetry = useCallback(() => {
        void initialProductFetcher.load();
    }, [initialProductFetcher]);
    const viewDetailsHref = useMemo(() => {
        const baseProductId = currentProduct?.id ?? productId;
        const params = new URLSearchParams();
        Object.entries(variationValues).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            }
        });
        if (selectedVariantId) {
            params.set('pid', selectedVariantId);
        }
        const search = params.toString();
        return search ? `/product/${baseProductId}?${search}` : `/product/${baseProductId}`;
    }, [currentProduct?.id, productId, variationValues, selectedVariantId]);

    return (
        <CartItemModalView
            open={open}
            onOpenChange={onOpenChange}
            dialogTitle={t('quickAddTitle')}
            isLoading={isLoading}
            hasError={hasError}
            onRetry={handleRetry}
            retryLabel={t('retry')}
            loadingLabel={t('loadingProduct')}
            loadErrorLabel={t('loadError')}
            mode="add"
            currentProduct={currentProduct}
            initialQuantity={initialQuantity}
            matchingVariant={effectiveMatchingVariant}
            isVariantInventoryLoading={isVariantInventoryLoading}
            variationValues={variationValues}
            onAttributeChange={handleAttributeChange}
            galleryImages={galleryImages}
            isProductASet={isProductASet}
            isProductABundle={isProductABundle}
            onBeforeCartAction={handleCloseModal}
            onBuyNow={onBuyNow}
            viewDetailsHref={viewDetailsHref}
        />
    );
}
