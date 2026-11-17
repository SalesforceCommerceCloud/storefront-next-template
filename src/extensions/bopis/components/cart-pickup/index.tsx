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
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { isNativeStoreSelectionEnabled } from '@/lib/shopper-context/store-selection';
import { useTranslation, Trans } from 'react-i18next';
import type { ShopperStores } from '@/scapi';
import { Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/typography';
import StoreAddress from '@/extensions/store-locator/components/store-locator/address';
import type { PickupContext } from '@/extensions/store-locator/stores/store-locator-store';
import { useConfirmedPickupStore } from '@/extensions/bopis/components/use-confirmed-pickup-store';

interface CartPickupProps {
    /** Store object containing store information */
    store: ShopperStores.schemas['Store'];
    /** Total unit quantity in this pickup group (same basis as delivery heading). */
    pickupCount: number;
    /** Total unit quantity in the basket (pickup + delivery) for “out of” copy. */
    totalCount: number;
    /**
     * The line item being collected, passed to the store locator when "Change Store" opens it so a
     * consumer that scopes the store list by inventory (e.g. the luxury boutique picker) can pre-disable
     * boutiques that don't stock the item. Omitted when the pickup group holds more than one line item —
     * a single-product availability signal would be misleading for a mixed group.
     */
    pickupContext?: PickupContext;
}

/**
 * CartPickup
 *
 * Displays store information for pickup orders on the cart page.
 * Shows store name and address. Provides a "Change Store"
 * button that opens the store locator.
 *
 * @param store - Store object returned by Shopper Stores API
 * @param pickupCount - Total unit quantity for this pickup section
 * @param totalCount - Total unit quantity in the basket
 * @returns ReactElement
 *
 * @example
 * <CartPickup store={store} pickupCount={2} totalCount={5} />
 */
export default function CartPickup({ store, pickupCount, totalCount, pickupContext }: CartPickupProps): ReactElement {
    const { t } = useTranslation('extBopis');
    const nativeStoreContextEnabled = isNativeStoreSelectionEnabled(useConfig().features.shopperContext);
    const handleChangeStoreClick = useConfirmedPickupStore(
        'cart',
        store.id ? { ...store, id: store.id } : null,
        pickupContext
    );

    return (
        <div className="pb-4" data-testid="cart-pickup-card">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                    {/* Store Icon and Pickup Label */}
                    <div className="flex items-center gap-2">
                        <Store className="size-4 shrink-0" aria-hidden />
                        <Typography variant="h5" as="h2" className="leading-none font-normal">
                            <Trans
                                ns="extBopis"
                                i18nKey="cart.pickupStoreInfo.pickupHeadingWithCounts"
                                count={totalCount}
                                values={{
                                    storeName: store.name ?? store.id ?? '',
                                    pickupCount,
                                    count: totalCount,
                                }}
                                components={[<span className="font-semibold" key="pickup-store-name" />]}
                            />
                        </Typography>
                    </div>

                    {/* Store Address */}
                    <div className="ml-7">
                        <Typography variant="muted" as="div" className="text-sm">
                            <StoreAddress store={store} />
                        </Typography>
                    </div>
                </div>

                {/* Change Store Button */}
                <Button variant="outline" onClick={handleChangeStoreClick} disabled={nativeStoreContextEnabled}>
                    {t('cart.pickupStoreInfo.changeStore')}
                </Button>
            </div>
        </div>
    );
}
