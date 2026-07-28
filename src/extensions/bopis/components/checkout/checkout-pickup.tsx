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
import { useMemo, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import AddressDisplay from '@/components/address-display';
import { orderAddressFromStoreAddress } from '@/extensions/bopis/lib/store-utils';
import { useTranslation } from 'react-i18next';
import { usePickup } from '@/extensions/bopis/context/pickup-context';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useChangePickupStore } from '@/extensions/bopis/hooks/use-change-pickup-store';
import { getFirstPickupStore, getPickupProductItemsForStore } from '@/extensions/bopis/lib/basket-utils';
import {
    getDisplayVariationValues,
    getEnrichedProducts,
    convertProductsByItemIdToProductId,
} from '@/lib/product/product-utils';
import { ProductItemVariantImage } from '@/components/product-item';
import CurrentPrice from '@/components/product-price/current-price';
import { getPriceData } from '@/components/product-price/utils';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';

/**
 * Props for the CheckoutPickup component.
 *
 * @interface CheckoutPickupProps
 * @property {ShopperBasketsV2.schemas['Basket']} cart - Current basket containing pickup items
 * @property {Record<string, ShopperProducts.schemas['Product']>} productsByItemId - Map of item IDs to product catalog data for enriching display
 * @property {boolean} isEditing - Whether the component is currently in editing mode
 * @property {() => void} onEdit - Callback function invoked when the user clicks to edit the pickup information
 */
interface CheckoutPickupProps {
    cart: ShopperBasketsV2.schemas['Basket'];
    productsByItemId?: Record<string, ShopperProducts.schemas['Product']>;
    isEditing: boolean;
    onEdit: () => void;
    onContinue: () => void;
    continueButtonLabel: string;
}

/**
 * CheckoutPickup Component
 *
 * A checkout step component that displays store pickup information including the pickup
 * store address, contact information, and a list of items that will be picked up at
 * that store. The component shows different content based on whether it's in editing
 * mode or summary mode.
 *
 * Features:
 * - Displays pickup store address and contact information (email, phone)
 * - Shows enriched product items with images, names, variations, quantities, and prices
 * - Supports edit mode to show detailed item information
 * - Automatically retrieves pickup store information from basket and pickup context
 * - Returns null if no pickup store information is available
 *
 * @param {CheckoutPickupProps} props - Component props
 * @param {ShopperBasketsV2.schemas['Basket']} props.cart - Current basket containing pickup items
 * @param {Record<string, ShopperProducts.schemas['Product']>} [props.productsByItemId] - Map of item IDs to product catalog data for enriching display
 * @param {boolean} props.isEditing - Whether the component is currently in editing mode
 * @param {() => void} props.onEdit - Callback function invoked when the user clicks to edit the pickup information
 *
 * @returns {React.JSX.Element | null} The rendered CheckoutPickup component, or null if no pickup store information is available
 *
 * @example
 * ```tsx
 * <CheckoutPickup
 *   cart={basket}
 *   productsByItemId={productMap}
 *   isEditing={false}
 *   onEdit={() => setEditing(true)}
 * />
 * ```
 */
