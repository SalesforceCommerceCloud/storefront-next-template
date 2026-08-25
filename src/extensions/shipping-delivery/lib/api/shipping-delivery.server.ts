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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */

import type { LoaderFunctionArgs } from 'react-router';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { createApiClients } from '@/lib/api-clients.server';
import { fetchProductById } from '@/lib/api/products.server';
import type { ShopperDeliveryEstimates, ShopperProducts } from '@/scapi';
import { getCountryCodeFromLocale } from '@/lib/shipping-estimate/postal-code-formats';
import type { ShippingEstimate, ShippingEstimateOption } from '@/lib/shipping-estimate/types';

const PICKUP_SHIPPING_METHOD_ID = '005';

export type { ShippingEstimate };

type DeliveryWindow = ShopperDeliveryEstimates.schemas['DeliveryWindow'];
type ScapiShippingOption = ShopperDeliveryEstimates.schemas['ShippingOption'];
type DeliveryEstimatesResult = ShopperDeliveryEstimates.schemas['DeliveryEstimatesResult'];
type ProductShippingMethod = NonNullable<ShopperProducts.schemas['Product']['shippingMethods']>[number] & {
    c_storePickupEnabled?: boolean;
};

/**
 * Returns the first merchant-authored delivery-method description available for a product.
 * The product API provides localized catalog descriptions but cannot calculate a
 * destination-specific date, so this is only used for selected Delivery Estimates failures.
 */
export async function getFallbackDeliveryDescription(
    context: LoaderFunctionArgs['context'],
    productId: string
): Promise<string | undefined> {
    try {
        const product = await fetchProductById(context, productId, { expand: ['shipping_methods'] });
        return product?.shippingMethods
            ?.find((method) => !isPickupShippingMethod(method) && method.description?.trim())
            ?.description?.trim();
    } catch {
        // The delivery-estimate response remains an unavailable result when catalog fallback lookup fails.
        return undefined;
    }
}

function isPickupShippingMethod(method: ProductShippingMethod): boolean {
    return method.c_storePickupEnabled === true || method.id === PICKUP_SHIPPING_METHOD_ID;
}

function toShippingEstimateOption(
    option: ScapiShippingOption & { deliveryWindow: DeliveryWindow }
): ShippingEstimateOption {
    return {
        shippingMethodId: option.shippingMethodId,
        ...(option.name ? { name: option.name } : {}),
        ...(option.description ? { description: option.description } : {}),
        ...(option.carrier ? { carrier: option.carrier } : {}),
        ...(option.price !== undefined ? { price: option.price } : {}),
        ...(option.currency ? { currency: option.currency } : {}),
        deliveryWindow: option.deliveryWindow,
        ...(option.orderCutoffAt ? { orderCutoffAt: option.orderCutoffAt } : {}),
    };
}

export function getEstimateCountryCode(context: LoaderFunctionArgs['context']): string {
    const localeId = context.get(siteContext)?.locale.id;
    return getCountryCodeFromLocale(localeId) ?? 'US';
}

// --- SCAPI Client ---

async function fetchDeliveryEstimates(
    context: LoaderFunctionArgs['context'],
    productId: string,
    postalCode: string,
    countryCode = getEstimateCountryCode(context)
): Promise<DeliveryEstimatesResult> {
    const clients = createApiClients(context);
    const { data } = await clients.shopperDeliveryEstimates.getDeliveryEstimates({
        params: {
            query: { productIds: [productId], postalCode, countryCode },
        },
    });
    return data;
}

/**
 * Fetches a shipping estimate for a product + ZIP code combination.
 * Called from the resource route when a shopper enters their ZIP code.
 * Returns null when SCAPI succeeds but has no deliverable options.
 * Throws on missing/invalid ZIP or upstream failures.
 */
export async function getShippingEstimates(
    context: LoaderFunctionArgs['context'],
    productId: string,
    zipcode: string,
    countryCode?: string
): Promise<ShippingEstimate | null> {
    if (!zipcode) {
        throw new Error('ZIP code is required');
    }

    const result = await fetchDeliveryEstimates(context, productId, zipcode, countryCode);
    const productEstimate = result.productDeliveryEstimates.find((estimate) => estimate.productId === productId);

    if (!productEstimate || productEstimate.shippingOptions.length === 0) {
        return null;
    }

    const deliverableOptions = productEstimate.shippingOptions.filter(
        (o): o is ScapiShippingOption & { deliveryWindow: DeliveryWindow } => !!o.deliveryWindow
    );

    if (deliverableOptions.length === 0) {
        return null;
    }

    const shippingOptions = deliverableOptions.map(toShippingEstimateOption).sort((a, b) => {
        if (a.price !== undefined && b.price !== undefined) {
            const priceDiff = a.price - b.price;
            if (priceDiff !== 0) return priceDiff;
        } else if (a.price !== undefined) {
            return -1;
        } else if (b.price !== undefined) {
            return 1;
        }

        return new Date(a.deliveryWindow.endAt).getTime() - new Date(b.deliveryWindow.endAt).getTime();
    });

    return {
        shippingOptions,
        // The PDP summary represents the default option, not the span of every available method.
        deliveryWindow: shippingOptions[0].deliveryWindow,
    };
}
