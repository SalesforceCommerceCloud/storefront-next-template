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

export type DistanceUnit = 'KM' | 'MILES';
export type LeadTimeUnit = 'HOURS' | 'DAYS';

/** Availability of one product at one fulfillment location (PLP / PDP data). */
export interface LocationAvailability {
    fulfillmentLocationId: string;
    city: string;
    postalCode: string;
    stockLevel: number;
    distance: number;
    distanceUnit: DistanceUnit;
    /** `null` when the location cannot fulfill the product (stock 0). */
    leadTime: number | null;
    leadTimeUnit: LeadTimeUnit;
}

/** A product together with every location it can be fulfilled from. */
export interface ProductAvailability {
    productId: string;
    productName: string;
    sku: string;
    manufacturerSku?: string | null;
    brand?: string;
    category?: string | null;
    /** Variant ids belonging to this (master) product, used to resolve variant -> master. */
    variantIds: string[];
    availability: LocationAvailability[];
}

/** Fulfillment block stored with every cart item (browser storage + SCAPI payload). */
export interface CartFulfillment {
    locationId: string;
    city: string;
    postalCode: string;
    stockLevel: number;
    distance: number;
    distanceUnit: DistanceUnit;
    leadTime: number | null;
    leadTimeUnit: LeadTimeUnit;
}

export interface CartFulfillmentItem {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    fulfillment: CartFulfillment;
}

/** Shape persisted in browser storage. */
export interface CartFulfillmentState {
    cartItems: CartFulfillmentItem[];
}

/** Minimal basket line used to join basket data with fulfillment data. */
export interface BasketLine {
    productId: string;
    productName: string;
    quantity: number;
}

export interface DeliveryGroup {
    locationId: string;
    city: string;
    postalCode: string;
    items: CartFulfillmentItem[];
}

export interface FulfillmentPayloadItem {
    productId: string;
    sku: string;
    quantity: number;
    fulfillment: CartFulfillment;
}

export interface FulfillmentPayload {
    orderId: string;
    items: FulfillmentPayloadItem[];
}