export default function CheckoutPickup({
    cart,
    productsByItemId,
    isEditing,
    onEdit,
    onContinue,
    continueButtonLabel,
}: CheckoutPickupProps) {
    const { t } = useTranslation('checkout');
    const { t: tBopis } = useTranslation('extBopis');
    const pickupContext = usePickup();
    const store = getFirstPickupStore(cart, pickupContext?.pickupStores);
    // Get currency from context (automatically derived from locale)
    const { currency } = useSite();
    const openStoreLocator = useStoreLocator((s) => s.open);
    const setSelectedStoreInfoRaw = useStoreLocator((s) => s.setSelectedStoreInfo);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const isStoreLocatorOpen = useStoreLocator((s) => s.isOpen);
    const { changeStore } = useChangePickupStore();

    const handleChangePickupLocation = useCallback(() => {
        if (!store) return;
        setSelectedStoreInfoRaw(store);
        openStoreLocator();
    }, [store, setSelectedStoreInfoRaw, openStoreLocator]);

    useEffect(() => {
        if (
            selectedStoreInfo &&
            selectedStoreInfo.id !== store?.id &&
            selectedStoreInfo.inventoryId &&
            isStoreLocatorOpen
        ) {
            void changeStore(selectedStoreInfo);
        }
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStoreInfo?.id, selectedStoreInfo?.inventoryId, isStoreLocatorOpen, store?.id]);

    // Filter pickup items for the specific store and enrich with product catalog data
    // Skip expensive computation when not editing
    const enrichedPickupItems = useMemo(() => {
        if (!isEditing) return [];
        if (!store) {
            return [];
        }
        const productItems = getPickupProductItemsForStore(cart, store.id);
        if (productsByItemId && productItems) {
            const productsByProductId = convertProductsByItemIdToProductId(productsByItemId);
            return getEnrichedProducts(productsByProductId, productItems);
        }
        return productItems || [];
    }, [isEditing, cart, store, productsByItemId]);

    if (!store) return null;

    return (
        <Card className="rounded-2xl">
            <CardHeader className="pt-0 pb-0 flex items-center justify-between px-6">
                <Typography variant="h4" as="h2" className="text-sm font-semibold text-foreground">
                    {tBopis('checkout.pickUp.title')}
                </Typography>
                {!isEditing && (
                    <Button
                        variant="link"
                        size="sm"
                        onClick={onEdit}
                        className="ml-auto h-auto p-0 font-semibold align-middle">
                        {t('common.edit')}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="pt-0 pb-0">
                {isEditing ? (
                    <>
                        <Card className="border border-border bg-background">
                            <div className="px-6 pt-0 pb-0 flex items-center justify-between">
                                <Typography
                                    variant="h5"
                                    as="h3"
                                    className="text-sm font-semibold m-0 p-0 leading-tight mb-0"
                                    style={{ marginBottom: 0 }}>
                                    {tBopis('storePickup.pickupLocationTitle')}
                                </Typography>
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={handleChangePickupLocation}
                                    className="ml-auto h-auto p-0 text-muted-foreground hover:text-foreground font-normal">
                                    {tBopis('storePickup.changePickupLocation')}
                                </Button>
                            </div>
                            <CardContent className="pt-0 pb-6 px-6">
                                <div className="mt-0 mb-0">
                                    <div className="m-0 p-0" style={{ marginTop: 0, paddingTop: 0 }}>
                                        <AddressDisplay address={orderAddressFromStoreAddress(store)} />
                                    </div>
                                    {(store.email || store.phone) && (
                                        <Typography
                                            variant="muted"
                                            as="div"
                                            className="mt-0 mb-0 p-0"
                                            style={{ marginTop: 0 }}>
                                            {store.email}
                                            {store.email && store.phone ? ' - ' : ''}
                                            {store.phone}
                                        </Typography>
                                    )}
                                </div>
                                <div className="flex flex-col gap-6 mt-2">
                                    {enrichedPickupItems.map((productItem, idx) => {
                                        const quantity = productItem.quantity ?? 1;
                                        const displayVariationValues = getDisplayVariationValues(
                                            productItem?.variationAttributes as
                                                | ShopperProducts.schemas['VariationAttribute'][]
                                                | undefined,
                                            productItem?.variationValues as Record<string, string> | undefined
                                        );
                                        const priceData = getPriceData(
                                            productItem as ShopperProducts.schemas['Product'],
                                            {
                                                quantity,
                                            }
                                        );
                                        const currentPrice = priceData.currentPrice;
                                        return (
                                            <div key={productItem?.itemId || `item-${idx}`}>
                                                <div className="flex items-start gap-6 pb-6">
                                                    <ProductItemVariantImage
                                                        productItem={productItem}
                                                        className="w-28 h-28 rounded-xl"
                                                    />
                                                    <div className="flex-1">
                                                        <Typography
                                                            variant="h5"
                                                            as="div"
                                                            className="font-semibold text-sm mb-2">
                                                            {productItem?.productName}
                                                        </Typography>
                                                        <div className="space-y-1">
                                                            {Object.entries(displayVariationValues).map(
                                                                ([name, value]) => (
                                                                    <Typography variant="muted" as="div" key={name}>
                                                                        {name}: {value}
                                                                    </Typography>
                                                                )
                                                            )}
                                                            <Typography variant="muted" as="div">
                                                                Qty: {quantity}
                                                            </Typography>
                                                        </div>
                                                    </div>
                                                    <Typography
                                                        variant="h5"
                                                        as="div"
                                                        className="font-semibold text-sm ml-4 whitespace-nowrap">
                                                        <CurrentPrice
                                                            price={currentPrice}
                                                            currency={currency}
                                                            className="text-foreground text-sm font-semibold"
                                                        />
                                                    </Typography>
                                                </div>
                                                {idx < enrichedPickupItems.length - 1 && (
                                                    <div className="border-t border-border" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                        <div className="flex justify-end pt-6">
                            <Button
                                type="button"
                                size="lg"
                                className="min-w-56 h-12 text-base font-semibold"
                                onClick={onContinue}>
                                {continueButtonLabel}
                            </Button>
                        </div>
                    </>
                ) : (
                    <div className="px-1 pb-6">
                        <AddressDisplay address={orderAddressFromStoreAddress(store)} />
                        {(store.email || store.phone) && (
                            <Typography variant="muted" as="div">
                                {store.email}
                                {store.email && store.phone ? ' - ' : ''}
                                {store.phone}
                            </Typography>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
