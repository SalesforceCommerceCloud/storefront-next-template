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
import { getLogger } from '@/lib/logger.server';
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
// Exclude leap seconds and the RFC 3339 unknown-offset form so every accepted value is sortable and formatDeliveryWindow() can display it.
const DELIVERY_ESTIMATE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i;

type Rfc3339Timestamp = {
    epochSecond: number;
    fractionalSecond: string;
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

function parseRfc3339Timestamp(timestamp: string): Rfc3339Timestamp | null {
    const match = timestamp.match(DELIVERY_ESTIMATE_TIMESTAMP);
    if (!match) {
        return null;
    }

    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const fractionalSecond = match[7] ?? '';
    const offset = match[8].toUpperCase();
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = month === 2 ? (isLeapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;

    if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
        return null;
    }

    if (offset !== 'Z') {
        const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
        if (offset === '-00:00' || offsetHour > 23 || offsetMinute > 59) {
            return null;
        }
    }

    const epochSecond = Date.parse(timestamp.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/i, '')) / 1000;
    return Number.isFinite(epochSecond) ? { epochSecond, fractionalSecond } : null;
}

function compareFractionalSeconds(left: string, right: string): number {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftDigit = left[index] ?? '0';
        const rightDigit = right[index] ?? '0';
        if (leftDigit < rightDigit) return -1;
        if (leftDigit > rightDigit) return 1;
    }

    return 0;
}

function compareRfc3339Timestamps(left: string, right: string): number {
    const leftTimestamp = parseRfc3339Timestamp(left);
    const rightTimestamp = parseRfc3339Timestamp(right);
    if (!leftTimestamp || !rightTimestamp) {
        return 0;
    }

    const epochSecondDiff = leftTimestamp.epochSecond - rightTimestamp.epochSecond;
    return epochSecondDiff || compareFractionalSeconds(leftTimestamp.fractionalSecond, rightTimestamp.fractionalSecond);
}

function isValidDeliveryWindow(deliveryWindow: DeliveryWindow): boolean {
    const startAt = parseRfc3339Timestamp(deliveryWindow.startAt);
    const endAt = parseRfc3339Timestamp(deliveryWindow.endAt);
    return !!startAt && !!endAt && compareRfc3339Timestamps(deliveryWindow.startAt, deliveryWindow.endAt) <= 0;
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

    const optionsWithDeliveryWindows = productEstimate.shippingOptions.filter(
        (option): option is ScapiShippingOption & { deliveryWindow: DeliveryWindow } => !!option.deliveryWindow
    );
    const deliverableOptions = optionsWithDeliveryWindows.filter((option) =>
        isValidDeliveryWindow(option.deliveryWindow)
    );
    const invalidDeliveryWindowCount = optionsWithDeliveryWindows.length - deliverableOptions.length;

    if (optionsWithDeliveryWindows.length > 0 && deliverableOptions.length === 0) {
        getLogger(context).warn('ShippingEstimate: no valid delivery windows', { invalidDeliveryWindowCount });
    }

    if (deliverableOptions.length === 0) {
        return null;
    }

    const shippingOptions = deliverableOptions.map(toShippingEstimateOption).sort((a, b) => {
        const startAtDiff = compareRfc3339Timestamps(b.deliveryWindow.startAt, a.deliveryWindow.startAt);
        if (startAtDiff !== 0) return startAtDiff;

        const endAtDiff = compareRfc3339Timestamps(b.deliveryWindow.endAt, a.deliveryWindow.endAt);
        if (endAtDiff !== 0) return endAtDiff;

        if (a.shippingMethodId < b.shippingMethodId) return -1;
        if (a.shippingMethodId > b.shippingMethodId) return 1;
        return 0;
    });

    return {
        shippingOptions,
        // The PDP summary represents the temporary slowest display option, not the span of every method.
        deliveryWindow: shippingOptions[0].deliveryWindow,
    };
}
