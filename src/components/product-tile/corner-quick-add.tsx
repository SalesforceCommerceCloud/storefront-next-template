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
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShopperProducts } from '@/scapi';
import ConnectedInlineAddToCart from '@/components/inline-add-to-cart/connected';
import { useScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { useProductActions } from '@/hooks/product/use-product-actions';
import { useToast } from '@/components/toast';
import { useTranslation } from 'react-i18next';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { getEffectiveStockLevel } from '@/lib/product/inventory-utils';
// @sfdc-extension-line SFDC_EXT_BOPIS
import { FULFILLMENT_OPTION_IDS } from '@/components/fulfillment/types';

type Product = ShopperProducts.schemas['Product'];

/** Only choice-free, single-unit products can skip the existing Quick Add dialog. */
function canAddDirectly(product: Product): boolean {
    return Boolean(
        product.type?.item &&
            !product.type?.master &&
            !product.type?.variant &&
            !product.type?.set &&
            !product.type?.bundle &&
            !product.options?.length &&
            !product.variationAttributes?.length &&
            (product.minOrderQuantity ?? 1) === 1 &&
            (product.stepQuantity ?? 1) === 1
    );
}

/** Execute interaction-driven first adds without replacing the focused quantity control. */
function CornerAddRequest({
    product,
    requestId,
    onComplete,
    onSelect,
}: {
    product: Product;
    requestId: number;
    onComplete: (requestId: number) => void;
    onSelect: () => void;
}) {
    const handledRequest = useRef(0);
    const [settledRequest, setSettledRequest] = useState(0);
    const { handleAddToCart, canAddToCart, isAddingToOrUpdatingCart } = useProductActions({
        product,
        openMiniCartOnAdd: false,
        // Explicit ship-to-home matches the quantity hook's default shipment.
        // @sfdc-extension-line SFDC_EXT_BOPIS
        initialFulfillmentSelection: { optionId: FULFILLMENT_OPTION_IDS.DELIVERY },
    });
    useEffect(() => {
        if (requestId <= handledRequest.current) return;
        handledRequest.current = requestId;
        if (canAddDirectly(product) && canAddToCart) {
            void handleAddToCart().finally(() => setSettledRequest(requestId));
        } else {
            onComplete(requestId);
            onSelect();
        }
    }, [product, requestId, canAddToCart, handleAddToCart, onComplete, onSelect]);
    useEffect(() => {
        // The hook publishes the returned basket before releasing its pending state.
        // Wait for that publication before the tile changes from Add to its stepper.
        if (settledRequest > 0 && !isAddingToOrUpdatingCart) onComplete(settledRequest);
    }, [settledRequest, isAddingToOrUpdatingCart, onComplete]);
    return null;
}

/** Shares the PDP basket control; catalog details load on the first add interaction. */
export function CornerQuickAdd({
    productId,
    productName,
    onSelect,
    disabled,
}: {
    productId: string;
    productName: string;
    disabled?: boolean;
    onSelect: (trigger: HTMLElement | null) => void;
}) {
    const triggerRef = useRef<HTMLElement | null>(null);
    const select = useCallback(() => onSelect(triggerRef.current), [onSelect]);
    const [requestId, setRequestId] = useState(0);
    const [completedRequest, setCompletedRequest] = useState(0);
    const pending = requestId > completedRequest;
    const complete = useCallback((id: number) => setCompletedRequest(id), []);
    const { addToast } = useToast();
    const { t } = useTranslation('product');
    const { currency } = useSite();
    const productFetcher = useScapiFetcher('shopperProducts', 'getProduct', {
        params: {
            path: { id: productId },
            query: { currency, expand: ['availability', 'prices', 'variations', 'options'] },
        },
    });
    const fetcherRef = useRef(productFetcher);
    fetcherRef.current = productFetcher;
    const add = useCallback(() => {
        triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRequestId((id) => id + 1);
        void fetcherRef.current.load();
    }, []);
    const product = productFetcher.success ? productFetcher.data : undefined;
    const direct = product ? canAddDirectly(product) : true;
    useEffect(() => {
        if (pending && productFetcher.state === 'idle' && productFetcher.errors) {
            complete(requestId);
            addToast(t('failedToAddProductToCart'), 'error');
        }
    }, [pending, requestId, productFetcher.state, productFetcher.errors, complete, addToast, t]);
    return (
        <>
            <ConnectedInlineAddToCart
                variant="compact"
                disabled={disabled}
                productId={direct ? productId : undefined}
                productName={productName}
                stockLevel={product && direct ? getEffectiveStockLevel({ product }) : undefined}
                loading={pending}
                onAdd={add}
            />
            {/* Each add owns a fresh mutation fetcher, so a previous response cannot settle a new request. */}
            {pending && product && (
                <CornerAddRequest
                    key={requestId}
                    product={product}
                    requestId={productFetcher.state === 'idle' ? requestId : 0}
                    onComplete={complete}
                    onSelect={select}
                />
            )}
        </>
    );
}
