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
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import { useTranslation } from 'react-i18next';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useProductImages } from '@/hooks/product/use-product-images';
import { isProductBundle, isProductSet } from '@/lib/product/product-utils';
import { CartItemModalView } from './view';
import type { CartItemModalProps } from './types';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { usePickup } from '@/extensions/bopis/context/pickup-context';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

type Product = ShopperProducts.schemas['Product'];

interface CartItemModalEditContainerProps extends CartItemModalProps {
    product: Product;
    itemId: string;
}

export function CartItemModalEditContainer({
    product,
    itemId,
    onOpenChange,
    initialQuantity = 1,
    onBuyNow,
    open = false,
}: CartItemModalEditContainerProps): ReactElement {
    const { t } = useTranslation('editItem');

    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const pickupContext = usePickup();
    const pickupInfo = pickupContext?.pickupBasketItems?.get(product.id ?? '');
    const inventoryIds = pickupInfo?.inventoryId ? [pickupInfo.inventoryId] : undefined;
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const productId = product.id ?? '';

    const [variationValues, setVariationValues] = useState<Record<string, string>>(product.variationValues ?? {});

    useEffect(() => {
        if (open) {
            setVariationValues(product.variationValues ?? {});
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const isProductASet = isProductSet(product);
    const isProductABundle = isProductBundle(product);
    // Only master products require variants for the edit modal to function.
    // Standard, bundle, and set products don't need variant selection.
    const hasError = !!product.type?.master && !product.variants;

    const matchingVariant = useMemo(() => {
        if (!product.variants) return undefined;
        return product.variants.find((variant) =>
            Object.keys(variationValues).every((key) => variant.variationValues?.[key] === variationValues[key])
        );
    }, [product, variationValues]);

    const variantProductId = matchingVariant?.productId;
    const needsVariantFetch = !!variantProductId && variantProductId !== productId;

    const variantFetcher = useScapiFetcher('shopperProducts', 'getProduct', {
        params: {
            path: { id: needsVariantFetch ? variantProductId : '' },
            query: {
                allImages: true,
                expand: ['availability', 'images', 'prices', 'promotions'],
                // @sfdc-extension-block-start SFDC_EXT_BOPIS
                ...(inventoryIds ? { inventoryIds } : {}),
                // @sfdc-extension-block-end SFDC_EXT_BOPIS
            },
        },
    });

    useEffect(() => {
        if (
            open &&
            needsVariantFetch &&
            variantFetcher.state === 'idle' &&
            !variantFetcher.errors &&
            variantFetcher.data?.id !== variantProductId
        ) {
            void variantFetcher.load();
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [
        open,
        needsVariantFetch,
        variantFetcher.state,
        variantFetcher.errors,
        variantFetcher.data?.id,
        variantProductId,
    ]);

    const variantData =
        needsVariantFetch && variantFetcher.data?.id === variantProductId ? variantFetcher.data : undefined;

    const currentProduct: Product = useMemo(() => {
        if (!variantData) return product;
        return {
            ...product,
            ...variantData,
            id: product.id,
            variants: product.variants,
            variationAttributes: product.variationAttributes,
        };
    }, [product, variantData]);

    const handleAttributeChange = useCallback((attributeId: string, value: string) => {
        setVariationValues((prev) => {
            if (prev[attributeId] === value) return prev;
            return { ...prev, [attributeId]: value };
        });
    }, []);

    const { galleryImages } = useProductImages({ product: currentProduct, selectedAttributes: variationValues });

    const handleCloseModal = useCallback(() => {
        onOpenChange?.(false);
    }, [onOpenChange]);

    return (
        <CartItemModalView
            open={open}
            onOpenChange={onOpenChange}
            dialogTitle={t('title')}
            // The product prop comes fully expanded from the cart loader (getProducts returns all
            // expand fields by default), so it's always available synchronously — no async fetch needed.
            // Therefore, isLoading is always false.
            isLoading={false}
            hasError={hasError}
            retryLabel={t('retry')}
            loadingLabel={t('loadingProduct')}
            loadErrorLabel={t('loadError')}
            mode="edit"
            currentProduct={currentProduct}
            initialQuantity={initialQuantity}
            itemId={itemId}
            matchingVariant={matchingVariant}
            variationValues={variationValues}
            onAttributeChange={handleAttributeChange}
            galleryImages={galleryImages}
            isProductASet={isProductASet}
            isProductABundle={isProductABundle}
            onBeforeCartAction={handleCloseModal}
            onBuyNow={onBuyNow}
        />
    );
}
