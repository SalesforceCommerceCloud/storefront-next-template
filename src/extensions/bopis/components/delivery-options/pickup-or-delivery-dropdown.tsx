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
import { DELIVERY_OPTIONS, type DeliveryOption } from '@/extensions/bopis/constants';
import { useTranslation } from 'react-i18next';
import { Store, ShoppingCart } from 'lucide-react';
import { FulfillmentOptionDropdown } from '@/components/fulfillment/fulfillment-option-dropdown';
export interface PickupOrDeliveryDropdownProps {
    value: DeliveryOption;
    onChange: (v: DeliveryOption) => void;
    isPickupDisabled?: boolean;
    isDeliveryDisabled?: boolean;
}

export default function PickupOrDeliveryDropdown({
    value,
    onChange,
    isPickupDisabled = false,
    isDeliveryDisabled = false,
}: PickupOrDeliveryDropdownProps) {
    const { t } = useTranslation('extBopis');
    const options = [
        {
            id: DELIVERY_OPTIONS.DELIVERY,
            order: 10,
            label: t('deliveryOptions.pickupOrDelivery.delivery'),
            menuLabel: t('deliveryOptions.pickupOrDelivery.shipToAddress'),
            availability: { available: !isDeliveryDisabled },
        },
        {
            id: DELIVERY_OPTIONS.PICKUP,
            order: 20,
            label: t('deliveryOptions.pickupOrDelivery.storePickupLabel'),
            menuLabel: t('deliveryOptions.pickupOrDelivery.storePickup'),
            availability: { available: !isPickupDisabled },
        },
    ];

    return (
        <FulfillmentOptionDropdown
            value={value}
            options={options}
            onChange={onChange}
            renderIcon={(option) =>
                option.id === DELIVERY_OPTIONS.PICKUP ? (
                    <Store className="size-3" />
                ) : (
                    <ShoppingCart className="size-3" />
                )
            }
        />
    );
}
